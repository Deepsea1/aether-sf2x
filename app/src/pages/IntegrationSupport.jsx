import React from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '@/components/sf2x/AppShell';
import AgentConversation from '@/components/sf2x/AgentConversation';
import OnboardingChecklist from '@/components/sf2x/OnboardingChecklist';

const STEP_MESSAGES = {
  apikey: 'I need to generate an API key. Can you walk me through it?',
  firstcall: 'I want to make my first API call. Can you help me get started?',
  sdk: 'I want to install the SDK. Can you guide me through it?',
  webhook: 'I need to set up a webhook for alerts. Can you help?',
  embed: 'I want to embed a verification widget on my site. How do I do that?',
  extension: 'I want to install the browser extension. Can you walk me through it?',
};

export default function IntegrationSupport() {
  const [searchParams] = useSearchParams();
  const step = searchParams.get('step');
  const initialMessage = step ? STEP_MESSAGES[step] : null;

  return (
    <AppShell>
      <OnboardingChecklist />
      <AgentConversation
        agentName="integration_support"
        title="Integration Support"
        subtitle="Connect your AI, set up API calls, embed verification widgets, install the browser extension, and more."
        initialMessage={initialMessage}
      />
    </AppShell>
  );
}