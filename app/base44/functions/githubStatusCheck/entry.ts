import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// GitHub commit/PR status check — sets a commit status (success/failure) based
// on Aether's trust score. Used in CI/CD to block merges on low-trust AI output.
// Authorized scope: repo:status (set commit statuses only).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { owner, repo, sha, trust_score, verdict, inquiry_id, description } = body;

    if (!owner || !repo || !sha) {
      return Response.json({ error: 'owner, repo, and sha are required' }, { status: 400 });
    }

    const invalidPathField = validateGithubPathParams({ owner, repo, sha });
    if (invalidPathField) {
      return Response.json({ error: `${invalidPathField} is invalid` }, { status: 400 });
    }

    if (trust_score == null) {
      return Response.json({ error: 'trust_score is required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');
    if (!accessToken) {
      return Response.json({ error: 'GitHub connector not connected' }, { status: 503 });
    }

    // Aether gate: trust >= 60 and not rejected → success (merge allowed).
    // Below 60 or rejected → failure (blocks merge if branch protection requires this check).
    const isPassed = trust_score >= 60 && verdict !== 'rejected' && verdict !== 'contested';
    const statusState = isPassed ? 'success' : 'failure';

    const statusBody = {
      state: statusState,
      description: description || (isPassed
        ? `Aether verified · trust ${trust_score}/100`
        : `Aether flagged hallucination · trust ${trust_score}/100`),
      context: 'Aether Truth Layer',
    };
    if (inquiry_id) {
      statusBody.target_url = `https://aether.ai/verify/${inquiry_id}`;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'Aether-Truth-Layer',
      },
      body: JSON.stringify(statusBody),
    });

    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); }
    catch { data = { raw: responseText.slice(0, 500) }; }
    if (!response.ok) {
      console.error('GitHub API error:', response.status, responseText.slice(0, 500));
      return Response.json({ error: 'GitHub API error', status: response.status, details: data }, { status: 502 });
    }

    return Response.json({
      status: statusState,
      trust_score,
      passed: isPassed,
      github_status_id: data.id,
      target_url: statusBody.target_url || null,
    });
  } catch (error) {
    console.error('githubStatusCheck error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ---- Helpers ----

// owner/repo/sha are interpolated into api.github.com URLs with the connector
// token attached — validate them strictly so a crafted value cannot retarget
// the request at a different API endpoint. Returns the first invalid field
// name, or null when all parts are valid.
const GITHUB_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const GITHUB_SHA_RE = /^[0-9a-fA-F]{7,40}$/;

function validateGithubPathParams({ owner, repo, sha }) {
  if (!GITHUB_NAME_RE.test(owner) || owner === '.' || owner === '..') return 'owner';
  if (!GITHUB_NAME_RE.test(repo) || repo === '.' || repo === '..') return 'repo';
  if (!GITHUB_SHA_RE.test(sha)) return 'sha';
  return null;
}