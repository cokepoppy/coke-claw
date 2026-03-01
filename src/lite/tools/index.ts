import { LiteConfig } from "../config.js";
import { createBrowserTools } from "./browser-tools.js";
import { fsEditText, fsListFiles, fsReadText, fsWriteText } from "./fs-tools.js";
import { runMacCommand } from "./mac-run.js";

export interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolRuntime {
  definitions: ToolDefinition[];
  run(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export function createToolRuntime(config: LiteConfig): ToolRuntime {
  const browser = createBrowserTools({
    headless: config.browserHeadless,
    workspaceRoot: config.workspaceRoot,
  });

  const definitions: ToolDefinition[] = [
    {
      type: "function",
      name: "fs_read_text",
      description: "Read utf-8 text file within workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "fs_write_text",
      description: "Write utf-8 text file within workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "fs_edit_text",
      description: "Replace text in a file within workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          find: { type: "string" },
          replace: { type: "string" },
        },
        required: ["path", "find", "replace"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "fs_list_files",
      description: "List files in a workspace directory",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "browser_navigate",
      description: "Navigate browser to URL",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "browser_snapshot",
      description: "Get current page text snapshot",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "browser_click",
      description: "Click an element by selector",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "browser_type",
      description: "Type into an element by selector",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          text: { type: "string" },
          submit: { type: "boolean" },
        },
        required: ["selector", "text"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "browser_screenshot",
      description: "Capture screenshot to a workspace relative path",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  ];

  if (config.enableMacRun) {
    definitions.push({
      type: "function",
      name: "mac_run",
      description: "Run a shell command on macOS",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["command"],
        additionalProperties: false,
      },
    });
  }

  return {
    definitions,
    async run(name, args) {
      switch (name) {
        case "fs_read_text":
          return await fsReadText(config.workspaceRoot, String(args.path));
        case "fs_write_text":
          return await fsWriteText(config.workspaceRoot, String(args.path), String(args.content));
        case "fs_edit_text":
          return await fsEditText(
            config.workspaceRoot,
            String(args.path),
            String(args.find),
            String(args.replace),
          );
        case "fs_list_files":
          return await fsListFiles(config.workspaceRoot, String(args.path));
        case "browser_navigate":
          return await browser.navigate(String(args.url));
        case "browser_snapshot":
          return await browser.snapshot();
        case "browser_click":
          return await browser.click(String(args.selector));
        case "browser_type":
          return await browser.type(String(args.selector), String(args.text), Boolean(args.submit));
        case "browser_screenshot":
          return await browser.screenshot(String(args.path));
        case "mac_run": {
          if (!config.enableMacRun) {
            throw new Error("mac_run disabled by config");
          }
          return await runMacCommand(String(args.command), Number(args.timeoutMs ?? 20_000));
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
