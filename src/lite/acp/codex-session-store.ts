import fs from "node:fs";
import path from "node:path";

export interface CodexSessionRecord {
  sessionKey: string;
  threadId: string;
  cwd: string;
  updatedAt: number;
}

interface SessionStoreFile {
  records: CodexSessionRecord[];
}

export class CodexSessionStore {
  constructor(private readonly workspaceRoot: string) {}

  private get storePath(): string {
    return path.join(this.workspaceRoot, ".coke-claw-lite", "codex-sessions.json");
  }

  private ensureLoaded(): Map<string, CodexSessionRecord> {
    let loaded: SessionStoreFile = { records: [] };
    try {
      if (fs.existsSync(this.storePath)) {
        loaded = JSON.parse(fs.readFileSync(this.storePath, "utf8")) as SessionStoreFile;
      }
    } catch {
      loaded = { records: [] };
    }

    const map = new Map<string, CodexSessionRecord>();
    for (const record of loaded.records ?? []) {
      if (record?.sessionKey && record?.threadId) {
        map.set(record.sessionKey, record);
      }
    }
    return map;
  }

  private flush(map: Map<string, CodexSessionRecord>): void {
    const payload: SessionStoreFile = {
      records: [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    };

    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(payload, null, 2), "utf8");
  }

  get(sessionKey: string): CodexSessionRecord | null {
    const map = this.ensureLoaded();
    return map.get(sessionKey) ?? null;
  }

  set(sessionKey: string, threadId: string, cwd: string): CodexSessionRecord {
    const map = this.ensureLoaded();
    const record: CodexSessionRecord = {
      sessionKey,
      threadId,
      cwd,
      updatedAt: Date.now(),
    };
    map.set(sessionKey, record);
    this.flush(map);
    return record;
  }

  delete(sessionKey: string): boolean {
    const map = this.ensureLoaded();
    const changed = map.delete(sessionKey);
    if (changed) {
      this.flush(map);
    }
    return changed;
  }

  listByPrefix(prefix: string): CodexSessionRecord[] {
    const map = this.ensureLoaded();
    return [...map.values()]
      .filter((record) => record.sessionKey.startsWith(prefix))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
