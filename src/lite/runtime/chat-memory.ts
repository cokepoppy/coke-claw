export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface ChatMemoryOptions {
  maxMessages: number;
  maxChars: number;
}

export class ChatMemoryStore {
  private readonly memory = new Map<string, ChatTurn[]>();

  constructor(private readonly options: ChatMemoryOptions = { maxMessages: 20, maxChars: 16_000 }) {}

  list(sessionKey: string): ChatTurn[] {
    const turns = this.memory.get(sessionKey) ?? [];
    return turns.slice();
  }

  append(sessionKey: string, turn: Omit<ChatTurn, "ts">): void {
    const next = [...(this.memory.get(sessionKey) ?? []), { ...turn, ts: Date.now() }];
    this.memory.set(sessionKey, this.trim(next));
  }

  clear(sessionKey: string): void {
    this.memory.delete(sessionKey);
  }

  private trim(turns: ChatTurn[]): ChatTurn[] {
    let next = turns.slice(-this.options.maxMessages);
    while (next.length > 0) {
      const chars = next.reduce((acc, t) => acc + t.content.length, 0);
      if (chars <= this.options.maxChars) {
        break;
      }
      next = next.slice(1);
    }
    return next;
  }
}
