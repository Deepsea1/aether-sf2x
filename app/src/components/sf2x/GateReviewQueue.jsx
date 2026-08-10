import React, { useState, useEffect, useCallback } from 'react';
import { GitPullRequest, Clock, AlertTriangle, ChevronDown, ChevronRight, Loader2, ShieldCheck, ExternalLink, Gavel } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

// Gate review queue (§12.4–12.5) — Review rows with review_type 'gate',
// opened by the PR wedge for needs_review/contradicted claims at high or
// critical materiality. Open reviews show their SLA countdown and resolve
// through prepareReview's resolve_review op (approve/reject + required
// rationale — Base44's function cap folded resolveReview into that host);
// decided and expired reviews collapse into a history section.

const MATERIALITY_COLORS = {
  critical: 'text-red-400 border-red-400/30 bg-red-400/5',
  high: 'text-orange-400 border-orange-400/30 bg-orange-400/5',
};

const DISPOSITION_COLORS = {
  needs_review: 'text-amber-400',
  contradicted: 'text-red-400',
};

const STATUS_COLORS = {
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
  expired_advisory: 'text-slate-400',
};

function dueLabel(dueBy) {
  if (!dueBy) return { text: 'no SLA', overdue: false };
  const ms = new Date(dueBy).getTime() - Date.now();
  if (Number.isNaN(ms)) return { text: 'no SLA', overdue: false };
  if (ms <= 0) {
    const h = Math.floor(-ms / 3600000);
    return { text: h >= 24 ? `overdue ${Math.floor(h / 24)}d` : `overdue ${h}h`, overdue: true };
  }
  const h = Math.ceil(ms / 3600000);
  return { text: h >= 24 ? `due in ${Math.floor(h / 24)}d ${h % 24}h` : `due in ${h}h`, overdue: false };
}

function prUrl(review) {
  if (!review.repo) return null;
  return review.pr_number != null
    ? `https://github.com/${review.repo}/pull/${review.pr_number}`
    : `https://github.com/${review.repo}`;
}

function OpenReviewRow({ review, busy, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const [rationale, setRationale] = useState('');
  const due = dueLabel(review.due_by);
  const link = prUrl(review);
  const rowBusy = busy === review.id;

  return (
    <div className={`border rounded-lg overflow-hidden ${due.overdue ? 'border-rose-400/30 bg-rose-400/[0.03]' : 'border-white/10'}`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-relaxed">{review.claim_excerpt || '(no claim excerpt)'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${MATERIALITY_COLORS[review.materiality] || MATERIALITY_COLORS.high}`}>
              {review.materiality || 'high'}
            </span>
            <span className={`text-[10px] uppercase tracking-wide ${DISPOSITION_COLORS[review.disposition] || 'text-slate-400'}`}>
              {review.disposition?.replace(/_/g, ' ')}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide ${due.overdue ? 'text-rose-300 font-medium' : 'text-slate-500'}`}>
              <Clock className="h-3 w-3" /> {due.text}
            </span>
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">on timeout: {review.on_timeout?.replace(/_/g, ' ') || 'remain blocked'}</span>
            {review.escalated && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-rose-400 font-medium">
                <AlertTriangle className="h-3 w-3" /> escalated
              </span>
            )}
          </div>
          {review.repo && (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-[10px] text-sky-400/60 font-mono">{review.repo}{review.pr_number != null ? `#${review.pr_number}` : ''}</span>
              {review.risk_level && <span className="text-[10px] text-slate-600">· risk {review.risk_level}</span>}
            </div>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 bg-black/20 space-y-3">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300">
              <GitPullRequest className="h-3.5 w-3.5" /> View pull request <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Rationale (required) — why this claim is approved or rejected…"
            rows={2}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={rowBusy || !rationale.trim()}
              onClick={() => onResolve(review, 'approved', rationale.trim())}
              className="h-11 md:h-8 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-400/30"
            >
              {rowBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />} Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rowBusy || !rationale.trim()}
              onClick={() => onResolve(review, 'rejected', rationale.trim())}
              className="h-11 md:h-8 border-rose-400/30 text-rose-300 hover:bg-rose-400/10"
            >
              Reject
            </Button>
            {!rationale.trim() && <span className="text-[11px] text-slate-600">A rationale is required to decide.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function DecidedReviewRow({ review }) {
  return (
    <div className="border border-white/10 rounded-lg p-3">
      <p className="text-xs text-slate-400 leading-relaxed">{review.claim_excerpt || '(no claim excerpt)'}</p>
      <div className="flex flex-wrap items-center gap-2 mt-1.5">
        <span className={`text-[10px] uppercase tracking-wide font-medium ${STATUS_COLORS[review.status] || 'text-slate-400'}`}>
          {review.status?.replace(/_/g, ' ')}
        </span>
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${MATERIALITY_COLORS[review.materiality] || MATERIALITY_COLORS.high}`}>
          {review.materiality || 'high'}
        </span>
        {review.repo && <span className="text-[10px] text-sky-400/60 font-mono">{review.repo}{review.pr_number != null ? `#${review.pr_number}` : ''}</span>}
        {(review.decided_at || review.decided_date) && (
          <span className="text-[10px] text-slate-600">{new Date(review.decided_at || review.decided_date).toLocaleString()}</span>
        )}
      </div>
      {review.rationale && <p className="text-[11px] text-slate-500 mt-1.5 border-l-2 border-white/10 pl-2">{review.rationale}</p>}
    </div>
  );
}

export default function GateReviewQueue() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [showDecided, setShowDecided] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.Review.filter({ review_type: 'gate' }, '-created_date', 100);
      setReviews(res || []);
    } catch (e) {
      toast({ title: 'Failed to load gate reviews', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function resolve(review, decision, rationale) {
    setBusy(review.id);
    try {
      const res = await base44.functions.invoke('prepareReview', { op: 'resolve_review', review_id: review.id, decision, rationale });
      const d = res?.data || res;
      if (d?.error) {
        toast({ title: 'Resolve failed', description: d.error, variant: 'destructive' });
      } else {
        toast({ title: `Review ${decision}`, description: review.claim_excerpt?.slice(0, 80) || review.id });
      }
      await load();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Resolve failed';
      toast({ title: 'Resolve failed', description: msg, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const open = reviews.filter((r) => r.status === 'open');
  const decided = reviews.filter((r) => r.status !== 'open');
  // Overdue first, then nearest deadline.
  const sortedOpen = [...open].sort((a, b) => new Date(a.due_by || 8640000000000000) - new Date(b.due_by || 8640000000000000));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2">
          <Gavel className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-medium text-slate-300">Gate Reviews ({open.length} open)</h2>
        </div>
        <button onClick={load} className="text-xs text-emerald-400 hover:text-emerald-300">Refresh</button>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Claims from PR gates needing human eyes — needs-review or contradicted at high/critical materiality. Each has an SLA; overdue advisory reviews expire, overdue blocking reviews escalate and stay open.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        </div>
      ) : sortedOpen.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <ShieldCheck className="h-5 w-5 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No open gate reviews. PR claims that need human review appear here with their SLA countdown.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedOpen.map((r) => (
            <OpenReviewRow key={r.id} review={r} busy={busy} onResolve={resolve} />
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div>
          <button
            onClick={() => setShowDecided((s) => !s)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            {showDecided ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Decided & expired ({decided.length})
          </button>
          {showDecided && (
            <div className="space-y-2 mt-2">
              {decided.map((r) => (
                <DecidedReviewRow key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
