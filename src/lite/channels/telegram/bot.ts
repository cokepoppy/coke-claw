import { Bot, Context } from "grammy";
import { createRouter } from "../../runtime/router.js";
import { LiteConfig } from "../../config.js";

function toSessionKey(ctx: Context): string {
  const chatId = ctx.chat?.id ?? "unknown-chat";
  const userId = ctx.from?.id ?? "unknown-user";
  return `telegram:${chatId}:${userId}`;
}

function splitMessage(text: string, size = 3500): string[] {
  if (text.length <= size) {
    return [text];
  }
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export function telegramNativeCommands(): Array<{ command: string; description: string }> {
  return [
    { command: "start", description: "Show available commands" },
    { command: "help", description: "Show available commands" },
    { command: "auth", description: "Check/start codex login (status/login)" },
    { command: "coding_agent", description: "Run codex task (supports persistent mode)" },
  ];
}

async function registerTelegramCommands(bot: Bot): Promise<void> {
  try {
    await bot.api.setMyCommands(telegramNativeCommands());
  } catch (error) {
    console.warn(
      `Failed to register Telegram native commands: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface CreateTelegramBotOptions {
  registerNativeCommands?: boolean;
}

export function createTelegramBot(config: LiteConfig, options?: CreateTelegramBotOptions): Bot {
  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for telegram mode");
  }
  const bot = new Bot(config.telegramBotToken);
  const router = createRouter(config);
  if (options?.registerNativeCommands !== false) {
    void registerTelegramCommands(bot);
  }

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text?.trim() ?? "";
    if (!text) {
      return;
    }

    try {
      await ctx.api.sendChatAction(ctx.chat.id, "typing");
      const result = await router.route({
        text,
        sessionKey: toSessionKey(ctx),
        channel: "telegram",
      });

      for (const chunk of splitMessage(result)) {
        await ctx.reply(chunk);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.reply(`Error: ${message}`);
    }
  });

  return bot;
}
