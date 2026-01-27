import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

interface CacheEntry {
  path: string;
  timestamp: number;
  base64?: string;
}

export class EmojiCache {
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private entries: Record<string, CacheEntry> = {};
  private expirationMs = 86400000; // 24 hours

  constructor(context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, "emoji-cache");
    this.cacheFile = path.join(this.cacheDir, "cache.json");
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, "utf-8"));
        this.entries = data.entries ?? {};
      }
    } catch {
      /* ignore */
    }
  }

  private save() {
    try {
      fs.writeFileSync(
        this.cacheFile,
        JSON.stringify({ entries: this.entries }),
      );
    } catch {
      /* ignore */
    }
  }

  setExpiration(seconds: number) {
    this.expirationMs = seconds * 1000;
  }

  getCacheDir() {
    return this.cacheDir;
  }

  private isValid(entry: CacheEntry): boolean {
    return (
      Date.now() - entry.timestamp <= this.expirationMs &&
      fs.existsSync(entry.path)
    );
  }

  getBase64(emojiId: string): string | null {
    const entry = this.entries[emojiId];
    if (!entry || !this.isValid(entry)) {
      if (entry) this.remove(emojiId);
      return null;
    }
    return entry.base64 ?? null;
  }

  set(emojiId: string, filePath: string) {
    let base64: string | undefined;
    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "image/webp";
      base64 = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      /* ignore */
    }

    this.entries[emojiId] = { path: filePath, timestamp: Date.now(), base64 };
    this.save();
  }

  remove(emojiId: string) {
    const entry = this.entries[emojiId];
    if (entry) {
      try {
        fs.unlinkSync(entry.path);
      } catch {
        /* ignore */
      }
      delete this.entries[emojiId];
      this.save();
    }
  }

  clear() {
    for (const entry of Object.values(this.entries)) {
      try {
        fs.unlinkSync(entry.path);
      } catch {
        /* ignore */
      }
    }
    this.entries = {};
    this.save();
  }
}
