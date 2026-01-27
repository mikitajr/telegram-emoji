import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface Sticker {
  file_id: string;
  file_unique_id: string;
  type: string;
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
  thumbnail?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
  };
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramApi {
  private botToken: string;
  private baseUrl: string;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/${method}`);

      const postData = params ? JSON.stringify(params) : '';

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const response: ApiResponse<T> = JSON.parse(data);
            if (response.ok && response.result !== undefined) {
              resolve(response.result);
            } else {
              reject(new Error(response.description || 'Unknown API error'));
            }
          } catch {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async getCustomEmojiStickers(emojiIds: string[]): Promise<Sticker[]> {
    return this.request<Sticker[]>('getCustomEmojiStickers', {
      custom_emoji_ids: emojiIds,
    });
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    return this.request<TelegramFile>('getFile', { file_id: fileId });
  }

  async downloadFile(filePath: string, destPath: string): Promise<void> {
    const url = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;

    return new Promise((resolve, reject) => {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const file = fs.createWriteStream(destPath);

      https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, (redirectResponse) => {
              redirectResponse.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            }).on('error', reject);
            return;
          }
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  async getEmojiImagePath(emojiId: string, cacheDir: string): Promise<string | null> {
    try {
      const stickers = await this.getCustomEmojiStickers([emojiId]);
      if (!stickers || stickers.length === 0) {
        return null;
      }

      const sticker = stickers[0];

      // Prefer thumbnail for static preview, it's smaller and faster
      const fileId = sticker.thumbnail?.file_id || sticker.file_id;
      const fileInfo = await this.getFile(fileId);

      if (!fileInfo.file_path) {
        return null;
      }

      const ext = path.extname(fileInfo.file_path) || '.webp';
      const localPath = path.join(cacheDir, `${emojiId}${ext}`);

      // Check if already cached
      if (fs.existsSync(localPath)) {
        return localPath;
      }

      await this.downloadFile(fileInfo.file_path, localPath);
      return localPath;
    } catch (error) {
      console.error(`Failed to get emoji ${emojiId}:`, error);
      return null;
    }
  }
}
