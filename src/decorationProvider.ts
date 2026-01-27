import * as vscode from "vscode";
import { EmojiMatch } from "./emojiDetector";
import { EmojiCache } from "./emojiCache";
import { TelegramApi } from "./telegramApi";

export class DecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private api: TelegramApi | null = null;
  private pending = new Map<string, Promise<string | null>>();
  private hoverSize = 128;
  private enabled = true;

  constructor(private readonly cache: EmojiCache) {
    this.decorationType = this.createDecorationType();
  }

  private getFontSize(): number {
    return vscode.workspace
      .getConfiguration("editor")
      .get<number>("fontSize", 14);
  }

  private createDecorationType() {
    const size = this.getFontSize();
    return vscode.window.createTextEditorDecorationType({
      after: { margin: "0 0 0 4px", width: `${size}px`, height: `${size}px` },
    });
  }

  updateSettings(config: vscode.WorkspaceConfiguration) {
    const botToken = config.get<string>("botToken", "");
    this.hoverSize = config.get<number>("hoverPreviewSize", 128);
    this.enabled = config.get<boolean>("enableInlinePreview", true);
    this.cache.setExpiration(config.get<number>("cacheExpiration", 86400));
    this.api = botToken ? new TelegramApi(botToken) : null;
    this.decorationType.dispose();
    this.decorationType = this.createDecorationType();
  }

  async updateDecorations(editor: vscode.TextEditor, matches: EmojiMatch[]) {
    if (!this.enabled || !this.api) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const decorations = await Promise.all(
      matches.map((m) => this.createDecoration(m)),
    );
    editor.setDecorations(
      this.decorationType,
      decorations.filter(Boolean) as vscode.DecorationOptions[],
    );
  }

  private async createDecoration(
    match: EmojiMatch,
  ): Promise<vscode.DecorationOptions | null> {
    const base64 = await this.getEmojiBase64(match.emojiId);
    const size = this.getFontSize();

    const hover = new vscode.MarkdownString();
    hover.isTrusted = true;
    hover.supportHtml = true;

    if (base64) {
      hover.appendMarkdown(
        `<div style="text-align:center;padding:12px 16px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:12px;">` +
          `<img src="${base64}" width="${this.hoverSize}" height="${this.hoverSize}" style="border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);"/>` +
          `</div>\n\n` +
          `**Telegram Custom Emoji**\n\n` +
          `| Property | Value |\n|:--|:--|\n` +
          `| ID | \`${match.emojiId}\` |\n` +
          `| Fallback | ${match.fallbackEmoji} |\n` +
          `| Type | Premium Emoji |`,
      );
    } else {
      hover.appendMarkdown(
        `**Telegram Custom Emoji**\n\n` +
          `⚠️ Could not load preview\n\n` +
          `| Property | Value |\n|:--|:--|\n` +
          `| ID | \`${match.emojiId}\` |\n` +
          `| Fallback | ${match.fallbackEmoji} |\n\n` +
          (this.api
            ? "*Failed to fetch from Telegram API*"
            : "*Configure `telegramEmojiPreview.botToken` to enable previews*"),
      );
    }

    return {
      range: match.range,
      hoverMessage: hover,
      ...(base64 && {
        renderOptions: {
          after: {
            contentIconPath: vscode.Uri.parse(base64),
            width: `${size}px`,
            height: `${size}px`,
          },
        },
      }),
    };
  }

  private async getEmojiBase64(emojiId: string): Promise<string | null> {
    const cached = this.cache.getBase64(emojiId);
    if (cached) return cached;
    if (!this.api) return null;

    if (!this.pending.has(emojiId)) {
      this.pending.set(
        emojiId,
        (async () => {
          try {
            const filePath = await this.api!.getEmojiImagePath(
              emojiId,
              this.cache.getCacheDir(),
            );
            if (filePath) {
              this.cache.set(emojiId, filePath);
              return this.cache.getBase64(emojiId);
            }
          } catch {
            /* ignore */
          }
          return null;
        })().finally(() => this.pending.delete(emojiId)),
      );
    }
    return this.pending.get(emojiId)!;
  }

  dispose() {
    this.decorationType.dispose();
  }
}
