import React from 'react';
import { companyMeta } from '@/lib/sf2xCompanies';

// Compact company "logo" — a colored monogram badge used across the trend chart,
// arena, rank strip, and model profile so each AI is represented once, consistently.
export default function CompanyBadge({ company, size = 'sm', showName = true }) {
  const meta = companyMeta(company);
  const pad = size === 'lg' ? 'px-2 py-1' : 'px-1.5 py-0.5';
  const text = size === 'lg' ? 'text-xs' : 'text-[10px]';
  const mono = size === 'lg' ? 'text-sm' : 'text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded ${meta.tone} ${pad} ${text}`}>
      <span className={`font-heading font-bold leading-none ${mono}`}>{meta.mono}</span>
      {showName && <span>{company}</span>}
    </span>
  );
}