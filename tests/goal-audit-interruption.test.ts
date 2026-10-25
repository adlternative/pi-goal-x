/**
 * Interrupted completion audits.
 *
 * The ledger can only record transitions the process lives through. A review
 * that dies mid-audit (shutdown, crash, replaced session, throwing auditor)
 * used to leave `audit_started` as the last audit event forever, which reads
 * exactly like a review that is still running — and `/goal-status`, `/goal-list`
 * and `get_goal` said nothing at all.
 *
 * These tests protect two invariants:
 *  1. An audit that can still be settled in-process is settled (never a dangling
 *     `audit_started`), so the next reader sees "interrupted", not "running".
 *  2. An audit that could not be settled is reported as interrupted rather than
 *     silently omitted.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

import goalExtension from "../extensions/goal.ts";
import { settleInterruptedAudit } from "../extensions/goal-completion.ts";
import { buildGoalHistoryBlock } from "../extensions/goal-format.ts";
import {
	goalLedgerPath,
	latestAuditLifecycleForGoal,
	type GoalLedgerEvent,
} from "../extensions/goal-ledger.ts";
import { createGoal, goalFocusDetails, type GoalRecord } from "../extensions/goal-record.ts";
import { buildGoalStatusText, GOAL_STATUS_WIDTH } from "../extensions/goal-status.ts";
import { writeActiveGoalFile } from "../extensions/storage/goal-files.ts";

const GOAL_ID = "g-audit";

function created(at = "2026-10-24T17:13:13.344Z"): GoalLedgerEvent {
	return { type: "goal_created", goalId: GOAL_ID, objective: "Audit interruption", sisyphus: false, autoContinue: true, at };
}

function started(at = "2026-10-24T18:28:43.555Z"): GoalLedgerEvent {
	return { type: "audit_started", goalId: GOAL_ID, at };
}

function result(verdict: "approved" | "disapproved" | "error", at = "2026-10-24T18:17:03.283Z"): GoalLedgerEvent {
	return { type: "audit_result", goalId: GOAL_ID, verdict, report: "auditor report", at };
}

// ── Ledger derivation ───────────────────────────────────────────────────────

test("a goal with no completion review has no audit lifecycle yet", () => {
	assert.deepEqual(latestAuditLifecycleForGoal([created()], GOAL_ID), { state: "none" });
});

test("an audit_started with no result reads as unsettled, not as a verdict", () => {
	const lifecycle = latestAuditLifecycleForGoal([created(), started()], GOAL_ID);
	assert.equal(lifecycle.state, "unsettled");
	assert.equal(lifecycle.state === "unsettled" && lifecycle.startedAt, "2026-10-24T18:28:43.555Z");
});

test("a settled review wins over an earlier unsettled attempt", () => {
	const events = [created(), started("2026-10-24T18:09:49.561Z"), result("disapproved"), started("2026-10-24T18:28:43.555Z")];
	// The newest audit event decides: the last review never produced a verdict.
	assert.equal(latestAuditLifecycleForGoal(events, GOAL_ID).state, "unsettled");
	assert.equal(latestAuditLifecycleForGoal([created(), started(), result("error")], GOAL_ID).state, "settled");
});

test("a skipped review is not an unsettled one", () => {
	const events: GoalLedgerEvent[] = [
		created(),
		{ type: "audit_skipped", goalId: GOAL_ID, reason: "user_aborted", at: "2026-10-24T17:10:58.711Z" },
	];
	const lifecycle = latestAuditLifecycleForGoal(events, GOAL_ID);
	assert.equal(lifecycle.state, "skipped");
	assert.equal(lifecycle.state === "skipped" && lifecycle.reason, "user_aborted");
	assert.equal(latestAuditLifecycleForGoal([created(), started()], "another-goal").state, "none", "scoped per goal");
});

// ── Reader-facing text ──────────────────────────────────────────────────────

function statusGoal(overrides: Partial<GoalRecord> = {}): GoalRecord {
	return {
		id: GOAL_ID,
		objective: "Verify the audit interruption state",
		status: "active",
		autoContinue: true,
		usage: { tokensUsed: 1200, activeSeconds: 90 },
		sisyphus: false,
		createdAt: "2026-10-24T17:13:13.344Z",
		updatedAt: "2026-10-24T18:28:43.553Z",
		activePath: `.pi/goals/active_goal_${GOAL_ID}.md`,
		...overrides,
	};
}

test("/goal-status reports an unsettled review instead of saying nothing", () => {
	const text = buildGoalStatusText({
		goal: statusGoal(),
		focused: true,
		otherOpenGoals: 0,
		ledgerEvents: [created(), started()],
	});
	assert.match(text, /NO RESULT/);
	assert.match(text, /2026-10-24 18:28/, "the interrupted review keeps its start time");
	for (const line of text.split("\n")) {
		assert.ok(visibleWidth(line) <= GOAL_STATUS_WIDTH, `line exceeds the status width: ${line}`);
	}
});

test("/goal-status keeps showing a real verdict when one exists", () => {
	const text = buildGoalStatusText({
		goal: statusGoal(),
		focused: true,
		otherOpenGoals: 0,
		ledgerEvents: [created(), started(), result("approved")],
	});
	assert.match(text, /APPROVED/);
	assert.doesNotMatch(text, /NO RESULT/);
});

test("get_goal history tells the agent its previous review never finished", () => {
	const block = buildGoalHistoryBlock(statusGoal(), [created(), started()]);
	assert.match(block, /Last audit: no result/);
	assert.match(block, /interrupted/);
	assert.doesNotMatch(buildGoalHistoryBlock(statusGoal(), [created(), started(), result("disapproved")]), /no result/);
});

// ── In-process settlement ───────────────────────────────────────────────────

function makeWorkspace(): string {
	const cwd = mkdtempSync(path.join(tmpdir(), "goal-audit-interruption-"));
	mkdirSync(path.join(cwd, ".pi", "goals", "archived"), { recursive: true });
	return cwd;
}

function ledgerEvents(cwd: string): GoalLedgerEvent[] {
	try {
		return readFileSync(goalLedgerPath({ cwd }), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as GoalLedgerEvent);
	} catch {
		return [];
	}
}

function createHarness(options: { cwd: string; sessionEntries: unknown[]; runCompletionAuditor?: (...args: any[]) => Promise<any> }) {
	const handlers = new Map<string, Function>();
	const tools = new Map<string, ToolDefinition>();
	const pi = {
		registerTool: (def: ToolDefinition) => { tools.set(def.name, def); },
		registerCommand: () => {},
		on: (event: string, handler: Function) => { handlers.set(event, handler); },
		appendEntry: () => {},
		registerMessageRenderer: () => {},
		sendMessage: () => {},
		getActiveTools: () => ["read", "bash", "edit", "write"],
		setActiveTools: () => {},
		hasUI: false,
	};
	const ctx = {
		cwd: options.cwd,
		hasUI: false,
		sessionManager: {
			getBranch: () => options.sessionEntries,
			getCwd: () => options.cwd,
			getSessionId: () => "audit-interruption-session",
			getRoot: () => options.cwd,
		},
		ui: {
			notify: () => {},
			setStatus: () => {},
			setWidget: () => {},
			onTerminalInput: () => () => {},
			select: async () => undefined,
			confirm: async () => false,
			custom: async () => undefined,
		},
		getSystemPrompt: () => "base prompt",
		isIdle: () => true,
		hasPendingMessages: () => false,
		abort: () => {},
	} as unknown as ExtensionContext;
	goalExtension(pi as any, { runCompletionAuditor: options.runCompletionAuditor });
	return {
		handlers,
		tools,
		ctx,
		get core() { return (pi as unknown as { _goalCore: any })._goalCore; },
	};
}

async function start(h: ReturnType<typeof createHarness>): Promise<void> {
	await h.handlers.get("session_start")?.({ reason: "start" }, h.ctx);
	await h.handlers.get("before_agent_start")?.({ systemPrompt: "base", prompt: "test", systemPromptOptions: {} }, h.ctx);
}

test("a throwing auditor settles the review it started", async () => {
	const cwd = makeWorkspace();
	const goal = createGoal({ objective: "Auditor throws mid-review", autoContinue: true, sisyphus: false }, Date.UTC(2026, 9, 24, 17, 13, 0));
	writeActiveGoalFile({ cwd }, goal);
	try {
		const h = createHarness({
			cwd,
			sessionEntries: [{ type: "custom", customType: "pi-goal-focus", data: goalFocusDetails(goal.id, "created") }],
			runCompletionAuditor: async () => { throw new Error("auditor transport closed"); },
		});
		await start(h);
		const update = h.tools.get("update_goal")!;
		await (update.execute as any)("u1", { status: "complete" }, undefined, undefined, h.ctx);
		const events = ledgerEvents(cwd);
		assert.equal(events.filter((e) => e.type === "audit_started").length, 1, "the review started exactly once");
		const settled = events.find((e) => e.type === "audit_result");
		assert.equal(settled?.type === "audit_result" && settled.verdict, "error", "a failed auditor is an error verdict, not a dangling start");
		assert.equal(latestAuditLifecycleForGoal(events, goal.id).state, "settled", "no review is left open");
	} finally {
		try { rmSync(cwd, { recursive: true, force: true }); } catch {}
	}
});

test("session shutdown settles an in-flight review", async () => {
	const cwd = makeWorkspace();
	const goal = createGoal({ objective: "Shutdown during the review", autoContinue: true, sisyphus: false }, Date.UTC(2026, 9, 24, 18, 28, 0));
	writeActiveGoalFile({ cwd }, goal);
	try {
		const h = createHarness({
			cwd,
			sessionEntries: [{ type: "custom", customType: "pi-goal-focus", data: goalFocusDetails(goal.id, "created") }],
		});
		await start(h);
		h.core.auditAbortController = new AbortController();
		await h.handlers.get("session_shutdown")?.({}, h.ctx);
		const lifecycle = latestAuditLifecycleForGoal(ledgerEvents(cwd), goal.id);
		assert.equal(lifecycle.state, "settled");
		assert.equal(lifecycle.state === "settled" && lifecycle.verdict, "error");
	} finally {
		try { rmSync(cwd, { recursive: true, force: true }); } catch {}
	}
});

test("settlement is a no-op once the review already ended", async () => {
	const cwd = makeWorkspace();
	const goal = createGoal({ objective: "No in-flight review", autoContinue: true, sisyphus: false }, Date.UTC(2026, 9, 24, 18, 40, 0));
	writeActiveGoalFile({ cwd }, goal);
	try {
		const h = createHarness({
			cwd,
			sessionEntries: [{ type: "custom", customType: "pi-goal-focus", data: goalFocusDetails(goal.id, "created") }],
		});
		await start(h);
		assert.equal(settleInterruptedAudit(h.core, h.ctx, "should not be written"), false);
		assert.equal(ledgerEvents(cwd).filter((e) => e.type === "audit_result").length, 0);
	} finally {
		try { rmSync(cwd, { recursive: true, force: true }); } catch {}
	}
});
