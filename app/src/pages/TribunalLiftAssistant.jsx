import React from 'react';
import AppShell from '@/components/sf2x/AppShell';
import AgentConversation from '@/components/sf2x/AgentConversation';

export default function TribunalLiftAssistant() {
  return (
    <AppShell>
      <AgentConversation
        agentName="tribunal_lift_audit_assistant"
        title="Tribunal Lift Audit Assistant"
        subtitle="Initiate and interpret falsifiable tribunal-vs-single-model lift audits."
      />
    </AppShell>
  );
}