import { Router } from 'express';
import { pool } from '../db';

export const categoriesRouter = Router();

/** カテゴリ一覧 */
categoriesRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, color FROM categories ORDER BY id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** カテゴリ作成 */
categoriesRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const color = String(req.body?.color ?? '#6366f1').trim();
    if (!name) {
      return res.status(400).json({ error: 'name は必須です' });
    }
    const { rows } = await pool.query(
      `INSERT INTO categories (name, color) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color
       RETURNING id, name, color`,
      [name, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
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
