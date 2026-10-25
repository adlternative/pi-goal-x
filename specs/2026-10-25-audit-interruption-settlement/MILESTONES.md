# 2026-10-25 — Interrupted completion audits

## Findings

- Reproduction source: a 337 MB session ledger where `audit_started` at `2026-10-24T18:28:43.555Z` had no `audit_result` for ~9 hours, while `/goal-status` reported the goal as plain `active`. A second goal in the same ledger had been unsettled since `2026-10-23T14:09:01Z`.
- The scheduler was not part of the defect: `goal-scheduler.ts` already rewrites a surviving `phase: "running"` claim into `interrupted` and clears the dispatch on the next load, so only the audit pair stayed open.
- Three producers of an open pair: process death, a throwing auditor (never caught), and the Escape → "continue working" branch, which intentionally wrote no event at all.

## Decisions

- No new ledger event type. Interruption uses the existing `audit_result` / `verdict: "error"`, so `latestAuditorResultForGoal`, the compaction prompt, and the audit result card keep their current shape. A dedicated `audit_interrupted` type was rejected: it would have required validation, activity mapping, status, format, and compaction changes for a state that already maps to "the review could not finish".
- Read-side derivation (`latestAuditLifecycleForGoal`) instead of write-side repair: a hard kill can never be settled by the dying process, and inventing a verdict for it would be dishonest.
- The in-flight marker is `core.auditAbortController`, cleared in a `finally` after the auditor returns in every path. `core.auditProgress` was rejected for this because the approval path clears it later, inside `commitGoalCompletion`.

## Validation

- `npm run check`, `npm run lint`: clean.
- `npm test`: 1162 tests, 0 failures (82 unit files); `tests/.test-manifest.json` regenerated and `npm run test:selfcheck` passes.
- New regression file `tests/goal-audit-interruption.test.ts` (10 tests): derived state for none/unsettled/settled/skipped and per-goal scoping, `/goal-status` `NO RESULT` box within the status width, `get_goal` history line, throwing auditor settles as `error`, shutdown settles an in-flight review, settlement is a no-op when no review is in flight.
- `scripts/live-session-check.mjs` against a real `pi --mode rpc` host: draft -> execute -> audit -> approved -> archived, all milestones present.
- Real-data check: the patched `/goal-status` builder rendered `NO RESULT (started 2026-10-23 14:09)` for a goal whose review had been left open in a real project ledger since the previous day.
