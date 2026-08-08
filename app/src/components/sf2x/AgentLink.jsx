import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function AgentLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 transition-colors"
    >
      <Sparkles className="h-3 w-3" />
      {label || 'Ask the assistant'}
    </Link>
  );
}