import { LiteConfig } from "../../config.js";
import { createTelegramBot } from "./bot.js";

export async function startTelegram(config: LiteConfig): Promise<void> {
  const bot = createTelegramBot(config);
  await bot.start();
}
