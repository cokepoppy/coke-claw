import test from "node:test";
import assert from "node:assert/strict";
import { parseCodingAgentArgs } from "../lite/runtime/slash/coding-agent.js";

test("parseCodingAgentArgs defaults to list", () => {
  const parsed = parseCodingAgentArgs("");
  assert.equal(parsed.action, "list");
  assert.equal(parsed.mode, "persistent");
});

test("parseCodingAgentArgs handles run flags", () => {
  const parsed = parseCodingAgentArgs(
    "fix login flow --cwd app --mode oneshot --new",
  );
  assert.equal(parsed.action, "run");
  assert.equal(parsed.task, "fix login flow");
  assert.equal(parsed.cwd, "app");
  assert.equal(parsed.mode, "oneshot");
  assert.equal(parsed.forceNew, true);
});

test("parseCodingAgentArgs handles sessions and reset", () => {
  assert.equal(parseCodingAgentArgs("sessions").action, "list");
  assert.equal(parseCodingAgentArgs("reset").action, "reset");
});
