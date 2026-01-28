import * as vscode from "vscode";

export interface EmojiMatch {
  emojiId: string;
  fallbackEmoji: string | null;
  fullRange: vscode.Range;
  attrRange: vscode.Range;
  attrWithSpaceRange: vscode.Range; // includes trailing space before >
  fallbackRange: vscode.Range | null;
  line: number;
}

const TAG_PATTERN =
  /<tg-emoji\s+(emoji[-_]id=["']\d+["'])\s*>([^<]*)<\/tg-emoji>/gi;
const SELF_CLOSING_PATTERN = /<tg-emoji\s+(emoji[-_]id=["']\d+["'])\s*\/>/gi;

export function detectEmojis(document: vscode.TextDocument): EmojiMatch[] {
  const text = document.getText();
  const matches: EmojiMatch[] = [];
  const seen = new Set<string>();

  TAG_PATTERN.lastIndex = 0;
  let m;
  while ((m = TAG_PATTERN.exec(text))) {
    const emojiIdMatch = m[1].match(/["'](\d+)["']/);
    if (!emojiIdMatch) continue;

    const key = `${emojiIdMatch[1]}-${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fullStart = m.index;
    const fullEnd = fullStart + m[0].length;
    const fallback = m[2]?.trim() || null;

    // Find attr start (emoji-id=...)
    const attrStartOffset = m[0].indexOf(m[1]);
    const attrStart = fullStart + attrStartOffset;
    const attrEnd = attrStart + m[1].length;

    // Find where > is to include space before it
    const closeTagOffset = m[0].indexOf(">");
    const attrWithSpaceEnd = fullStart + closeTagOffset;

    const startPos = document.positionAt(fullStart);

    // Find fallback position
    let fallbackRange: vscode.Range | null = null;
    if (fallback) {
      const openTagEnd = closeTagOffset + 1;
      const fallbackStart = fullStart + openTagEnd;
      const fallbackEnd = fallbackStart + m[2].length;
      fallbackRange = new vscode.Range(
        document.positionAt(fallbackStart),
        document.positionAt(fallbackEnd),
      );
    }

    matches.push({
      emojiId: emojiIdMatch[1],
      fallbackEmoji: fallback,
      fullRange: new vscode.Range(startPos, document.positionAt(fullEnd)),
      attrRange: new vscode.Range(
        document.positionAt(attrStart),
        document.positionAt(attrEnd),
      ),
      attrWithSpaceRange: new vscode.Range(
        document.positionAt(fullStart + 9),
        document.positionAt(attrWithSpaceEnd),
      ),
      fallbackRange,
      line: startPos.line,
    });
  }

  SELF_CLOSING_PATTERN.lastIndex = 0;
  while ((m = SELF_CLOSING_PATTERN.exec(text))) {
    const emojiIdMatch = m[1].match(/["'](\d+)["']/);
    if (!emojiIdMatch) continue;

    const key = `${emojiIdMatch[1]}-${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fullStart = m.index;
    const attrStartOffset = m[0].indexOf(m[1]);
    const attrStart = fullStart + attrStartOffset;
    const attrEnd = attrStart + m[1].length;

    // Find /> position
    const closeTagOffset = m[0].indexOf("/>");
    const attrWithSpaceEnd = fullStart + closeTagOffset;

    const startPos = document.positionAt(m.index);

    matches.push({
      emojiId: emojiIdMatch[1],
      fallbackEmoji: null,
      fullRange: new vscode.Range(
        startPos,
        document.positionAt(m.index + m[0].length),
      ),
      attrRange: new vscode.Range(
        document.positionAt(attrStart),
        document.positionAt(attrEnd),
      ),
      attrWithSpaceRange: new vscode.Range(
        document.positionAt(fullStart + 9),
        document.positionAt(attrWithSpaceEnd),
      ),
      fallbackRange: null,
      line: startPos.line,
    });
  }

  return matches;
}
