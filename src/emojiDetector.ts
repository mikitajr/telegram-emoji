import * as vscode from "vscode";

export interface EmojiMatch {
  emojiId: string;
  fallbackEmoji: string;
  range: vscode.Range;
}

const PATTERNS = [
  /<tg-emoji\s+emoji[-_]id=["'](\d+)["'][^>]*>([^<]*)<\/tg-emoji>/gi,
  /<tg-emoji\s+emoji[-_]id=["'](\d+)["'][^>]*\/>/gi,
  /(?:custom[-_]?emoji(?:[-_]id)?)\s*[:=]\s*["']?(\d{10,})["']?/gi,
];

export function detectEmojis(document: vscode.TextDocument): EmojiMatch[] {
  const text = document.getText();
  const matches: EmojiMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text))) {
      const key = `${m[1]}-${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      matches.push({
        emojiId: m[1],
        fallbackEmoji: m[2]?.trim() || "😀",
        range: new vscode.Range(
          document.positionAt(m.index),
          document.positionAt(m.index + m[0].length),
        ),
      });
    }
  }
  return matches;
}
