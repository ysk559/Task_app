import { Request, Response, NextFunction } from 'express';
import { pool, seedDefaultCategories } from './db';

/**
 * ログインの代わりに、ブラウザが localStorage に保持する匿名 ID で利用者を区別する。
 * すべての API リクエストは HTTP ヘッダ `X-Client-Id` にこの ID を付けてくる想定。
 *
 * - ID が無ければ 400 で弾く。
 * - 初めて見る ID なら clients に登録し、デフォルトカテゴリを用意する。
 * - 検証済みの ID を res.locals.clientId に載せて後続ハンドラへ渡す。
 */
export async function requireClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clientId = String(req.header('X-Client-Id') ?? '').trim();

  // 想定される UUID 等の範囲だけ許可（極端に長い値や空を拒否）
  if (!clientId || clientId.length > 100) {
    res.status(400).json({ error: 'クライアントIDが必要です' });
    return;
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO clients (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
      [clientId]
    );
    if (rows.length > 0) {
      // このブラウザを初めて見たので、標準カテゴリを用意する
      await seedDefaultCategories(clientId);
    }
    res.locals.clientId = clientId;
    next();
  } catch (err) {
    next(err);
  }
}
