import React from 'react';
import AppShell from '@/components/sf2x/AppShell';
import AgentConversation from '@/components/sf2x/AgentConversation';

export default function VerificationHistoryAssistant() {
  return (
    <AppShell>
      <AgentConversation
        agentName="verification_history_assistant"
        title="Verification History Assistant"
        subtitle="Search and summarize your personal verification logs — trust scores, verdicts, and trends."
      />
    </AppShell>
  );
}