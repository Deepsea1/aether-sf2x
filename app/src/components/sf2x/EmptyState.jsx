import React from 'react';
import { Link } from 'react-router-dom';

export default function EmptyState({ icon: Icon, title, message, actionTo, actionLabel, actionIcon: ActionIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      {Icon && <Icon className="h-5 w-5 text-slate-500 mx-auto mb-2" />}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {message && <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{message}</p>}
      {actionTo && (
        <Link
          to={actionTo}
          className="inline-flex items-center gap-1.5 mt-4 text-xs px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/20 transition-colors"
        >
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          {actionLabel}
        </Link>
      )}
    </div>
  );
}