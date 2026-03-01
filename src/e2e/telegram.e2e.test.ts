import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTelegramBot } from "../lite/channels/telegram/bot.js";
import type { LiteConfig } from "../lite/config.js";

function mkConfig(workspaceRoot: string): LiteConfig {
  return {
    telegramBotToken: "123456:fake-token-for-e2e",
    modelRef: "openai-codex/gpt-5.3-codex",
    codexLoginMode: "auto",
    workspaceRoot,
    enableMacRun: false,
    browserHeadless: true,
    adminHost: "127.0.0.1",
    adminPort: 0,
  };
}

function buildTextUpdate(updateId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: 2001,
        type: "private",
        first_name: "E2E",
      },
      from: {
        id: 1001,
        is_bot: false,
        first_name: "Tester",
        username: "tester",
        language_code: "en",
      },
      text,
      entities: text.startsWith("/")
        ? [
            {
              offset: 0,
              length: text.split(/\s+/)[0]?.length ?? 0,
              type: "bot_command",
            },
          ]
        : undefined,
    },
  };
}

test("telegram e2e: slash command flow via handleUpdate", { timeout: 60_000 }, async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "coke-telegram-e2e-"));
  const bot = createTelegramBot(mkConfig(workspace), { registerNativeCommands: false });

  const methodCalls: Array<{ method: string; payload: unknown }> = [];
  const sentTexts: string[] = [];

  bot.api.config.use(async (_prev, method, payload) => {
    methodCalls.push({ method, payload });

    if (method === "sendChatAction") {
      return { ok: true, result: true } as any;
    }

    if (method === "sendMessage") {
      const text = typeof (payload as { text?: unknown }).text === "string"
        ? ((payload as { text: string }).text)
        : "";
      sentTexts.push(text);
      return {
        ok: true,
        result: {
          message_id: 5000 + sentTexts.length,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 2001, type: "private" },
          text,
        },
      } as any;
    }

    return { ok: true, result: true } as any;
  });
  (bot as any).botInfo = {
    id: 999001,
    is_bot: true,
    first_name: "CokeLiteBot",
    username: "coke_lite_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  };

  await bot.handleUpdate(buildTextUpdate(1, "/help") as any);
  await bot.handleUpdate(buildTextUpdate(2, "/auth status") as any);
  await bot.handleUpdate(buildTextUpdate(3, "/coding_agent sessions") as any);
  await bot.handleUpdate(buildTextUpdate(4, "/coding_agent reset") as any);

  assert.equal(
    sentTexts.some((text) => text.includes("Available commands:")),
    true,
  );
  assert.equal(
    sentTexts.some((text) => text.includes("Codex login:")),
    true,
  );
  assert.equal(
    sentTexts.some((text) => text.includes("No persistent coding_agent session for this chat")),
    true,
  );
  assert.equal(
    sentTexts.some((text) => text.toLowerCase().includes("clear")),
    true,
  );

  const chatActionCalls = methodCalls.filter((call) => call.method === "sendChatAction");
  assert.equal(chatActionCalls.length, 4);

  const sendMessageCalls = methodCalls.filter((call) => call.method === "sendMessage");
  assert.equal(sendMessageCalls.length >= 3, true);
});
