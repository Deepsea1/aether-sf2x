# ADR-014: Federated truth-decision contract

**Status:** Accepted
**Date:** 2026-08-14

## Context

SF2X's internal Aether settles governed memory. Aether-SF2X independently
verifies factual claims, evidence, warrants, and revocations. A shared database
or a merged codebase would couple their failure modes and let one product
silently overwrite the other's authority.

## Decision

Adopt the portable, versioned `aether.truth-decision.v1` contract. Every
material decision carries these independent fields:

`truth_status`, `evidence_basis`, `proof_level`, `integrity_status`, and
`action_authorization`.

A model-only assessment is `UNKNOWN + MODEL_ASSESSED + L1`; it cannot issue a
factual VERIFIED result. A VERIFIED result requires applicable, entailing
evidence at L4 or above. A warrant's integrity and permission to act remain
separate from that factual result.

SF2X and Aether-SF2X exchange versioned evidence receipts through an adapter.
Each validates the receipt, retains its own durable state, and reaches its own
final decision.

## Consequences

- Consumers can migrate independently and reject unsupported schema versions.
- The integration scales across Base44, MCP, SDK, GitHub Action, and SF2X
  without a shared persistence dependency.
- Existing legacy verdict fields remain compatibility labels until every factual
  serving path has been migrated and tested against this contract.
