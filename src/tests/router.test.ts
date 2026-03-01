import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createRouter } from "../lite/runtime/router.js";
import type { LiteConfig } from "../lite/config.js";

function makeConfig(workspaceRoot: string): LiteConfig {
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

test("router slash help works without model auth initialization", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-claw-router-test-"));
  const router = createRouter(makeConfig(workspace));

  const text = await router.route({
    text: "/help",
    sessionKey: "console:local",
    channel: "console",
  });

  assert.equal(text.includes("/coding_agent"), true);
});
