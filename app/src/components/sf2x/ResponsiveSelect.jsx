import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Check, ChevronDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Desktop: styled Radix/shadcn Select. Mobile (< md): a bottom drawer dialog
// with full-width tap targets. Same value/onValueChange API as the Select.
export default function ResponsiveSelect({ value, onValueChange, options, placeholder, triggerClassName, disabled }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const opts = options || [];
  const selected = opts.find((o) => String(o.value) === String(value));
  const label = selected ? selected.label : (placeholder || '');

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-[#0B0F16] border-white/10 text-slate-200">
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex items-center justify-between gap-2 border border-white/10 bg-[#070A0F] text-slate-200 rounded-lg px-3',
            triggerClassName
          )}
        >
          <span className={label ? '' : 'text-slate-500'}>{label || 'Select'}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-[#0B0F16] border-white/10 text-slate-200">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-white text-sm">{placeholder || 'Select'}</DrawerTitle>
        </DrawerHeader>
        <div className="px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[60vh] overflow-y-auto">
          {opts.length === 0 ? (
            <p className="text-sm text-slate-500 px-3 py-4 text-center">{placeholder || 'No options'}</p>
          ) : (
            opts.map((o) => {
              const active = String(o.value) === String(value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onValueChange(o.value); setOpen(false); }}
                  className="flex items-center justify-between w-full text-left px-3 min-h-[44px] py-2.5 rounded-lg hover:bg-white/5"
                >
                  <span className={`text-sm ${active ? 'text-emerald-300' : 'text-slate-200'}`}>{o.label}</span>
                  {active && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}