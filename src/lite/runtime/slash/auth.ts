import { LiteConfig } from "../../config.js";
import { inspectOpenAIAuth } from "../../auth/openai-client.js";
import { getCodexLoginStatus, startCodexDeviceLogin } from "../../auth/codex-login.js";

export async function runAuthCommand(args: string, config: LiteConfig): Promise<string> {
  const action = args.trim().split(/\s+/)[0]?.toLowerCase() || "status";

  if (action === "login") {
    const started = await startCodexDeviceLogin();
    const lines: string[] = [];
    lines.push("Codex device login initialized.");
    if (started.url) {
      lines.push(`Open URL: ${started.url}`);
    }
    if (started.code) {
      lines.push(`Code: ${started.code}`);
    }
    lines.push("Complete login in browser, then run /auth status.");
    if (!started.url || !started.code) {
      lines.push("Raw output:");
      lines.push(started.text);
    }
    return lines.join("\n");
  }

  if (action === "status") {
    const codexStatus = await getCodexLoginStatus();
    const modelAuth = inspectOpenAIAuth(config);
    return [
      `Codex login: ${codexStatus.loggedIn ? "logged-in" : "not-logged-in"}`,
      `Codex status output: ${codexStatus.text}`,
      `Model auth: ${modelAuth.ok ? `ok (${modelAuth.source})` : `missing (${modelAuth.message})`}`,
      "Tip: run /auth login to start device OAuth login.",
    ].join("\n");
  }

  return "Usage: /auth status | /auth login";
}
