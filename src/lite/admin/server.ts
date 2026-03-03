import express, { type Request, type Response } from "express";
import { completeSimple } from "@mariozechner/pi-ai";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LiteConfig } from "../config.js";
import { createRouter } from "../runtime/router.js";
import {
  buildCodingAgentRawArgs,
  createCodingAgentCommandRunner,
} from "../runtime/slash/coding-agent.js";
import { CodexSessionStore } from "../acp/codex-session-store.js";
import { inspectOpenAIAuth, resolveModelAuth } from "../auth/openai-client.js";
import { getCodexLoginStatus, startCodexDeviceLogin } from "../auth/codex-login.js";

function resolvePublicRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const direct = path.join(here, "public");
  if (fs.existsSync(direct)) {
    return direct;
  }

  const sourcePath = path.resolve(process.cwd(), "src/lite/admin/public");
  if (fs.existsSync(sourcePath)) {
    return sourcePath;
  }

  throw new Error("admin public assets not found");
}

type ApiResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

function sendJson(res: Response, status: number, payload: ApiResult) {
  res.status(status).json(payload);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function probeModelApis(config: LiteConfig): Promise<{
  model?: string;
  provider?: string;
  authSource?: "env" | "codex-cli";
  authError?: string;
  responses: { ok: boolean; error?: string };
  chatCompletions: { ok: boolean; error?: string };
}> {
  try {
    const { model, modelTarget, auth, transport } = await resolveModelAuth(config);
    const result = {
      model: modelTarget.model,
      provider: modelTarget.provider,
      authSource: auth.source,
      responses: { ok: false } as { ok: boolean; error?: string },
      chatCompletions: { ok: false } as { ok: boolean; error?: string },
    };

    try {
      const response = await completeSimple(
        model as any,
        {
          systemPrompt: "You are a connectivity probe. Reply with pong.",
          messages: [{ role: "user", content: "ping" }],
        } as any,
        {
          apiKey: auth.token,
          transport,
          sessionId: "admin:auth-probe",
        },
      );
      if (response.stopReason === "error") {
        throw new Error(response.errorMessage || "model probe failed");
      }
      result.responses = { ok: true };
    } catch (error) {
      result.responses = { ok: false, error: formatError(error) };
    }

    result.chatCompletions = {
      ok: false,
      error: "not-used (coke-claw-lite now probes through pi-ai provider transport)",
    };

    return result;
  } catch (error) {
    const authError = formatError(error);
    return {
      authError,
      responses: { ok: false, error: authError },
      chatCompletions: { ok: false, error: authError },
    };
  }
}

export async function startAdminServer(config: LiteConfig): Promise<{ server: Server; url: string }> {
  const app = express();
  const router = createRouter(config);
  const codingAgent = createCodingAgentCommandRunner(config.workspaceRoot);
  const codexSessions = new CodexSessionStore(config.workspaceRoot);
  const publicRoot = resolvePublicRoot();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    const auth = inspectOpenAIAuth(config);
    sendJson(res, 200, {
      ok: true,
      data: {
        service: "coke-claw-lite",
        now: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        workspaceRoot: config.workspaceRoot,
        modelRef: config.modelRef,
        codexLoginMode: config.codexLoginMode,
        auth,
        telegramEnabled: Boolean(config.telegramBotToken),
      },
    });
  });

  app.get("/api/auth/status", async (_req: Request, res: Response) => {
    try {
      const codex = await getCodexLoginStatus();
      const modelAuth = inspectOpenAIAuth(config);
      sendJson(res, 200, {
        ok: true,
        data: {
          codex,
          modelAuth,
        },
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/auth/login", async (_req: Request, res: Response) => {
    try {
      const login = await startCodexDeviceLogin();
      sendJson(res, 200, {
        ok: true,
        data: login,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/auth/probe", async (_req: Request, res: Response) => {
    try {
      const data = await probeModelApis(config);
      sendJson(res, 200, { ok: true, data });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: formatError(error),
      });
    }
  });

  app.get("/api/coding-agent/sessions", (req: Request, res: Response) => {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : "";
    const records = codexSessions.listByPrefix(prefix);
    sendJson(res, 200, { ok: true, data: records });
  });

  app.post("/api/coding-agent/run", async (req: Request, res: Response) => {
    const sessionKey = String(req.body?.sessionKey ?? "").trim();
    const task = String(req.body?.task ?? "").trim();
    const mode = req.body?.mode === "oneshot" ? "oneshot" : "persistent";
    const cwd = typeof req.body?.cwd === "string" ? req.body.cwd : undefined;
    const forceNew = Boolean(req.body?.forceNew);

    if (!sessionKey) {
      sendJson(res, 400, { ok: false, error: "sessionKey is required" });
      return;
    }
    if (!task) {
      sendJson(res, 400, { ok: false, error: "task is required" });
      return;
    }

    try {
      const rawArgs = buildCodingAgentRawArgs({ task, mode, cwd, forceNew });
      const text = await codingAgent.run(rawArgs, sessionKey);
      sendJson(res, 200, { ok: true, data: { text } });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/coding-agent/command", async (req: Request, res: Response) => {
    const sessionKey = String(req.body?.sessionKey ?? "").trim();
    const command = String(req.body?.command ?? "").trim();

    if (!sessionKey) {
      sendJson(res, 400, { ok: false, error: "sessionKey is required" });
      return;
    }
    if (!["sessions", "reset"].includes(command)) {
      sendJson(res, 400, { ok: false, error: "command must be sessions or reset" });
      return;
    }

    try {
      const text = await codingAgent.run(command, sessionKey);
      sendJson(res, 200, { ok: true, data: { text } });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    const sessionKey = String(req.body?.sessionKey ?? "").trim();
    const text = String(req.body?.text ?? "").trim();

    if (!sessionKey) {
      sendJson(res, 400, { ok: false, error: "sessionKey is required" });
      return;
    }
    if (!text) {
      sendJson(res, 400, { ok: false, error: "text is required" });
      return;
    }

    try {
      const result = await router.route({
        text,
        sessionKey,
        channel: "console",
      });
      sendJson(res, 200, { ok: true, data: { text: result } });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.use(express.static(publicRoot));

  app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(publicRoot, "index.html"));
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(config.adminPort, config.adminHost, () => resolve(s));
    s.on("error", reject);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.adminPort;
  const url = `http://${config.adminHost}:${port}`;

  // eslint-disable-next-line no-console
  console.log(`Admin UI listening on ${url}`);

  return { server, url };
}
