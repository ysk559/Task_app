import path from 'path';
import express from 'express';
import { initSchema } from './db';
import { requireClient } from './clientId';
import { tasksRouter } from './routes/tasks';
import { categoriesRouter } from './routes/categories';

/**
 * アプリケーション層（バックエンド）のエントリポイント。
 *  - 静的ファイル（フロントエンド）の配信
 *  - REST API の提供
 *  - 起動時に DB スキーマを初期化
 */

const app = express();
app.use(express.json());

// API ルーティング（クライアント識別ミドルウェアを通す）
app.use('/api/tasks', requireClient, tasksRouter);
app.use('/api/categories', requireClient, categoriesRouter);

// ヘルスチェック（Render の死活監視・動作確認用）
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// フロントエンド（public/）の配信
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// 共通エラーハンドラ
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal server error' });
});

const port = Number(process.env.PORT) || 3000;

initSchema()
  .then(() => {
    app.listen(port, () => console.log(`[server] listening on http://localhost:${port}`));
  })
  .catch((err) => {
    console.error('[server] スキーマ初期化に失敗しました:', err);
    process.exit(1);
  });
