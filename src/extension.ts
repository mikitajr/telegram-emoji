import * as vscode from 'vscode';
import { EmojiCache } from './emojiCache';
import { DecorationProvider } from './decorationProvider';
import { detectEmojis } from './emojiDetector';

let cache: EmojiCache;
let decorationProvider: DecorationProvider;
let updateTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Telegram Emoji Preview is now active');

  // Initialize cache and decoration provider
  cache = new EmojiCache(context);
  decorationProvider = new DecorationProvider(cache);

  // Load initial settings
  updateSettings();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('telegramEmojiPreview.clearCache', () => {
      cache.clear();
      vscode.window.showInformationMessage('Telegram Emoji cache cleared');
      triggerUpdateDecorations();
    }),

    vscode.commands.registerCommand('telegramEmojiPreview.refresh', () => {
      triggerUpdateDecorations();
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('telegramEmojiPreview')) {
        updateSettings();
        triggerUpdateDecorations();
      }
    })
  );

  // Watch for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        triggerUpdateDecorations(editor);
      }
    })
  );

  // Watch for document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        triggerUpdateDecorations(editor);
      }
    })
  );

  // Initial decoration update
  if (vscode.window.activeTextEditor) {
    triggerUpdateDecorations(vscode.window.activeTextEditor);
  }

  // Register hover provider for additional info
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('*', {
      provideHover(document, position) {
        const matches = detectEmojis(document);
        for (const match of matches) {
          if (match.range.contains(position)) {
            // Hover is handled by decorations, but we can add extra info here if needed
            return null;
          }
        }
        return null;
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      decorationProvider.dispose();
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
    }
  });
}

function updateSettings(): void {
  const config = vscode.workspace.getConfiguration('telegramEmojiPreview');
  decorationProvider.updateSettings(config);

  const botToken = config.get<string>('botToken', '');
  if (!botToken) {
    // Show one-time notification about configuration
    const key = 'telegramEmojiPreview.shownConfigNotice';
    const globalState = cache as unknown as { context?: vscode.ExtensionContext };
    // We'll skip this for now to avoid complexity
  }
}

function triggerUpdateDecorations(editor?: vscode.TextEditor): void {
  const activeEditor = editor || vscode.window.activeTextEditor;
  if (!activeEditor) {
    return;
  }

  // Debounce updates
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  updateTimeout = setTimeout(() => {
    updateDecorations(activeEditor);
  }, 150);
}

async function updateDecorations(editor: vscode.TextEditor): Promise<void> {
  const matches = detectEmojis(editor.document);
  await decorationProvider.updateDecorations(editor, matches);
}

export function deactivate() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
}
