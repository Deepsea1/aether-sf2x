import { assessCapability } from './sf2xGovernance';
import { computeTrustworthyRate } from './sf2x';

export const POLICY = {
  trustPromote: 80,
  trustReview: 60,
  trustSuppress: 30,
  reviewStakes: ['critical'],
  monitorStakes: ['high'],
};

export function gateDecision(stakes, metrics, warrant) {
  const trust = computeTrustworthyRate(metrics, warrant);
  const cap = assessCapability(stakes, trust, warrant);
  const action = cap.killSwitch ? 'suppress' : cap.requiresReview ? 'review' : 'promote';
  return { trust, cap, action, createReview: cap.requiresReview, killSwitch: cap.killSwitch };
}