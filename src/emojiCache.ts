import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface CacheEntry {
  path: string;
  timestamp: number;
  base64?: string;
}

interface CacheData {
  entries: Record<string, CacheEntry>;
}

export class EmojiCache {
  private cacheDir: string;
  private cacheFile: string;
  private data: CacheData;
  private expirationMs: number;

  constructor(context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, 'emoji-cache');
    this.cacheFile = path.join(this.cacheDir, 'cache.json');
    this.data = { entries: {} };
    this.expirationMs = 24 * 60 * 60 * 1000; // 24 hours default

    this.ensureCacheDir();
    this.loadCache();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const content = fs.readFileSync(this.cacheFile, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch {
      this.data = { entries: {} };
    }
  }

  private saveCache(): void {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  setExpiration(seconds: number): void {
    this.expirationMs = seconds * 1000;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  get(emojiId: string): CacheEntry | null {
    const entry = this.data.entries[emojiId];
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.expirationMs) {
      this.remove(emojiId);
      return null;
    }

    // Check if file still exists
    if (!fs.existsSync(entry.path)) {
      this.remove(emojiId);
      return null;
    }

    return entry;
  }

  set(emojiId: string, filePath: string): void {
    // Read file and convert to base64 for inline display
    let base64: string | undefined;
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.webp' ? 'image/webp' :
                       ext === '.png' ? 'image/png' :
                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';
      base64 = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    } catch {
      // Ignore base64 conversion errors
    }

    this.data.entries[emojiId] = {
      path: filePath,
      timestamp: Date.now(),
      base64,
    };
    this.saveCache();
  }

  remove(emojiId: string): void {
    const entry = this.data.entries[emojiId];
    if (entry) {
      try {
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
      } catch {
        // Ignore deletion errors
      }
      delete this.data.entries[emojiId];
      this.saveCache();
    }
  }

  clear(): void {
    // Delete all cached files
    for (const emojiId of Object.keys(this.data.entries)) {
      const entry = this.data.entries[emojiId];
      try {
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
      } catch {
        // Ignore deletion errors
      }
    }
    this.data = { entries: {} };
    this.saveCache();
  }

  getBase64(emojiId: string): string | null {
    const entry = this.get(emojiId);
    return entry?.base64 || null;
  }

  getFilePath(emojiId: string): string | null {
    const entry = this.get(emojiId);
    return entry?.path || null;
  }
}
