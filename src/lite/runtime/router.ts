import { LiteConfig } from "../config.js";
import { createReplyRuntime } from "./reply.js";
import { runAuthCommand } from "./slash/auth.js";
import { createCodingAgentCommandRunner } from "./slash/coding-agent.js";
import { helpText } from "./slash/help.js";

export interface RouterInput {
  text: string;
  sessionKey: string;
  channel: "telegram" | "console";
}

export function createRouter(config: LiteConfig) {
  let runtime: ReturnType<typeof createReplyRuntime> | null = null;
  const codingAgent = createCodingAgentCommandRunner(config.workspaceRoot);

  function getRuntime(): ReturnType<typeof createReplyRuntime> {
    if (!runtime) {
      runtime = createReplyRuntime(config);
    }
    return runtime;
  }

  async function handleSlash(input: RouterInput): Promise<string | null> {
    const text = input.text;
    if (!text.startsWith("/")) {
      return null;
    }

    const trimmed = text.trim();
    const [command, ...rest] = trimmed.split(/\s+/);
    const args = rest.join(" ").trim();

    if (command === "/help" || command === "/start") {
      return helpText();
    }

    if (command === "/coding_agent") {
      return await codingAgent.run(args, input.sessionKey);
    }

    if (command === "/auth") {
      return await runAuthCommand(args, config);
    }

    return `Unknown command: ${command}. Use /help.`;
  }

  async function route(input: RouterInput): Promise<string> {
    const slashOutput = await handleSlash(input);
    if (slashOutput != null) {
      return slashOutput;
    }

    const response = await getRuntime().reply(input.text, input.sessionKey);
    return response.text;
  }

  return { route };
}
