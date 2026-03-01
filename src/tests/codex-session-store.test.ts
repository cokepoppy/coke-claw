import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexSessionStore } from "../lite/acp/codex-session-store.js";

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coke-claw-lite-test-"));
}

test("CodexSessionStore set/get persists to disk", () => {
  const workspace = makeTempWorkspace();
  const store = new CodexSessionStore(workspace);

  const now = store.set("telegram:1:1", "thread-1", workspace);
  assert.equal(now.threadId, "thread-1");

  const found = store.get("telegram:1:1");
  assert.ok(found);
  assert.equal(found.threadId, "thread-1");

  const reloaded = new CodexSessionStore(workspace);
  const foundReloaded = reloaded.get("telegram:1:1");
  assert.ok(foundReloaded);
  assert.equal(foundReloaded.threadId, "thread-1");
});

test("CodexSessionStore delete removes record", () => {
  const workspace = makeTempWorkspace();
  const store = new CodexSessionStore(workspace);

  store.set("telegram:2:2", "thread-2", workspace);
  assert.ok(store.get("telegram:2:2"));

  const deleted = store.delete("telegram:2:2");
  assert.equal(deleted, true);
  assert.equal(store.get("telegram:2:2"), null);
});
