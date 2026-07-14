import { Router } from 'express';
import { pool } from '../db';

export const categoriesRouter = Router();

/** カテゴリ一覧（表示順） */
categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, color FROM categories ORDER BY position, id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** カテゴリ作成（末尾に追加） */
categoriesRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const color = String(req.body?.color ?? '#6366f1').trim();
    if (!name) {
      return res.status(400).json({ error: 'name は必須です' });
    }
    const { rows } = await pool.query(
      `INSERT INTO categories (name, color, position)
       VALUES ($1, $2, COALESCE((SELECT MAX(position) FROM categories), 0) + 1)
       ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color
       RETURNING id, name, color`,
      [name, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** 並び替え。body: { ids: number[] } を新しい表示順として保存する。 */
categoriesRouter.put('/reorder', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids は必須です' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE categories SET position = $1 WHERE id = $2', [i + 1, ids[i]]);
    }
    await client.query('COMMIT');
    const { rows } = await client.query('SELECT id, name, color FROM categories ORDER BY position, id');
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

/** カテゴリ削除（紐づくタスクの category_id は NULL になる） */
categoriesRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
