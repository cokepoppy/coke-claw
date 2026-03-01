import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

export interface CodexCliCredential {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
  source: "keychain" | "auth.json";
}

function resolveUserPath(value: string): string {
  if (!value.startsWith("~")) {
    return value;
  }
  return path.join(os.homedir(), value.slice(1));
}

function resolveCodexHomePath(): string {
  const configured = process.env.CODEX_HOME;
  const home = configured ? resolveUserPath(configured) : resolveUserPath("~/.codex");
  try {
    return fs.realpathSync.native(home);
  } catch {
    return home;
  }
}

function computeCodexKeychainAccount(codexHome: string): string {
  const hash = createHash("sha256").update(codexHome).digest("hex");
  return `cli|${hash.slice(0, 16)}`;
}

function readFromMacKeychain(): CodexCliCredential | null {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const codexHome = resolveCodexHomePath();
    const account = computeCodexKeychainAccount(codexHome);
    const secret = execSync(
      `security find-generic-password -s "Codex Auth" -a "${account}" -w`,
      {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();

    const parsed = JSON.parse(secret) as Record<string, unknown>;
    const tokens = parsed.tokens as Record<string, unknown> | undefined;
    const accessToken = typeof tokens?.access_token === "string" ? tokens.access_token : "";
    const refreshToken = typeof tokens?.refresh_token === "string" ? tokens.refresh_token : "";
    if (!accessToken || !refreshToken) {
      return null;
    }

    const lastRefreshRaw = parsed.last_refresh;
    const lastRefresh =
      typeof lastRefreshRaw === "string" || typeof lastRefreshRaw === "number"
        ? new Date(lastRefreshRaw).getTime()
        : Date.now();
    const expiresAt = Number.isFinite(lastRefresh)
      ? lastRefresh + 60 * 60 * 1000
      : Date.now() + 60 * 60 * 1000;

    return {
      accessToken,
      refreshToken,
      expiresAt,
      accountId: typeof tokens?.account_id === "string" ? tokens.account_id : undefined,
      source: "keychain",
    };
  } catch {
    return null;
  }
}

function readFromAuthJson(): CodexCliCredential | null {
  const authPath = path.join(resolveCodexHomePath(), "auth.json");
  if (!fs.existsSync(authPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, "utf8")) as Record<string, unknown>;
    const tokens = parsed.tokens as Record<string, unknown> | undefined;
    const accessToken = typeof tokens?.access_token === "string" ? tokens.access_token : "";
    const refreshToken = typeof tokens?.refresh_token === "string" ? tokens.refresh_token : "";
    if (!accessToken || !refreshToken) {
      return null;
    }

    const mtime = fs.statSync(authPath).mtimeMs;
    return {
      accessToken,
      refreshToken,
      expiresAt: mtime + 60 * 60 * 1000,
      accountId: typeof tokens?.account_id === "string" ? tokens.account_id : undefined,
      source: "auth.json",
    };
  } catch {
    return null;
  }
}

export function readCodexCliCredentials(): CodexCliCredential | null {
  const keychain = readFromMacKeychain();
  if (keychain) {
    return keychain;
  }
  return readFromAuthJson();
}
