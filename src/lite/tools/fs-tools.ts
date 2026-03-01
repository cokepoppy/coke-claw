import fs from "node:fs/promises";
import path from "node:path";

function assertInsideWorkspace(workspaceRoot: string, rawPath: string): string {
  const absolute = path.resolve(workspaceRoot, rawPath);
  const relative = path.relative(workspaceRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${rawPath}`);
  }
  return absolute;
}

export async function fsReadText(workspaceRoot: string, filePath: string): Promise<string> {
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  return fs.readFile(absolute, "utf8");
}

export async function fsWriteText(
  workspaceRoot: string,
  filePath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  return { path: absolute, bytes: Buffer.byteLength(content, "utf8") };
}

export async function fsEditText(
  workspaceRoot: string,
  filePath: string,
  find: string,
  replace: string,
): Promise<{ path: string; replaced: number }> {
  const absolute = assertInsideWorkspace(workspaceRoot, filePath);
  const original = await fs.readFile(absolute, "utf8");
  if (!find) {
    throw new Error("edit find cannot be empty");
  }
  const chunks = original.split(find);
  if (chunks.length <= 1) {
    return { path: absolute, replaced: 0 };
  }
  const replaced = chunks.length - 1;
  const next = chunks.join(replace);
  await fs.writeFile(absolute, next, "utf8");
  return { path: absolute, replaced };
}

export async function fsListFiles(
  workspaceRoot: string,
  dirPath: string,
): Promise<{ path: string; entries: string[] }> {
  const absolute = assertInsideWorkspace(workspaceRoot, dirPath || ".");
  const entries = await fs.readdir(absolute);
  return { path: absolute, entries };
}
