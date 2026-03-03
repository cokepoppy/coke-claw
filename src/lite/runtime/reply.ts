import {
  completeSimple,
  type Api,
  type AssistantMessage,
  type CacheRetention,
  type Model,
  type ToolCall,
} from "@mariozechner/pi-ai";
import { LiteConfig } from "../config.js";
import { resolveModelAuth } from "../auth/openai-client.js";
import { createToolRuntime, type ToolDefinition } from "../tools/index.js";
import { ChatMemoryStore } from "./chat-memory.js";

export interface ReplyResult {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

function extractText(response: AssistantMessage): string {
  const chunks: string[] = [];
  for (const part of response.content) {
    if (part.type === "text") {
      chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractToolCalls(response: AssistantMessage): ToolCall[] {
  return response.content.filter((part): part is ToolCall => part.type === "toolCall");
}

function buildUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function historyToPiMessages(history: Array<{ role: "user" | "assistant"; content: string; ts: number }>, model: Model<Api>) {
  return history.map((turn) => {
    if (turn.role === "user") {
      return {
        role: "user" as const,
        content: turn.content,
        timestamp: turn.ts,
      };
    }
    return {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: turn.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: buildUsage(),
      stopReason: "stop" as const,
      timestamp: turn.ts,
    };
  });
}

function toPiTools(toolDefs: ToolDefinition[]) {
  return toolDefs.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as any,
  }));
}

function resolveCacheRetention(config: LiteConfig): CacheRetention {
  if (config.modelRef.startsWith("openai-codex/")) {
    return "short";
  }
  return "none";
}

async function createModelResponse(params: {
  model: Model<Api>;
  authToken: string;
  transport?: "auto";
  systemPrompt: string;
  messages: any[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  sessionKey: string;
  config: LiteConfig;
}): Promise<AssistantMessage> {
  const { model, authToken, transport, systemPrompt, messages, tools, sessionKey, config } = params;
  return await completeSimple(
    model as any,
    {
      systemPrompt,
      messages,
      tools,
    } as any,
    {
      apiKey: authToken,
      transport,
      sessionId: sessionKey,
      cacheRetention: resolveCacheRetention(config),
    },
  );
}

export function createReplyRuntime(config: LiteConfig) {
  const tools = createToolRuntime(config);
  const toolDefs: ToolDefinition[] = tools.definitions;
  const piTools = toPiTools(toolDefs);
  const memory = new ChatMemoryStore();

  async function reply(message: string, sessionKey: string): Promise<ReplyResult> {
    const { model, auth, transport } = await resolveModelAuth(config);
    const history = memory.list(sessionKey);
    const historyMessages = historyToPiMessages(history, model);
    const systemPrompt =
      "You are coke-claw-lite. Keep responses concise and execute tools only when needed. Session: " +
      sessionKey;
    const messages: any[] = [
      ...historyMessages,
      {
        role: "user" as const,
        content: message,
        timestamp: Date.now(),
      },
    ];

    let response = await createModelResponse({
      model,
      authToken: auth.token,
      transport,
      systemPrompt,
      messages,
      tools: piTools,
      sessionKey,
      config,
    });

    for (let i = 0; i < 8; i += 1) {
      const calls = extractToolCalls(response);
      if (calls.length === 0) {
        break;
      }

      messages.push(response);
      for (const call of calls) {
        try {
          const result = await tools.run(call.name, call.arguments);
          messages.push({
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: "text", text: JSON.stringify(result) }],
            isError: false,
            timestamp: Date.now(),
          });
        } catch (error) {
          messages.push({
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
              },
            ],
            isError: true,
            timestamp: Date.now(),
          });
        }
      }

      response = await createModelResponse({
        model,
        authToken: auth.token,
        transport,
        systemPrompt,
        messages,
        tools: piTools,
        sessionKey,
        config,
      });
    }

    if (response.stopReason === "error" && response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    const text = extractText(response) || "(empty response)";
    memory.append(sessionKey, { role: "user", content: message });
    memory.append(sessionKey, { role: "assistant", content: text });
    const usage = response?.usage
      ? {
          inputTokens: typeof response.usage.input === "number" ? response.usage.input : undefined,
          outputTokens: typeof response.usage.output === "number" ? response.usage.output : undefined,
        }
      : undefined;

    return { text, usage };
  }

  return { reply };
}
