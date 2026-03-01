import OpenAI from "openai";
import { LiteConfig, parseModelRef } from "../config.js";
import { readCodexCliCredentials } from "./codex-cli-bridge.js";

export interface ModelTarget {
  provider: string;
  model: string;
}

export interface ResolvedAuth {
  token: string;
  source: "env" | "codex-cli";
}

function resolveAuth(config: LiteConfig): ResolvedAuth {
  const preferCodex = config.codexLoginMode === "auto" || config.codexLoginMode === "codex-cli";
  const preferEnv = config.codexLoginMode === "oauth" ? false : !preferCodex;

  if (preferCodex) {
    const codexFirst = readCodexCliCredentials();
    if (codexFirst?.accessToken) {
      return { token: codexFirst.accessToken, source: "codex-cli" };
    }
  }

  if (preferEnv && process.env.OPENAI_API_KEY) {
    return { token: process.env.OPENAI_API_KEY, source: "env" };
  }

  if (!preferCodex) {
    const codexFallback = readCodexCliCredentials();
    if (codexFallback?.accessToken) {
      return { token: codexFallback.accessToken, source: "codex-cli" };
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return { token: process.env.OPENAI_API_KEY, source: "env" };
  }

  throw new Error(
    "No OpenAI credentials found. Set OPENAI_API_KEY or run Codex login (so ~/.codex/auth.json / Keychain has token).",
  );
}

export function inspectOpenAIAuth(config: LiteConfig): {
  ok: boolean;
  source?: ResolvedAuth["source"];
  message?: string;
} {
  try {
    const auth = resolveAuth(config);
    return { ok: true, source: auth.source };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function createOpenAIClient(config: LiteConfig): {
  client: OpenAI;
  modelTarget: ModelTarget;
  auth: ResolvedAuth;
} {
  const modelTarget = parseModelRef(config.modelRef);
  if (!["openai", "openai-codex"].includes(modelTarget.provider)) {
    throw new Error(`Unsupported provider for lite mode: ${modelTarget.provider}`);
  }

  const auth = resolveAuth(config);
  const client = new OpenAI({ apiKey: auth.token });

  return { client, modelTarget, auth };
}
