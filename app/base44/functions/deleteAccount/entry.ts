import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Permanently deletes the calling user's data (API keys, subscription, inquiries,
// answer versions, warrants, reviews, debates, red-team runs, audit logs) before
// the frontend clears the session. Runs as the service role to bypass RLS so the
// cleanup is thorough even for admin-owned records.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const uid = user.id;

    await svc.entities.ApiKey.deleteMany({ user_id: uid }).catch(() => {});
    await svc.entities.Subscription.deleteMany({ user_id: uid }).catch(() => {});
    await svc.entities.Inquiry.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.AnswerVersion.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.Warrant.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.Review.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.CorrectionEvent.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.Debate.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.RedTeamRun.deleteMany({ created_by_id: uid }).catch(() => {});
    await svc.entities.AuditLog.deleteMany({ created_by_id: uid }).catch(() => {});

    return Response.json({ deleted: true });
  } catch (error) {
    console.error('deleteAccount error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}