import OpenAI from "openai";
import { LiteConfig } from "../config.js";
import { createOpenAIClient } from "../auth/openai-client.js";
import { createToolRuntime, type ToolDefinition } from "../tools/index.js";
import { ChatMemoryStore } from "./chat-memory.js";

export interface ReplyResult {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function extractText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (item?.type !== "message") {
      continue;
    }
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
      if (part?.type === "text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractFunctionCalls(response: any): Array<{ callId: string; name: string; arguments: string }> {
  const output = Array.isArray(response?.output) ? response.output : [];
  const calls: Array<{ callId: string; name: string; arguments: string }> = [];

  for (const item of output) {
    if (item?.type !== "function_call") {
      continue;
    }

    const callId = typeof item.call_id === "string" ? item.call_id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const args = typeof item.arguments === "string" ? item.arguments : "{}";
    if (!callId || !name) {
      continue;
    }
    calls.push({ callId, name, arguments: args });
  }

  return calls;
}

async function createResponse(client: OpenAI, payload: Record<string, unknown>): Promise<any> {
  return await client.responses.create(payload as any);
}

export function createReplyRuntime(config: LiteConfig) {
  const { client, modelTarget } = createOpenAIClient(config);
  const tools = createToolRuntime(config);
  const toolDefs: ToolDefinition[] = tools.definitions;
  const memory = new ChatMemoryStore();

  async function reply(message: string, sessionKey: string): Promise<ReplyResult> {
    const history = memory.list(sessionKey).map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    let response = await createResponse(client, {
      model: modelTarget.model,
      input: [
        {
          role: "system",
          content:
            "You are coke-claw-lite. Keep responses concise and execute tools only when needed. Session: " +
            sessionKey,
        },
        ...history,
        { role: "user", content: message },
      ],
      tools: toolDefs,
    });

    for (let i = 0; i < 8; i += 1) {
      const calls = extractFunctionCalls(response);
      if (calls.length === 0) {
        break;
      }

      const outputs = [];
      for (const call of calls) {
        const args = safeParseJson(call.arguments);
        try {
          const result = await tools.run(call.name, args);
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify(result),
          });
        } catch (error) {
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          });
        }
      }

      response = await createResponse(client, {
        model: modelTarget.model,
        previous_response_id: response.id,
        input: outputs,
        tools: toolDefs,
      });
    }

    const text = extractText(response) || "(empty response)";
    memory.append(sessionKey, { role: "user", content: message });
    memory.append(sessionKey, { role: "assistant", content: text });
    const usage = response?.usage
      ? {
          inputTokens:
            typeof response.usage.input_tokens === "number" ? response.usage.input_tokens : undefined,
          outputTokens:
            typeof response.usage.output_tokens === "number" ? response.usage.output_tokens : undefined,
        }
      : undefined;

    return { text, usage };
  }

  return { reply };
}
