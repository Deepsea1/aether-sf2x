import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;

    const dateStr = body.question_date || new Date().toISOString().slice(0, 10);
    const runs = await svc.entities.ModelBenchRun.filter({ question_date: dateStr, run_type: 'daily' });
    if (!runs.length) return Response.json({ posted: false, reason: 'no daily runs for ' + dateStr });

    const question = runs[0]?.question || '';
    const ranked = [...runs].sort((a, b) => (b.correctness ?? -1) - (a.correctness ?? -1) || (b.trust_score || 0) - (a.trust_score || 0));
    const top = ranked[0];
    const winners = ranked.filter((r) => r.is_winner);
    const winnerNames = winners.length ? winners.map((w) => w.model_label || w.model) : [top?.model_label || top?.model];

    const lines = ranked.slice(0, 10).map((r, i) => {
      const mark = r.is_winner ? '🏆' : i + 1 + '.';
      const corr = r.correctness != null ? Math.round(r.correctness * 100) + '%' : 'n/a';
      return `${mark} ${r.model_label || r.model} — correctness ${corr}, trust ${r.trust_score ?? 'n/a'}, latency ${r.latency_ms ?? 'n/a'}ms${r.error ? ' (failed)' : ''}`;
    }).join('\n');

    const subject = `SF2X Daily Arena — ${dateStr}`;
    const bodyText = `Daily Model Arena results for ${dateStr}.

Question of the day:
"${question}"

Ranked results (correctness, then trust):
${lines}

Top model: ${top?.model_label || top?.model}
Winners: ${winnerNames.join(', ')}

Logged to ModelBenchRun — view the full history on the Bench page.`;

    let emailed = 0;
    try {
      const users = await svc.entities.User.list();
      const admins = (users || []).filter((u) => u.role === 'admin' && u.email);
      for (const a of admins) {
        try {
          await svc.integrations.Core.SendEmail({ to: a.email, subject, body: bodyText });
          emailed++;
        } catch (e) {
          console.error('postDailyArenaResult email failed', a.email, e?.message || e);
        }
      }
    } catch (e) {
      console.error('postDailyArenaResult user list failed', e?.message || e);
    }

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted',
      entity_type: 'ModelBenchRun',
      entity_id: top?.id || '',
      summary: `Daily arena result posted — ${runs.length} models, top: ${top?.model_label || top?.model} · ${emailed} admin(s) emailed`,
      metadata: { question_date: dateStr, top_model: top?.model, emailed, winners: winners.length },
    }).catch(() => {});

    return Response.json({ posted: true, date: dateStr, runs: runs.length, top: top?.model, emailed, winners: winnerNames });
  } catch (error) {
    console.error('postDailyArenaResult error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}