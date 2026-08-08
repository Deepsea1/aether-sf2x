import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Mobile-only sticky back header with notch safe-area offset and a 44px tap target.
// Hidden on desktop; uses semantic theme tokens so it adapts to light/dark.
export default function MobileBackHeader() {
  const navigate = useNavigate();
  return (
    <header className="md:hidden sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
      <div className="flex items-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="h-11 min-w-[44px] px-3 inline-flex items-center gap-1.5 rounded-lg text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>
    </header>
  );
}