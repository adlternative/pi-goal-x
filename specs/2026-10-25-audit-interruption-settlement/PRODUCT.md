# Interrupted completion audits keep an open review

## Problem

`audit_started` is written to the shared ledger just before the nested auditor session runs, and only the paths that survive the auditor call write a terminal event (`audit_result` or `audit_skipped`). Three cases left the pair open with no verdict:

1. the process ends during the audit (quit, crash, killed terminal);
2. the auditor throws instead of returning a result — the completion flow rejected upward and nothing settled the start;
3. the user presses Escape during the audit and chooses "continue working" — this branch deliberately wrote nothing at all.

An open `audit_started` is indistinguishable from a review that is still running, and every reader only looked at `audit_result`:

- `/goal-status` printed nothing about it and the last activity line stayed "Started independent completion review.";
- `get_goal` history and `/goal-list` said nothing, so the agent could not tell that its own previous review had died;
- `goal_events.jsonl` was the only place where the interruption was visible, and only if someone read it.

Observed in a real 337 MB session: a goal requested completion, the audit was rejected at 18:17, the goal was re-submitted at 18:28:43, `audit_started` was appended at 18:28:43.555Z, and the process ended there. For the next 9 hours every reader reported the goal as simply active with no audit outcome; another goal in the same session had been sitting in that state since the previous day.

## Behavior

- `latestAuditLifecycleForGoal` derives the review state from the newest audit event of any kind: `none`, `unsettled` (started, no verdict), `settled` (verdict + report), or `skipped` (disabled / user aborted). `latestAuditorResultForGoal` is unchanged, so existing readers still see verdicts only.
- Everything that can settle the pair in-process now does: a throwing auditor becomes an `error` verdict instead of an unhandled rejection, "continue working" after Escape records an `error` verdict that says the review was aborted and the goal stays active, and `session_shutdown` settles a review that is still in flight.
- An `unsettled` review is reported where the user and the agent already look: a `NO RESULT` audit box in `/goal-status` (and a line in verbose mode) plus a `Last audit: no result — … never finished (interrupted)` line in the `get_goal` / `/goal-list` history block. The interrupted start time is kept so the gap is visible.
- A review that could not be settled (hard kill) still reads as `unsettled` rather than being invented as a verdict: no synthetic approval or rejection is ever written.

## Boundaries

No new ledger event type, command, tool, setting or scheduler state. `audit_skipped` keeps its two existing reasons; interruption is recorded through the existing `error` verdict so `latestAuditorResultForGoal`, compaction prompts, and the audit result card keep their current shape. The compact dashboard and expanded dashboard are untouched. README and `specs/SPECS.yaml` are untouched; this directory is registered at merge time.
