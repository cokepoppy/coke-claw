import fs from "node:fs/promises";
import path from "node:path";

function resolveTargetPath(workspaceRoot: string, rawPath: string): string {
  const input = rawPath.trim();
  if (!input || input === ".") {
    return path.resolve(workspaceRoot);
  }
  if (path.isAbsolute(input)) {
    return path.resolve(input);
  }
  return path.resolve(workspaceRoot, input);
}

const SEARCH_SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", ".cache"]);

function toRelative(workspaceRoot: string, absolute: string): string {
  return path.relative(workspaceRoot, absolute) || ".";
}

export async function fsReadText(workspaceRoot: string, filePath: string): Promise<string> {
  const absolute = resolveTargetPath(workspaceRoot, filePath);
  return fs.readFile(absolute, "utf8");
}

export async function fsCreateFile(
  workspaceRoot: string,
  filePath: string,
  content = "",
  overwrite = false,
): Promise<{ path: string; bytes: number; created: boolean }> {
  const absolute = resolveTargetPath(workspaceRoot, filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const exists = await fs
    .stat(absolute)
    .then(() => true)
    .catch(() => false);
  if (exists && !overwrite) {
    throw new Error(`File already exists: ${filePath}`);
  }
  await fs.writeFile(absolute, content, "utf8");
  return {
    path: absolute,
    bytes: Buffer.byteLength(content, "utf8"),
    created: !exists,
  };
}

export async function fsWriteText(
  workspaceRoot: string,
  filePath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const absolute = resolveTargetPath(workspaceRoot, filePath);
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
  const absolute = resolveTargetPath(workspaceRoot, filePath);
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
  const absolute = resolveTargetPath(workspaceRoot, dirPath || ".");
  const entries = await fs.readdir(absolute);
  return { path: absolute, entries };
}

export async function fsSearchFiles(
  workspaceRoot: string,
  query: string,
  dirPath = ".",
  maxResults = 50,
): Promise<{ path: string; query: string; matches: string[] }> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("query cannot be empty");
  }
  const start = resolveTargetPath(workspaceRoot, dirPath);
  const queue: string[] = [start];
  const hits: string[] = [];
  const needle = trimmed.toLowerCase();
  const hardLimit = Math.min(Math.max(Number(maxResults) || 50, 1), 500);

  while (queue.length > 0 && hits.length < hardLimit) {
    const current = queue.shift()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (hits.length >= hardLimit) {
        break;
      }
      const absolute = path.join(current, entry.name);
      const relative = toRelative(workspaceRoot, absolute);
      const displayPath = relative.startsWith("..") || path.isAbsolute(relative) ? absolute : relative;
      if (entry.isDirectory()) {
        if (SEARCH_SKIP_DIRS.has(entry.name)) {
          continue;
        }
        queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (displayPath.toLowerCase().includes(needle)) {
        hits.push(displayPath);
      }
    }
  }

  return {
    path: start,
    query: trimmed,
    matches: hits,
  };
}
