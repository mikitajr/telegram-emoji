import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

interface CacheEntry {
  timestamp: number;
  base64: string;
}

export class EmojiCache {
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private entries: Record<string, CacheEntry> = {};
  private static readonly EXPIRATION_MS = 86400_000; // 24h

  constructor(context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, "emoji-cache");
    this.cacheFile = path.join(this.cacheDir, "cache.json");
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        this.entries =
          JSON.parse(fs.readFileSync(this.cacheFile, "utf-8")).entries ?? {};
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

  getCacheDir() {
    return this.cacheDir;
  }

  get(emojiId: string): string | null {
    const entry = this.entries[emojiId];
    if (!entry || Date.now() - entry.timestamp > EmojiCache.EXPIRATION_MS) {
      if (entry) this.remove(emojiId);
      return null;
    }
    return entry.base64;
  }

  set(emojiId: string, filePath: string) {
    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "image/webp";
      this.entries[emojiId] = {
        timestamp: Date.now(),
        base64: `data:${mime};base64,${buffer.toString("base64")}`,
      };
      this.save();
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }

  remove(emojiId: string) {
    delete this.entries[emojiId];
    this.save();
  }

  clear() {
    this.entries = {};
    this.save();
  }
}
