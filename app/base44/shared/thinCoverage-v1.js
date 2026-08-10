// Gate 2 thin-coverage set — 5 undetectable-if-false (negative) claims.
// Each is an absence-of-record claim where the available record could not have
// captured the counter-fact, so the record's coverage is thin. The tribunal must
// abstain (insufficient_evidence), NOT affirm, for every item here. Ground truth:
// these are constructed so the honest verdict is "I don't know" — affirming or
// flatly denying them is a failure. A claim is "passed" only when the verdict is
// insufficient_evidence.

export const THIN_COVERAGE_V1 = [
  {
    id: 'TC01',
    text: 'No published peer-reviewed study has ever found a statistically significant correlation between consuming lukewarm lemon water at exactly 3:17 a.m. and improved pinky-toe flexibility in adults aged 34–37.',
    class: 'THIN_NEG',
    ground_truth: 'insufficient_evidence',
    sources: [],
    notes: 'Absence-of-record. No registry indexes this; the counter-fact would never be recorded either way. Coverage is thin → abstain.',
  },
  {
    id: 'TC02',
    text: 'There is no record of any private conversation between two un-named civilians on a rural road in Nebraska on the afternoon of March 14, 1903.',
    class: 'THIN_NEG',
    ground_truth: 'insufficient_evidence',
    sources: [],
    notes: 'No archive logs private conversations between unknown persons. Undetectable if false.',
  },
  {
    id: 'TC03',
    text: 'No archived newspaper from June 1927 in any town of under 400 people in eastern Wyoming mentions a black cat named Whiskers belonging to a baker.',
    class: 'THIN_NEG',
    ground_truth: 'insufficient_evidence',
    sources: [],
    notes: 'Local papers of the era are not comprehensively digitized or indexed by pet owner. Coverage gap → abstain.',
  },
  {
    id: 'TC04',
    text: 'There exists no recording of the exact words spoken by an un-named fish vendor at a market in Lisbon on a specific morning in 1881.',
    class: 'THIN_NEG',
    ground_truth: 'insufficient_evidence',
    sources: [],
    notes: 'No medium recorded ephemeral vendor speech. Undetectable if false.',
  },
  {
    id: 'TC05',
    text: 'No publicly indexed dataset records whether a randomly chosen un-named individual scratched their left elbow at 11:42 a.m. local time on July 2, 1996 in Osaka.',
    class: 'THIN_NEG',
    ground_truth: 'insufficient_evidence',
    sources: [],
    notes: 'No dataset indexes mundane individual micro-actions. Thin coverage → abstain.',
  },
];

export const THIN_COVERAGE_VERSION = 'v1';