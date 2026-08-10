# Parked functions — blocked by the platform's 50-function cap

Base44 hard-caps apps at 50 backend functions (platform-wide, not plan-tiered;
this app is grandfathered at 56 — updates deploy, creates are rejected). These
four standalone functions could therefore never deploy. Their capabilities are
LIVE as ops hosted inside existing functions (2026-08-10 consolidation):

| Parked function        | Live as                                                |
|------------------------|--------------------------------------------------------|
| aetherKeys             | warrantRegistry `?op=keys`                             |
| transparencyCheckpoint | warrantRegistry `?op=checkpoint` / `op=checkpoint_create` (admin) |
| resolveReview          | prepareReview `{ op: "resolve_review", ... }`          |
| reviewSlaSweep         | keyExpirySweep (runs after the key sweep; `op: "review_sla_only"` for targeted runs) |

The dirs stay here as the clean standalone implementations (harness-proven:
33/33 checkpoint, plus the hosts' own consolidation harnesses). If the cap is
ever raised for this app, they can move back into base44/functions/ and deploy
as-is — then the host ops become thin aliases or retire with a deprecation
window. This dir is outside base44/functions/, so scripts/bundle-functions.mjs
no longer stages them and deploys stop attempting (and failing) their creates.
