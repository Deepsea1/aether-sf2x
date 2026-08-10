import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STATUS_META = {
  pending: { label: 'Pending', color: 'text-slate-400' },
  running: { label: 'Running', color: 'text-amber-300' },
  in_progress: { label: 'In progress', color: 'text-amber-300' },
  completed: { label: 'Completed', color: 'text-emerald-300' },
  success: { label: 'Success', color: 'text-emerald-300' },
  failed: { label: 'Failed', color: 'text-rose-300' },
  error: { label: 'Error', color: 'text-rose-300' },
};

function ToolCallDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_META[toolCall.status] || { label: toolCall.status || 'unknown', color: 'text-slate-400' };
  const failed = ['failed', 'error'].includes(toolCall.status) || (typeof toolCall.results === 'string' && /error|failed/i.test(toolCall.results));
  const proj = toolCall.display_projection || {};
  const hideDetails = proj.hide_details && proj.details_redacted;

  let parsedArgs = toolCall.arguments_string;
  try { parsedArgs = JSON.parse(toolCall.arguments_string); } catch { /* keep raw */ }

  let parsedResults = toolCall.results;
  try { parsedResults = typeof toolCall.results === 'string' ? JSON.parse(toolCall.results) : toolCall.results; } catch { /* keep raw */ }

  const label = proj.label || toolCall.name;
  const activeLabel = proj.active_label || label;
  const errorLabel = proj.error_label || label;

  return (
    <div className="mt-2 text-xs border border-white/10 rounded-lg bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => !hideDetails && setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors"
      >
        {hideDetails ? (
          <ChevronRight className="h-3 w-3 text-slate-600" />
        ) : (
          <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
        <span className="font-mono text-slate-300">{failed ? errorLabel : (toolCall.status === 'pending' || toolCall.status === 'running' || toolCall.status === 'in_progress' ? activeLabel : label)}</span>
        <span className={`ml-auto ${failed ? 'text-rose-300' : status.color}`}>{failed ? 'Failed' : status.label}</span>
      </button>
      {expanded && !hideDetails && (
        <div className="px-3 pb-3 space-y-2">
          {parsedArgs && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Parameters</div>
              <pre className="text-[11px] text-slate-300 bg-black/30 rounded p-2 overflow-x-auto">{typeof parsedArgs === 'string' ? parsedArgs : JSON.stringify(parsedArgs, null, 2)}</pre>
            </div>
          )}
          {parsedResults != null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Result</div>
              <pre className="text-[11px] text-slate-300 bg-black/30 rounded p-2 overflow-x-auto">{typeof parsedResults === 'string' ? parsedResults : JSON.stringify(parsedResults, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[85%] ${isUser ? '' : 'w-full'}`}>
        {message.content && (
          isUser ? (
            <div className="rounded-2xl rounded-br-md bg-emerald-500/15 text-emerald-50 px-4 py-2.5 text-sm">{message.content}</div>
          ) : (
            <div className="rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/10 px-4 py-3">
              <ReactMarkdown className="text-sm text-slate-200 prose prose-sm prose-invert prose-p:my-1 prose-li:my-0.5 prose-headings:mb-1 prose-pre:bg-black/40 prose-pre:rounded-lg">{message.content}</ReactMarkdown>
            </div>
          )
        )}
        {message.tool_calls?.map((tc, i) => <ToolCallDisplay key={i} toolCall={tc} />)}
      </div>
    </div>
  );
}

export default function AgentConversation({ agentName, title, subtitle, initialMessage }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    base44.agents.createConversation({ agent_name: agentName, metadata: { name: title } })
      .then((conv) => {
        if (!alive) return;
        setConversation(conv);
        setMessages(conv.messages || []);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [agentName, title]);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      if (data.messages?.some((m) => m.role === 'assistant' && m.content)) setSending(false);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !conversation || sending) return;
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: 'user', content: text });
    } catch {
      setSending(false);
    }
  }, [input, conversation, sending]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-3">
        <h1 className="font-heading text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-500">
            Start a conversation when you're ready.
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {sending && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/10 px-4 py-3">
              <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={1}
          placeholder=""
          className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/30 max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="h-11 w-11 md:h-12 md:w-12 shrink-0 rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-40 flex items-center justify-center"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}