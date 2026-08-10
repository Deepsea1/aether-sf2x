import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildDebatePrompt, DEBATE_JSON_SCHEMA } from '../../shared/sf2xDebate.js';
import { generateSignature, computeTrustworthyRate } from '../../shared/sf2xCore.js';

const VERIFIER_SCHEMA = {
  type: 'object',
  properties: {
    is_original_correct: { type: 'boolean' },
    corrected_answer: { type: 'string', description: 'The verified correct answer.' },
    key_corrections: { type: 'array', items: { type: 'string' } },
    verified_confidence: { type: 'number', description: '0-1 confidence in the verified answer.' },
  },
  required: ['corrected_answer'],
};

function buildVerifierPrompt(inquiry, answer, consensus, verdict, corrections, warrant) {
  const premises = (warrant?.premises || []).map((p, i) => `  ${i + 1}. ${p}`).join('\n') || '  (none recorded)';
  return `You are the SF2X Verifier. Produce the verified correct answer for this inquiry, reconciling the tribunal's findings.

Inquiry: """${inquiry?.prompt || ''}"""
Original answer: """${answer || ''}"""
Tribunal consensus: ${consensus}
Tribunal verdict: ${verdict || '—'}
Tribunal corrections: ${(corrections || []).join(' · ') || 'none'}
Prior premises to restate and re-validate:
${premises}

If the original answer is correct, return it (optionally tightened for precision). If not, produce the corrected answer that resolves every tribunal correction without introducing new unsupported claims. Ground the corrected answer in verifiable web evidence and explicitly restate the premises. Be precise and concise. Set verified_confidence 0-1.`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const reviewId = (body.review_id || '').toString().trim();
    if (!reviewId) return Response.json({ error: 'review_id is required' }, { status: 400 });

    const review = await svc.entities.Review.get(reviewId).catch(() => null);
    if (!review) return Response.json({ error: 'Review not found' }, { status: 404 });

    const av = await svc.entities.AnswerVersion.get(review.answer_version_id).catch(() => null);
    if (!av) return Response.json({ error: 'Answer version not found' }, { status: 404 });
    const inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);
    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);

    // Auto-run state machine: debate → verify → (if contested) re-test the
    // candidate it just produced, repeating until the tribunal reaches a
    // terminal verdict (agreed → APPROVE, rejected → KILL) or the round cap
    // is hit. Each round tests the current best answer text, so the loop
    // converges on an answer the tribunal agrees is warranted instead of
    // parking every contested item in a stuck "RE-RUN" state.
    const MAX_ROUNDS = 3;
    let currentAnswer = av.answer_text || '';
    let currentWarrant = warrant;
    let consensus = 'contested';
    let verdictText = '';
    let corrections = [];
    let confidence = 0;
    let correctedAnswer = '';
    let verifiedConfidence = currentWarrant?.confidence_score ?? 0.7;
    let isOriginalCorrect = false;
    let candidateVersionId = null;
    let candidateTrust = null;
    let roundsRun = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      roundsRun = round + 1;
      const debateRes = await svc.integrations.Core.InvokeLLM({
        prompt: buildDebatePrompt(inquiry?.prompt, currentAnswer, currentWarrant, inquiry?.domain, inquiry?.stakes_level),
        response_json_schema: DEBATE_JSON_SCHEMA,
        add_context_from_internet: true,
        model: 'gemini_3_1_pro',
      });
      const d = debateRes && debateRes.data ? debateRes.data : debateRes;
      consensus = d.consensus || 'contested';
      verdictText = d.verifier?.verdict || '';
      corrections = d.verifier?.corrections || [];
      confidence = d.verifier?.confidence ?? 0;

      const verRes = await svc.integrations.Core.InvokeLLM({
        prompt: buildVerifierPrompt(inquiry, currentAnswer, consensus, verdictText, corrections, currentWarrant),
        response_json_schema: VERIFIER_SCHEMA,
        add_context_from_internet: true,
        model: 'gemini_3_1_pro',
      });
      const v = verRes && verRes.data ? verRes.data : verRes;
      isOriginalCorrect = consensus === 'agreed' && v.is_original_correct !== false;
      correctedAnswer = (v.corrected_answer || '').trim();
      verifiedConfidence = v.verified_confidence ?? currentWarrant?.confidence_score ?? 0.7;

      // Terminal: tribunal agreed the answer is warranted → stop, no candidate needed.
      if (consensus === 'agreed') break;
      // Terminal: tribunal rejected → prepare the candidate and stop (KILL path).
      if (consensus === 'rejected') break;

      // Contested: persist the corrected candidate, then re-test IT next round
      // so the loop grinds toward an agreed answer rather than re-judging the
      // same flawed original. Only create a new version when the verifier
      // actually produced a distinct corrected answer.
      if (correctedAnswer && correctedAnswer !== currentAnswer.trim()) {
        const existing = await svc.entities.AnswerVersion.filter({ inquiry_id: av.inquiry_id }, 'version', 50);
        const version = (existing.length ? existing[existing.length - 1].version : 0) + 1;
        const metrics = {
          ...(av.metrics || {}),
          correction_rate: Math.min(1, (Number(av.metrics?.correction_rate) || 0) + 0.2),
        };
        const candAv = await svc.entities.AnswerVersion.create({
          inquiry_id: av.inquiry_id,
          version,
          answer_text: correctedAnswer,
          cognitive_state: { ...(av.cognitive_state || {}), source: 'verifier_repair', tribunal_consensus: consensus, round: round + 1 },
          metrics,
          trust_score: null,
          stakes_level: av.stakes_level || inquiry?.stakes_level || 'medium',
        });
        const key = secrets.get('sf2x_attestation_key');
        const content = [candAv.id, correctedAnswer, ''].join('|');
        const signed_hash = await generateSignature(content, key);
        const candWarrant = await svc.entities.Warrant.create({
          answer_version_id: candAv.id,
          premises: currentWarrant?.premises || [],
          conclusion: correctedAnswer.slice(0, 500),
          confidence_score: verifiedConfidence,
          validity_status: 'valid',
          sources: currentWarrant?.sources || [],
          expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
          signed_hash,
        });
        candidateTrust = computeTrustworthyRate(metrics, candWarrant);
        await svc.entities.AnswerVersion.update(candAv.id, { warrant_id: candWarrant.id, trust_score: candidateTrust });
        candidateVersionId = candAv.id;
        // Feed the corrected candidate back in as the next round's answer.
        currentAnswer = correctedAnswer;
        currentWarrant = candWarrant;
      } else {
        // No distinct correction produced — re-testing won't help; stop.
        break;
      }
    }

    // The auto-run loop already re-tests contested answers up to MAX_ROUNDS,
    // so the recommendation is always terminal: APPROVE (agreed) or KILL-SWITCH
    // (rejected OR still contested after the cap — the original isn't warranted).
    // No "RE-RUN" state is ever surfaced — it's already been re-run.
    const recommended =
      consensus === 'agreed'
        ? 'APPROVE — tribunal agreed the answer is warranted'
        : 'KILL-SWITCH — tribunal could not agree the original is warranted; candidate answer prepared for review';

    const verdict = {
      consensus,
      confidence,
      verifier_verdict: verdictText,
      corrections,
      is_original_correct: isOriginalCorrect,
      recommended_action: recommended,
      candidate_version_id: candidateVersionId,
      candidate_trust: candidateTrust,
      tested_at: new Date().toISOString(),
    };

    const summary = `Tribunal: ${consensus} (conf ${Math.round(confidence * 100)}%). Verifier: ${verdictText || '—'}. Corrections: ${corrections.length ? corrections.join(' · ') : 'none'}. ${candidateVersionId ? `Candidate answer prepared (trust ${candidateTrust}). ` : ''}Recommended: ${recommended}.`;

    await svc.entities.Review.update(reviewId, {
      decision: recommended,
      notes: summary,
      verdict,
      candidate_version_id: candidateVersionId,
    });
    await svc.entities.Inquiry.update(av.inquiry_id, { validated_answer: summary, status: 'review' }).catch(() => {});

    await svc.entities.AuditLog.create({
      event_type: 'gate_decision',
      entity_type: 'Review',
      entity_id: reviewId,
      summary: `Review auto-tested: ${consensus}${candidateVersionId ? ' · candidate prepared' : ''} · ${recommended}`,
      metadata: { consensus, confidence, candidate_version_id: candidateVersionId, review_id: reviewId },
    }).catch(() => {});

    return Response.json({
      prepared: true,
      review_id: reviewId,
      consensus,
      confidence,
      recommended,
      is_original_correct: isOriginalCorrect,
      candidate_version_id: candidateVersionId,
      candidate_trust: candidateTrust,
      verdict,
    });
  } catch (error) {
    console.error('prepareReview error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}