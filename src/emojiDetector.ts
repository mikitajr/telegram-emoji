import * as vscode from 'vscode';

export interface EmojiMatch {
  emojiId: string;
  fallbackEmoji: string;
  range: vscode.Range;
  fullMatch: string;
}

// Regex patterns for detecting Telegram emoji tags
const EMOJI_PATTERNS = [
  // <tg-emoji emoji_id="123456">👍</tg-emoji>
  /<tg-emoji\s+emoji_id=["'](\d+)["'][^>]*>([^<]*)<\/tg-emoji>/g,
  // <tg-emoji emoji_id="123456"/>
  /<tg-emoji\s+emoji_id=["'](\d+)["'][^>]*\/>/g,
  // customEmoji:123456 or custom_emoji_id:123456 (common in configs)
  /(?:custom_?emoji(?:_id)?)\s*[:=]\s*["']?(\d{10,})["']?/gi,
];

export function detectEmojis(document: vscode.TextDocument): EmojiMatch[] {
  const text = document.getText();
  const matches: EmojiMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of EMOJI_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const emojiId = match[1];
      const fullMatch = match[0];
      const startOffset = match.index;
      const endOffset = startOffset + fullMatch.length;

      // Create unique key to avoid duplicates
      const key = `${emojiId}-${startOffset}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);

      // Extract fallback emoji if present (second capture group)
      const fallbackEmoji = match[2] || '😀';

      matches.push({
        emojiId,
        fallbackEmoji: fallbackEmoji.trim() || '😀',
        range: new vscode.Range(startPos, endPos),
        fullMatch,
      });
    }
  }

  return matches;
}

export function isValidEmojiId(id: string): boolean {
  // Telegram emoji IDs are large numbers (typically 19-20 digits)
  return /^\d{10,}$/.test(id);
}
