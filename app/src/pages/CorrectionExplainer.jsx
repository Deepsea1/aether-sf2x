import React from 'react';
import AppShell from '@/components/sf2x/AppShell';
import AgentConversation from '@/components/sf2x/AgentConversation';

export default function CorrectionExplainer() {
  return (
    <AppShell>
      <AgentConversation
        agentName="correction_event_explainer"
        title="Correction Event Explainer"
        subtitle="Get a plain-language breakdown of any correction event and what it means for your trust score."
      />
    </AppShell>
  );
}