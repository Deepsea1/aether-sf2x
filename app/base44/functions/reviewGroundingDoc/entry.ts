import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

// Triggered by the Grounding Doc Review workflow when an AnswerVersion scores
// low trust. If the parent Inquiry used customer GroundingDocs, this creates a
// Review task, uses the TribunalLiftAudit assistant's analytical approach (via
// InvokeLLM — the in-app agent's tools don't cover document editing) to suggest
// concrete improvements to each doc, and emails the content owner the recommended
// edits for approval. No-ops when the inquiry used no grounding docs.

const LOW_TRUST = 50;
const DOC_CONTENT_CAP = 4000;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;
    const adminId = _auth.user?.id;

    const body = await req.json().catch(() => ({}));
    const answerVersionId = String(body.answer_version_id || '').trim();
    if (!answerVersionId) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    const av = await svc.entities.AnswerVersion.get(answerVersionId).catch(() => null);
    if (!av) return Response.json({ reviewed: false, reason: 'answer_version_not_found' });
    const trust = Number(av.trust_score) || 0;
    if (trust >= LOW_TRUST) return Response.json({ reviewed: false, reason: 'trust_not_low', trust_score: trust });

    const inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);
    if (!inquiry) return Response.json({ reviewed: false, reason: 'inquiry_not_found' });
    const docIds = Array.isArray(inquiry.grounding_doc_ids) ? inquiry.grounding_doc_ids.map(String).filter(Boolean) : [];
    if (!docIds.length) return Response.json({ reviewed: false, reason: 'no_grounding_docs' });

    const allDocs = await svc.entities.GroundingDoc.filter({ active: true }).catch(() => []);
    const wanted = new Set(docIds);
    const docs = (allDocs || []).filter((d) => wanted.has(String(d.id).trim()));
    if (!docs.length) return Response.json({ reviewed: false, reason: 'grounding_docs_not_found' });

    const warrant = av.warrant_id ? await svc.entities.Warrant.get(av.warrant_id).catch(() => null) : null;

    const ownerIds = [...new Set(docs.map((d) => d.created_by_id).filter(Boolean))];
    const users = ownerIds.length ? await svc.entities.User.list('-created_date', 500).catch(() => []) : [];
    const emailFor = (uid) => (users.find((u) => u.id === uid) || {}).email || '';

    const reviewed = [];
    for (const doc of docs) {
      const llmPrompt =
        `You are an epistemic audit assistant operating in the spirit of the Aether TribunalLiftAudit assistant. ` +
        `A customer grounding document was used to ground an AI inquiry, but the inquiry scored LOW trust (${trust}/100). ` +
        `Suggest concrete improvements to the document so future inquiries grounded in it score higher.\n\n` +
        `INQUIRY PROMPT:\n${(inquiry.prompt || '').slice(0, 1000)}\n\n` +
        `DOMAIN: ${inquiry.domain || 'general'} · STAKES: ${inquiry.stakes_level || 'medium'}\n` +
        `WARRANT VALIDITY: ${warrant?.validity_status || 'unknown'}\n` +
        `GROUNDING NOTES: ${warrant?.grounding_notes || '(none)'}\n\n` +
        `AI ANSWER (preview):\n${(av.answer_text || '').slice(0, 1200)}\n\n` +
        `GROUNDING DOCUMENT "${doc.name}" (domain: ${doc.domain || 'general'}):\n${String(doc.content || '').slice(0, DOC_CONTENT_CAP)}\n\n` +
        `Write 3-6 specific, actionable recommendations to improve this document: what's missing, outdated, ` +
        `ambiguous, or non-authoritative; what to add, correct, cite, or restructure. Be concrete and terse. ` +
        `Do not rewrite the whole document — list recommended edits the owner can approve.`;

      let suggestions;
      try {
        const res = await svc.integrations.Core.InvokeLLM({ prompt: llmPrompt, model: 'automatic' });
        suggestions = typeof res === 'string' ? res : (res && (res.text || res.content)) || JSON.stringify(res);
      } catch (e) {
        console.error('reviewGroundingDoc InvokeLLM failed for', doc.id, e);
        suggestions = `Automated suggestion generation failed (${String((e && e.message) || e)}). Please manually review this document against the low-trust inquiry.`;
      }

      const review = await svc.entities.Review.create({
        answer_version_id: av.id,
        inquiry_id: inquiry.id,
        capability_level: 'grounding',
        status: 'pending',
        notes: `Low-trust inquiry (trust ${trust}/100) grounded in "${doc.name}". Recommended edits generated for owner approval.`,
        verdict: { grounding_doc_id: doc.id, grounding_doc_name: doc.name, trust_score: trust, domain: inquiry.domain, suggestions, generated_at: new Date().toISOString() },
      }).catch((e) => { console.error('reviewGroundingDoc Review.create failed', doc.id, e); return null; });

      const ownerEmail = emailFor(doc.created_by_id);
      let emailed = false;
      if (ownerEmail) {
        const subject = `Aether — review suggested for your grounding document "${doc.name}"`;
        const body_text =
          `An inquiry that used your grounding document scored low trust (${trust}/100), and Aether has generated recommended edits for your approval.\n\n` +
          `Document: ${doc.name} (${doc.domain || 'general'})\n` +
          `Inquiry domain/stakes: ${inquiry.domain || 'general'} / ${inquiry.stakes_level || 'medium'}\n` +
          `Warrant validity: ${warrant?.validity_status || 'unknown'}\n\n` +
          `RECOMMENDED EDITS (review and apply as you see fit):\n${suggestions}\n\n` +
          `Review task: ${review ? review.id : '(not created)'}\n` +
          `Manage your grounding documents: https://aether.app/grounding\n\n` +
          `— Aether automated grounding review`;
        try {
          await svc.integrations.Core.SendEmail({ to: ownerEmail, subject, body: body_text });
          emailed = true;
        } catch (e) {
          console.error('reviewGroundingDoc owner email failed for', ownerEmail, e);
        }
      } else {
        console.warn('reviewGroundingDoc: no email on file for doc owner', doc.created_by_id);
      }

      await svc.entities.AuditLog.create({
        event_type: 'review_opened', entity_type: 'GroundingDoc', entity_id: doc.id, actor_id: adminId,
        summary: `Grounding review opened for "${doc.name}" after low-trust inquiry (trust ${trust}) — ${emailed ? 'owner emailed' : 'owner not emailed'}`,
        metadata: { grounding_doc_id: doc.id, answer_version_id: av.id, inquiry_id: inquiry.id, trust_score: trust, review_id: review?.id || null, owner_emailed: emailed, automated: true },
      }).catch(() => {});

      reviewed.push({ doc_id: doc.id, name: doc.name, review_id: review?.id || null, owner_emailed: emailed, owner_email: ownerEmail || null });
    }

    return Response.json({ reviewed: reviewed.length, trust_score: trust, docs: reviewed });
  } catch (error) {
    console.error('reviewGroundingDoc error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}