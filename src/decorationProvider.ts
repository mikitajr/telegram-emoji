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

  private getLineHeight(): number {
    const cfg = vscode.workspace.getConfiguration("editor");
    const fontSize = cfg.get<number>("fontSize", 14);
    const lineHeight = cfg.get<number>("lineHeight", 0);
    return lineHeight || Math.round(fontSize * 1.5);
  }

  private createDecorationType() {
    const size = this.getLineHeight();
    return vscode.window.createTextEditorDecorationType({
      after: { margin: "0 0 0 6px", width: `${size}px`, height: `${size}px` },
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
    const size = this.getLineHeight();

    const hover = new vscode.MarkdownString();
    hover.isTrusted = true;
    hover.supportHtml = true;

    if (base64) {
      hover.appendMarkdown(
        `<div style="text-align:center;padding:8px;"><img src="${base64}" width="${this.hoverSize}" height="${this.hoverSize}" style="border-radius:8px;"/></div>\n\n` +
          `| | |\n|---|---|\n| **ID** | \`${match.emojiId}\` |\n` +
          (match.fallbackEmoji !== "😀"
            ? `| **Fallback** | ${match.fallbackEmoji} |\n`
            : ""),
      );
    } else {
      hover.appendMarkdown(
        `#### Could not load emoji\n\n**ID:** \`${match.emojiId}\`\n\n`,
      );
      if (!this.api)
        hover.appendMarkdown(
          `*Set \`telegramEmojiPreview.botToken\` in settings*`,
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
