import * as vscode from 'vscode';
import * as path from 'path';
import { EmojiMatch } from './emojiDetector';
import { EmojiCache } from './emojiCache';
import { TelegramApi } from './telegramApi';

export class DecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private cache: EmojiCache;
  private api: TelegramApi | null = null;
  private pendingRequests = new Map<string, Promise<string | null>>();
  private previewSize: number = 20;
  private hoverSize: number = 128;
  private enabled: boolean = true;

  constructor(cache: EmojiCache) {
    this.cache = cache;
    this.decorationType = this.createDecorationType();
  }

  private createDecorationType(): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 4px',
        width: `${this.previewSize}px`,
        height: `${this.previewSize}px`,
      },
    });
  }

  updateSettings(config: vscode.WorkspaceConfiguration): void {
    const botToken = config.get<string>('botToken', '');
    this.previewSize = config.get<number>('previewSize', 20);
    this.hoverSize = config.get<number>('hoverPreviewSize', 128);
    this.enabled = config.get<boolean>('enableInlinePreview', true);

    const cacheExpiration = config.get<number>('cacheExpiration', 86400);
    this.cache.setExpiration(cacheExpiration);

    if (botToken) {
      this.api = new TelegramApi(botToken);
    } else {
      this.api = null;
    }

    // Recreate decoration type with new size
    this.decorationType.dispose();
    this.decorationType = this.createDecorationType();
  }

  async updateDecorations(editor: vscode.TextEditor, matches: EmojiMatch[]): Promise<void> {
    if (!this.enabled || !this.api) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    for (const match of matches) {
      const decoration = await this.createDecoration(match);
      if (decoration) {
        decorations.push(decoration);
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  private async createDecoration(match: EmojiMatch): Promise<vscode.DecorationOptions | null> {
    const base64 = await this.getEmojiBase64(match.emojiId);

    if (!base64) {
      // Show fallback with warning
      return {
        range: match.range,
        hoverMessage: this.createHoverMessage(match, null),
      };
    }

    // Create inline preview using contentIconPath
    const decoration: vscode.DecorationOptions = {
      range: match.range,
      hoverMessage: this.createHoverMessage(match, base64),
      renderOptions: {
        after: {
          contentIconPath: vscode.Uri.parse(base64),
          width: `${this.previewSize}px`,
          height: `${this.previewSize}px`,
        },
      },
    };

    return decoration;
  }

  private createHoverMessage(match: EmojiMatch, base64: string | null): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    if (base64) {
      md.appendMarkdown(`<img src="${base64}" width="${this.hoverSize}" height="${this.hoverSize}" />\n\n`);
    } else {
      md.appendMarkdown(`**⚠️ Could not load emoji**\n\n`);
    }

    md.appendMarkdown(`**Telegram Emoji**\n\n`);
    md.appendMarkdown(`- **ID:** \`${match.emojiId}\`\n`);
    md.appendMarkdown(`- **Fallback:** ${match.fallbackEmoji}\n`);

    if (!this.api) {
      md.appendMarkdown(`\n---\n`);
      md.appendMarkdown(`*Configure bot token in settings to see preview*`);
    }

    return md;
  }

  private async getEmojiBase64(emojiId: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.getBase64(emojiId);
    if (cached) {
      return cached;
    }

    if (!this.api) {
      return null;
    }

    // Check if request is already pending
    if (this.pendingRequests.has(emojiId)) {
      return this.pendingRequests.get(emojiId)!;
    }

    // Fetch from API
    const promise = this.fetchEmoji(emojiId);
    this.pendingRequests.set(emojiId, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(emojiId);
    }
  }

  private async fetchEmoji(emojiId: string): Promise<string | null> {
    if (!this.api) {
      return null;
    }

    try {
      const filePath = await this.api.getEmojiImagePath(emojiId, this.cache.getCacheDir());
      if (filePath) {
        this.cache.set(emojiId, filePath);
        return this.cache.getBase64(emojiId);
      }
    } catch (error) {
      console.error(`Failed to fetch emoji ${emojiId}:`, error);
    }

    return null;
  }

  dispose(): void {
    this.decorationType.dispose();
  }
}
