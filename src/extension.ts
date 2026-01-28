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
      decorationProvider.setCursorLine(target.selection.active.line);
      const matches = detectEmojis(target.document);
      await decorationProvider.updateDecorations(target, matches);
    }, 50);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("telegramEmojiPreview")) {
        decorationProvider.updateSettings(
          vscode.workspace.getConfiguration("telegramEmojiPreview"),
        );
        triggerUpdate();
      }
    }),

    vscode.window.onDidChangeActiveTextEditor(triggerUpdate),

    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        triggerUpdate(e.textEditor);
      }
    }),

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
