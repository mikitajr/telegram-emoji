import * as https from "https";
import * as fs from "fs";
import * as path from "path";

interface Sticker {
  file_id: string;
  thumbnail?: { file_id: string };
}

interface TelegramFile {
  file_path?: string;
}

export class TelegramApi {
  constructor(private readonly botToken: string) {}

  private request<T>(method: string, params?: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const body = params ? JSON.stringify(params) : "";
      const req = https.request(
        `https://api.telegram.org/bot${this.botToken}/${method}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              json.ok
                ? resolve(json.result)
                : reject(new Error(json.description));
            } catch {
              reject(new Error("Parse error"));
            }
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }

  private download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      const fetch = (u: string) =>
        https
          .get(u, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              res.headers.location
                ? fetch(res.headers.location)
                : reject(new Error("Redirect without location"));
              return;
            }
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
          })
          .on("error", (e) => {
            fs.unlink(dest, () => {});
            reject(e);
          });
      fetch(url);
    });
  }

  async getEmojiImagePath(
    emojiId: string,
    cacheDir: string,
  ): Promise<string | null> {
    try {
      const [sticker] = await this.request<Sticker[]>(
        "getCustomEmojiStickers",
        { custom_emoji_ids: [emojiId] },
      );
      if (!sticker) return null;

      const fileId = sticker.thumbnail?.file_id ?? sticker.file_id;
      const fileInfo = await this.request<TelegramFile>("getFile", {
        file_id: fileId,
      });
      if (!fileInfo.file_path) return null;

      const ext = path.extname(fileInfo.file_path) || ".webp";
      const localPath = path.join(cacheDir, `${emojiId}${ext}`);

      if (!fs.existsSync(localPath)) {
        await this.download(
          `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`,
          localPath,
        );
      }
      return localPath;
    } catch {
      return null;
    }
  }
}
