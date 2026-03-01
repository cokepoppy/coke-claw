import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LiteConfig } from "../lite/config.js";
import { startAdminServer } from "../lite/admin/server.js";

function mkConfig(workspaceRoot: string): LiteConfig {
  return {
    telegramBotToken: undefined,
    modelRef: "openai-codex/gpt-5.3-codex",
    codexLoginMode: "auto",
    workspaceRoot,
    enableMacRun: false,
    browserHeadless: true,
    adminHost: "127.0.0.1",
    adminPort: 0,
  };
}

test("admin server exposes health and sessions endpoints", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-admin-test-"));
  const { server, url } = await startAdminServer(mkConfig(workspace));

  try {
    const healthRes = await fetch(`${url}/api/health`);
    assert.equal(healthRes.ok, true);
    const healthPayload = (await healthRes.json()) as { ok: boolean; data: Record<string, unknown> };
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.data.service, "coke-claw-lite");

    const sessionsRes = await fetch(`${url}/api/coding-agent/sessions`);
    assert.equal(sessionsRes.ok, true);
    const sessionsPayload = (await sessionsRes.json()) as {
      ok: boolean;
      data: unknown[];
    };
    assert.equal(sessionsPayload.ok, true);
    assert.equal(Array.isArray(sessionsPayload.data), true);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
