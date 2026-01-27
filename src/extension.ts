import * as vscode from "vscode";
import { EmojiCache } from "./emojiCache";
import { DecorationProvider } from "./decorationProvider";
import { detectEmojis } from "./emojiDetector";

let cache: EmojiCache;
let decorationProvider: DecorationProvider;
let updateTimeout: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  cache = new EmojiCache(context);
  decorationProvider = new DecorationProvider(cache);

  const config = vscode.workspace.getConfiguration("telegramEmojiPreview");
  decorationProvider.updateSettings(config);

  const triggerUpdate = (editor?: vscode.TextEditor) => {
    const target = editor ?? vscode.window.activeTextEditor;
    if (!target) return;

    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(async () => {
      const matches = detectEmojis(target.document);
      await decorationProvider.updateDecorations(target, matches);
    }, 150);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("telegramEmojiPreview.clearCache", () => {
      cache.clear();
      vscode.window.showInformationMessage("Telegram Emoji cache cleared");
      triggerUpdate();
    }),
    vscode.commands.registerCommand(
      "telegramEmojiPreview.refresh",
      triggerUpdate,
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("telegramEmojiPreview")) {
        decorationProvider.updateSettings(
          vscode.workspace.getConfiguration("telegramEmojiPreview"),
        );
        triggerUpdate();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(triggerUpdate),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        triggerUpdate();
      }
    }),
    {
      dispose: () => {
        decorationProvider.dispose();
        clearTimeout(updateTimeout);
      },
    },
  );

  if (vscode.window.activeTextEditor) triggerUpdate();
}

export function deactivate() {
  clearTimeout(updateTimeout);
}
