import { getModel, getOAuthApiKey, type Api, type Model, type OAuthCredentials } from "@mariozechner/pi-ai";
import fs from "node:fs";
import path from "node:path";
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

const OAUTH_CACHE_RELATIVE_PATH = ".coke-claw-lite/openai-codex-oauth.json";

type StoredCodexOAuthCredentials = OAuthCredentials & {
  accountId?: string;
  email?: string;
  updatedAt?: string;
};

export interface ResolvedModelAuth {
  model: Model<Api>;
  modelTarget: ModelTarget;
  auth: ResolvedAuth;
  transport?: "auto";
}

function resolveOpenAIApiKeyAuth(): ResolvedAuth {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY for provider openai. If you want Codex OAuth, set MODEL_REF=openai-codex/gpt-5.3-codex.",
    );
  }
  return { token: apiKey, source: "env" };
}

function resolveOauthCachePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, OAUTH_CACHE_RELATIVE_PATH);
}

function coerceOAuthCredentials(raw: unknown): OAuthCredentials | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const typed = raw as Record<string, unknown>;
  const access = typeof typed.access === "string" ? typed.access.trim() : "";
  const refresh = typeof typed.refresh === "string" ? typed.refresh.trim() : "";
  const expires = typeof typed.expires === "number" ? typed.expires : Number.NaN;
  if (!access || !refresh || !Number.isFinite(expires) || expires <= 0) {
    return null;
  }
  return { ...typed, access, refresh, expires } as OAuthCredentials;
}

function readStoredCodexOAuth(workspaceRoot: string): OAuthCredentials | null {
  const filePath = resolveOauthCachePath(workspaceRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return coerceOAuthCredentials(parsed);
  } catch {
    return null;
  }
}

function writeStoredCodexOAuth(workspaceRoot: string, credential: OAuthCredentials): void {
  const filePath = resolveOauthCachePath(workspaceRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload: StoredCodexOAuthCredentials = {
    ...credential,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort hardening; ignore on filesystems that do not support chmod.
  }
}

function readCodexCredentialFromCli(): OAuthCredentials | null {
  const codex = readCodexCliCredentials();
  if (!codex) {
    return null;
  }
  if (!codex.accessToken || !codex.refreshToken) {
    return null;
  }
  return {
    access: codex.accessToken,
    refresh: codex.refreshToken,
    expires: codex.expiresAt,
    accountId: codex.accountId,
  };
}

function pickCodexCredential(config: LiteConfig): OAuthCredentials | null {
  const stored = readStoredCodexOAuth(config.workspaceRoot);
  const fromCli = readCodexCredentialFromCli();
  if (!stored) {
    return fromCli;
  }
  if (!fromCli) {
    return stored;
  }
  if (fromCli.access !== stored.access) {
    return fromCli.expires >= stored.expires ? fromCli : stored;
  }
  return fromCli.expires >= stored.expires ? fromCli : stored;
}

async function resolveCodexOAuthAuth(config: LiteConfig): Promise<ResolvedAuth> {
  const credential = pickCodexCredential(config);
  if (!credential) {
    throw new Error("No Codex OAuth credentials found. Run `codex login` first.");
  }

  const oauthMap: Record<string, OAuthCredentials> = {
    "openai-codex": credential,
  };

  try {
    const refreshed = await getOAuthApiKey("openai-codex", oauthMap);
    if (!refreshed) {
      throw new Error("Codex OAuth credential map is empty.");
    }
    writeStoredCodexOAuth(config.workspaceRoot, refreshed.newCredentials);
    return { token: refreshed.apiKey, source: "codex-cli" };
  } catch (error) {
    if (Date.now() < credential.expires) {
      return { token: credential.access, source: "codex-cli" };
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Codex OAuth token refresh failed: ${message}`);
  }
}

function resolveModel(config: LiteConfig): { model: Model<Api>; modelTarget: ModelTarget } {
  const modelTarget = parseModelRef(config.modelRef);
  if (!["openai", "openai-codex"].includes(modelTarget.provider)) {
    throw new Error(`Unsupported provider for lite mode: ${modelTarget.provider}`);
  }
  const model = getModel(modelTarget.provider as any, modelTarget.model as any) as Model<Api> | undefined;
  if (!model) {
    throw new Error(`Unknown model: ${modelTarget.provider}/${modelTarget.model}`);
  }
  return { model, modelTarget };
}

export async function resolveModelAuth(config: LiteConfig): Promise<ResolvedModelAuth> {
  const { model, modelTarget } = resolveModel(config);
  const auth =
    modelTarget.provider === "openai-codex"
      ? await resolveCodexOAuthAuth(config)
      : resolveOpenAIApiKeyAuth();
  return {
    model,
    modelTarget,
    auth,
    transport: modelTarget.provider === "openai-codex" ? "auto" : undefined,
  };
}

export function inspectOpenAIAuth(config: LiteConfig): {
  ok: boolean;
  source?: ResolvedAuth["source"];
  message?: string;
} {
  try {
    const { modelTarget } = resolveModel(config);
    if (modelTarget.provider === "openai-codex") {
      const cred = pickCodexCredential(config);
      if (!cred) {
        return { ok: false, message: "No Codex OAuth credentials found. Run `codex login` first." };
      }
      return { ok: true, source: "codex-cli" };
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Missing OPENAI_API_KEY for provider openai. If you want Codex OAuth, set MODEL_REF=openai-codex/gpt-5.3-codex.",
      };
    }
    return { ok: true, source: "env" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
