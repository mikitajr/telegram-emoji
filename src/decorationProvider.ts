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

  private createEmojiDecorationType(_size: number) {
    return vscode.window.createTextEditorDecorationType({});
  }

  private createHideDecorationType() {
    return vscode.window.createTextEditorDecorationType({
      textDecoration:
        "none; font-size: 0; letter-spacing: -9999px; visibility: hidden;",
    });
  }

  private createEmojiGlowType() {
    return vscode.window.createTextEditorDecorationType({});
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

  private wrapInExpandedSvg(base64: string, size: number): string {
    const pad = Math.round(size * 0.5);
    const barX = pad;
    const barWidth = 2;
    const imgX = barX + barWidth + pad;
    const totalWidth = imgX + size;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${size}">` +
      `<rect x="${barX}" y="1" width="${barWidth}" height="${size - 2}" rx="1" fill="rgba(150,150,150,0.5)"/>` +
      `<image href="${base64}" x="${imgX}" y="0" width="${size}" height="${size}"/>` +
      `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  private createExpandedSkeletonSvg(size: number): string {
    const pad = Math.round(size * 0.5);
    const barX = pad;
    const barWidth = 2;
    const imgX = barX + barWidth + pad;
    const totalWidth = imgX + size;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${size}">` +
      `<rect x="${barX}" y="1" width="${barWidth}" height="${size - 2}" rx="1" fill="rgba(150,150,150,0.5)"/>` +
      `<rect x="${imgX}" y="0" width="${size}" height="${size}" rx="3" fill="rgba(150,150,150,0.2)"/>` +
      `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  setCursorLine(line: number) {
    this.cursorLine = line;
  }

  updateSettings(config: vscode.WorkspaceConfiguration) {
    const botToken = config.get<string>("botToken", "");
    this.enabled = config.get<boolean>("enableInline", true);
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

    if (isExpanded) {
      const expandedIconPath = base64
        ? vscode.Uri.parse(this.wrapInExpandedSvg(base64, size))
        : vscode.Uri.parse(this.createExpandedSkeletonSvg(size));
      const pad = Math.round(size * 0.5);
      const totalWidth = pad + 2 + pad + size;

      return {
        emoji: {
          range: new vscode.Range(
              match.fullRange.end.translate(0, 1),
              match.fullRange.end.translate(0, 1),
            ),
          hoverMessage: hover,
          renderOptions: {
            after: {
              contentIconPath: expandedIconPath,
              width: `${totalWidth}px`,
              height: `${size}px`,
            },
          },
        },
        hide: [],
      };
    }

    const iconPath = base64
      ? vscode.Uri.parse(this.wrapInSvg(base64, size))
      : vscode.Uri.parse(this.createSkeletonSvg(size));

    const hideRanges: vscode.DecorationOptions[] = [
      { range: match.attrWithSpaceRange },
    ];

    if (match.fallbackRange) {
      hideRanges.push({ range: match.fallbackRange });
    }

    const emojiPosition = match.fallbackRange?.start ?? match.attrRange.start;

    return {
      emoji: {
        range: new vscode.Range(emojiPosition, emojiPosition),
        hoverMessage: hover,
        renderOptions: {
          before: {
            contentIconPath: iconPath,
            width: `${size}px`,
            height: `${size}px`,
            textDecoration: `none; vertical-align: -${Math.round(size * 0.15)}px;`,
          },
        },
      },
      hide: hideRanges,
      glow: {
        range: match.fullRange,
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
        `<img src="${base64}" width="128" height="128" style="border-radius:8px;display:block;"/>\n\n`,
      );
    }

    hover.appendMarkdown(`**ID:** \`${match.emojiId}\``);
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
          } catch {}
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
