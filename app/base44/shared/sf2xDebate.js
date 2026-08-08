// Shared debate/tribunal logic used by backend functions. Mirrors src/lib/sf2xCollective.js for the runtime path.

export const DEBATE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    proposer: {
      type: 'object',
      properties: {
        stance: { type: 'string', description: "The proposer's initial position and core claim." },
        reasoning: { type: 'string', description: 'Why the proposer holds this stance.' },
      },
      required: ['stance', 'reasoning'],
    },
    critic: {
      type: 'object',
      properties: {
        objections: { type: 'array', items: { type: 'string' }, description: 'Specific objections to the proposer stance.' },
        risks: { type: 'string', description: 'The strongest counter-argument or risk.' },
      },
      required: ['objections', 'risks'],
    },
    verifier: {
      type: 'object',
      properties: {
        verdict: { type: 'string', description: "Adjudication: does the proposer's stance hold?" },
        confidence: { type: 'number', description: 'Verifier confidence 0-1.' },
        corrections: { type: 'array', items: { type: 'string' }, description: 'Required corrections to the original answer.' },
      },
      required: ['verdict', 'confidence', 'corrections'],
    },
    consensus: { type: 'string', enum: ['agreed', 'contested', 'rejected'] },
    minority_report: { type: 'string', description: 'Any dissenting view that should be preserved.' },
  },
  required: ['proposer', 'critic', 'verifier', 'consensus'],
};

export function buildDebatePrompt(inquiryPrompt, answer, warrant, domain, stakes) {
  return `You are the SF2X Collective Cognition tribunal: three agents — a Proposer, a Critic, and a Verifier — deliberating over a warranted answer. Run an adversarial debate and adjudicate.

CONTEXT
Domain: ${domain || 'general'}
Stakes: ${stakes}
Inquiry: """${inquiryPrompt}"""
Answer under scrutiny: """${answer || ''}"""
Warrant conclusion: """${warrant?.conclusion || ''}"""
Warrant premises: ${JSON.stringify(warrant?.premises || [])}

ROLES
- Proposer: defend the answer, state the core claim and reasoning.
- Critic: attack it — surface specific objections and the strongest risk (overconfidence, missing premises, unsupported claims, scope errors, stale evidence).
- Verifier: adjudicate impartially. Give a verdict, confidence (0-1), and any corrections required for the answer to be trustworthy.
- consensus: "agreed" if the answer holds, "contested" if corrections are needed, "rejected" if the answer is fundamentally unwarranted.
- minority_report: preserve any dissenting view.

Be rigorous and terse.`;
}