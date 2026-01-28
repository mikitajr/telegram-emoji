# Telegram Emoji Preview

VS Code extension that renders Telegram premium custom emojis inline, right in your editor.

Detects `<tg-emoji emoji-id='...'>` tags and displays the actual custom emoji image fetched from the Telegram Bot API.

## Features

- Inline emoji preview next to `<tg-emoji>` tags
- Collapsed mode (cursor away): tag shrinks, emoji replaces content
- Expanded mode (cursor on line): full tag visible, emoji shown after the closing quote
- Hover with emoji ID and copy button
- Skeleton placeholder while loading / for invalid IDs
- Local file cache (24h expiration)

### Collapsed

<!-- TODO: screenshot collapsed -->

### Expanded

<!-- TODO: screenshot expanded -->

### Hover preview

<!-- TODO: screenshot hover -->

## Requirements

This extension requires a **Telegram Bot API token** to fetch custom emoji images.

### How to get a Bot Token

1. Open Telegram and find [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts (choose a name and username)
3. BotFather will reply with a token like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
4. Copy the token

### Configure the extension

Open VS Code settings (`Ctrl+,`) and search for `Telegram Emoji Preview`, then paste the token into **Bot Token** field.

Or add to `settings.json`:

```json
{
  "telegramEmojiPreview.botToken": "YOUR_BOT_TOKEN_HERE"
}
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `telegramEmojiPreview.botToken` | None | Telegram Bot API token |
| `telegramEmojiPreview.enableInlinePreview` | `true` | Show inline emoji preview |

## License

MIT
