import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';

export default function AgentGreeter({ agentKey, to, firstGreeting, returningGreeting, label }) {
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupText, setPopupText] = useState('');
  const [flashMode, setFlashMode] = useState(null);
  const timersRef = useRef([]);

  useEffect(() => {
    const greetedKey = `aether_agent_${agentKey}_greeted`;
    const hasGreeted = localStorage.getItem(greetedKey) === 'true';
    const timers = [];

    if (!hasGreeted) {
      setPopupText(firstGreeting);
      setFlashMode('continuous');
      timers.push(setTimeout(() => setPopupVisible(true), 900));
      timers.push(setTimeout(() => setPopupVisible(false), 8900));
      localStorage.setItem(greetedKey, 'true');
    } else {
      setPopupText(returningGreeting);
      setFlashMode('once');
      timers.push(setTimeout(() => setPopupVisible(true), 700));
      timers.push(setTimeout(() => setPopupVisible(false), 8700));
      timers.push(setTimeout(() => setFlashMode(null), 9000));
    }

    timersRef.current = timers;
    return () => { timers.forEach(clearTimeout); };
  }, [agentKey, firstGreeting, returningGreeting]);

  const buttonClass = flashMode === 'continuous'
    ? 'animate-pulse'
    : flashMode === 'once'
      ? 'blink-once'
      : '';

  return (
    <>
      <Link
        to={to}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 transition-colors ${buttonClass}`}
      >
        <Sparkles className="h-3 w-3" />
        {label || 'Ask the assistant'}
      </Link>
      {popupVisible && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="relative rounded-2xl border border-emerald-400/20 bg-[#0B0F16] p-4 shadow-2xl">
            <button onClick={() => setPopupVisible(false)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-300">
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-start gap-2 pr-4">
              <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-300 leading-relaxed">{popupText}</p>
            </div>
            <Link to={to} className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 hover:text-emerald-200 ${flashMode === 'continuous' ? 'animate-pulse' : ''}`}>
              <Sparkles className="h-3 w-3" /> {label || 'Ask the assistant'}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}