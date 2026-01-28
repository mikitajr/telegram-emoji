import * as vscode from "vscode";
import { EmojiCache } from "./emojiCache";
import { DecorationProvider } from "./decorationProvider";
import { detectEmojis } from "./emojiDetector";

let testText: string = "<tg-emoji emoji-id='5406764870999774418'>😀</tg-emoji>"


let cache: EmojiCache;
let decorationProvider: DecorationProvider;
let updateTimeout: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  cache = new EmojiCache(context);
  decorationProvider = new DecorationProvider(cache);

  const config = vscode.workspace.getConfiguration("telegramEmoji");
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
    vscode.commands.registerCommand(
      "telegramEmoji.setToken",
      async () => {
        const token = await vscode.window.showInputBox({
          prompt: "Enter your Telegram Bot API token",
          placeHolder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
          password: true,
        });
        if (token !== undefined) {
          await vscode.workspace
            .getConfiguration("telegramEmoji")
            .update("botToken", token, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(
            token ? "Telegram Emoji: Token saved" : "Telegram Emoji: Token cleared",
          );
        }
      },
    ),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("telegramEmoji")) {
        decorationProvider.updateSettings(
          vscode.workspace.getConfiguration("telegramEmoji"),
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
