import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

dotenv.config();
const DEFAULT_ENABLE_MAC_RUN = process.platform === "darwin";
const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), ".cokeclaw");

const configSchema = z.object({
  telegramBotToken: z.string().min(1).optional(),
  modelRef: z.string().min(1).default("openai-codex/gpt-5.3-codex"),
  codexLoginMode: z.enum(["auto", "oauth", "codex-cli"]).default("auto"),
  workspaceRoot: z.string().min(1).default(DEFAULT_WORKSPACE_ROOT),
  enableMacRun: z.boolean().default(DEFAULT_ENABLE_MAC_RUN),
  browserHeadless: z.boolean().default(true),
  adminHost: z.string().min(1).default("127.0.0.1"),
  adminPort: z.number().int().min(0).max(65535).default(3187),
});

export type LiteConfig = z.infer<typeof configSchema>;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.length === 0) {
    return defaultValue;
  }
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfig(): LiteConfig {
  const parsed = configSchema.safeParse({
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    modelRef: process.env.MODEL_REF,
    codexLoginMode: process.env.CODEX_LOGIN_MODE,
    workspaceRoot: process.env.WORKSPACE_ROOT,
    enableMacRun: parseBoolean(process.env.ENABLE_MAC_RUN, DEFAULT_ENABLE_MAC_RUN),
    browserHeadless: parseBoolean(process.env.BROWSER_HEADLESS, true),
    adminHost: process.env.ADMIN_HOST,
    adminPort: process.env.ADMIN_PORT ? Number(process.env.ADMIN_PORT) : undefined,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid config: ${details}`);
  }

  const workspaceRoot = path.resolve(parsed.data.workspaceRoot);
  fs.mkdirSync(workspaceRoot, { recursive: true });

  return {
    ...parsed.data,
    workspaceRoot,
  };
}

export function parseModelRef(modelRef: string): { provider: string; model: string } {
  const [provider, ...rest] = modelRef.split("/");
  if (!provider || rest.length === 0) {
    throw new Error(`Invalid MODEL_REF: ${modelRef}`);
  }
  return { provider, model: rest.join("/") };
}
