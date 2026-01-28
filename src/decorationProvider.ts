import * as vscode from "vscode";
import { EmojiMatch } from "./emojiDetector";
import { EmojiCache } from "./emojiCache";
import { TelegramApi } from "./telegramApi";

export class DecorationProvider {
  private emojiDecorationType: vscode.TextEditorDecorationType;
  private hideDecorationType: vscode.TextEditorDecorationType;
  private emojiGlowType: vscode.TextEditorDecorationType;
  private api: TelegramApi | null = null;
  private pending = new Map<string, Promise<string | null>>();
  private hoverSize = 128;
  private enabled = true;
  private cursorLine = -1;

  constructor(private readonly cache: EmojiCache) {
    const size = this.getInlineSize();
    this.emojiDecorationType = this.createEmojiDecorationType(size);
    this.hideDecorationType = this.createHideDecorationType();
    this.emojiGlowType = this.createEmojiGlowType();
  }

  private getInlineSize(): number {
    return vscode.workspace
      .getConfiguration("editor")
      .get<number>("fontSize", 14);
  }

  private createEmojiDecorationType(size: number) {
    return vscode.window.createTextEditorDecorationType({
      before: { width: `${size}px`, height: `${size}px` },
    });
  }

  private createHideDecorationType() {
    return vscode.window.createTextEditorDecorationType({
      textDecoration:
        "none; font-size: 0; letter-spacing: -9999px; visibility: hidden;",
    });
  }

  private createEmojiGlowType() {
    return vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(88, 166, 255, 0.12)",
      borderRadius: "4px",
    });
  }

  private wrapInSvg(base64: string, size: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="${base64}" width="${size}" height="${size}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  private createSkeletonSvg(size: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgba(120,120,120,0.3)">
            <animate attributeName="offset" values="-1;2" dur="1.5s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" style="stop-color:rgba(180,180,180,0.5)">
            <animate attributeName="offset" values="-0.5;2.5" dur="1.5s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" style="stop-color:rgba(120,120,120,0.3)">
            <animate attributeName="offset" values="0;3" dur="1.5s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="3" fill="url(#g)"/>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  setCursorLine(line: number) {
    this.cursorLine = line;
  }

  updateSettings(config: vscode.WorkspaceConfiguration) {
    const botToken = config.get<string>("botToken", "");
    this.hoverSize = config.get<number>("hoverPreviewSize", 128);
    this.enabled = config.get<boolean>("enableInlinePreview", true);
    this.cache.setExpiration(config.get<number>("cacheExpiration", 86400));
    this.api = botToken ? new TelegramApi(botToken) : null;
    this.disposeDecorationTypes();
    const size = this.getInlineSize();
    this.emojiDecorationType = this.createEmojiDecorationType(size);
    this.hideDecorationType = this.createHideDecorationType();
    this.emojiGlowType = this.createEmojiGlowType();
  }

  private disposeDecorationTypes() {
    this.emojiDecorationType.dispose();
    this.hideDecorationType.dispose();
    this.emojiGlowType.dispose();
  }

  async updateDecorations(editor: vscode.TextEditor, matches: EmojiMatch[]) {
    if (!this.enabled || !this.api) {
      editor.setDecorations(this.emojiDecorationType, []);
      editor.setDecorations(this.hideDecorationType, []);
      editor.setDecorations(this.emojiGlowType, []);
      return;
    }

    const results = await Promise.all(
      matches.map((m) => this.createDecoration(m)),
    );
    const emojiDecorations: vscode.DecorationOptions[] = [];
    const hideDecorations: vscode.DecorationOptions[] = [];
    const glowDecorations: vscode.DecorationOptions[] = [];

    for (const result of results) {
      if (!result) continue;
      if (result.emoji) emojiDecorations.push(result.emoji);
      for (const hide of result.hide) hideDecorations.push(hide);
      if (result.glow) glowDecorations.push(result.glow);
    }

    editor.setDecorations(this.emojiDecorationType, emojiDecorations);
    editor.setDecorations(this.hideDecorationType, hideDecorations);
    editor.setDecorations(this.emojiGlowType, glowDecorations);
  }

  private async createDecoration(
    match: EmojiMatch,
  ): Promise<{
    emoji?: vscode.DecorationOptions;
    hide: vscode.DecorationOptions[];
    glow?: vscode.DecorationOptions;
  } | null> {
    const base64 = await this.getEmoji(match.emojiId);
    const size = this.getInlineSize();
    const hover = this.createHover(match, base64);
    const isExpanded = match.line === this.cursorLine;

    const iconPath = base64
      ? vscode.Uri.parse(this.wrapInSvg(base64, size))
      : vscode.Uri.parse(this.createSkeletonSvg(size));

    // Expanded (cursor on this line) - show everything, emoji before tag
    if (isExpanded) {
      return {
        emoji: {
          range: new vscode.Range(match.fullRange.start, match.fullRange.start),
          hoverMessage: hover,
          renderOptions: { before: { contentIconPath: iconPath } },
        },
        hide: [],
      };
    }

    // Collapsed - hide attr and fallback (if emoji loaded), show only custom emoji
    const hideRanges: vscode.DecorationOptions[] = [
      { range: match.attrWithSpaceRange },
    ];

    // Hide fallback only if we have the custom emoji loaded
    if (base64 && match.fallbackRange) {
      hideRanges.push({ range: match.fallbackRange });
    }

    // Position for emoji icon - before fallback or before attr
    const emojiPosition = match.fallbackRange?.start ?? match.attrRange.start;

    return {
      emoji: {
        range: new vscode.Range(emojiPosition, emojiPosition),
        hoverMessage: hover,
        renderOptions: { before: { contentIconPath: iconPath } },
      },
      hide: hideRanges,
      glow: {
        range: new vscode.Range(emojiPosition, emojiPosition),
        hoverMessage: hover,
      },
    };
  }

  private createHover(
    match: EmojiMatch,
    base64: string | null,
  ): vscode.MarkdownString {
    const hover = new vscode.MarkdownString();
    hover.isTrusted = true;
    hover.supportHtml = true;

    if (base64) {
      hover.appendMarkdown(
        `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:200px;">` +
          `<div style="padding:16px 24px;background:linear-gradient(145deg,#0f0f1a 0%,#1a1a2e 50%,#16213e 100%);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.1);">` +
          `<img src="${base64}" width="${this.hoverSize}" height="${this.hoverSize}" style="border-radius:12px;display:block;"/>` +
          `</div>` +
          `<div style="margin-top:12px;padding:8px 16px;background:rgba(88,166,255,0.15);border-radius:20px;border:1px solid rgba(88,166,255,0.3);">` +
          `<span style="color:#58a6ff;font-weight:600;">✨ Premium Emoji</span>` +
          `</div>` +
          `</div>\n\n` +
          `---\n\n` +
          `| | |\n|:--|:--|\n` +
          `| 🆔 **ID** | \`${match.emojiId}\` |\n` +
          (match.fallbackEmoji
            ? `| 🔄 **Fallback** | ${match.fallbackEmoji} |\n`
            : "") +
          `| 📦 **Cached** | ✅ Yes |`,
      );
    } else {
      hover.appendMarkdown(
        `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:200px;">` +
          `<div style="padding:24px;background:linear-gradient(145deg,#1a1a1a 0%,#2d2d2d 100%);border-radius:16px;border:2px dashed rgba(255,255,255,0.2);">` +
          `<span style="font-size:48px;opacity:0.5;">⏳</span>` +
          `</div>` +
          `<div style="margin-top:12px;padding:8px 16px;background:rgba(255,180,50,0.15);border-radius:20px;border:1px solid rgba(255,180,50,0.3);">` +
          `<span style="color:#ffb432;font-weight:600;">⏳ Loading...</span>` +
          `</div>` +
          `</div>\n\n` +
          `---\n\n` +
          `| | |\n|:--|:--|\n` +
          `| 🆔 **ID** | \`${match.emojiId}\` |\n` +
          (match.fallbackEmoji
            ? `| 🔄 **Fallback** | ${match.fallbackEmoji} |\n`
            : "") +
          `| 📦 **Cached** | ⏳ Loading |\n\n` +
          (this.api
            ? "*Fetching from Telegram API...*"
            : "*Configure `telegramEmojiPreview.botToken`*"),
      );
    }

    return hover;
  }

  private async getEmoji(emojiId: string): Promise<string | null> {
    const cached = this.cache.get(emojiId);
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
              return this.cache.get(emojiId);
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
    this.disposeDecorationTypes();
  }
}
