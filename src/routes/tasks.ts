import { Router } from 'express';
import { pool } from '../db';
import { decorate, urgencyScore, TaskRow, PRIORITY } from '../priority';

export const tasksRouter = Router();

const COLUMNS =
  'id, title, description, category_id, base_priority, due_date, estimated_minutes, completed, completed_at, created_at';

/** リクエストボディから安全にタスクのフィールドを取り出す。 */
function parseTaskInput(body: any) {
  const title = String(body?.title ?? '').trim();

  const basePriorityRaw = Number(body?.basePriority);
  const basePriority =
    Number.isFinite(basePriorityRaw) && basePriorityRaw >= PRIORITY.LOW && basePriorityRaw <= PRIORITY.URGENT
      ? Math.round(basePriorityRaw)
      : PRIORITY.MEDIUM;

  const description = String(body?.description ?? '').trim();

  const categoryId =
    body?.categoryId === null || body?.categoryId === undefined || body?.categoryId === ''
      ? null
      : Number(body.categoryId);

  let dueDate: string | null = null;
  if (body?.dueDate) {
    const d = new Date(body.dueDate);
    if (!isNaN(d.getTime())) dueDate = d.toISOString();
  }

  let estimatedMinutes: number | null = null;
  if (body?.estimatedMinutes !== null && body?.estimatedMinutes !== undefined && body?.estimatedMinutes !== '') {
    const m = Number(body.estimatedMinutes);
    if (Number.isFinite(m) && m >= 0) estimatedMinutes = Math.round(m);
  }

  return { title, description, categoryId, basePriority, dueDate, estimatedMinutes };
}

/**
 * タスク一覧。
 * 実効重要度・緊急度スコアはサーバ側で「今」を基準に動的計算して返す。
 * 未完了タスクは緊急度スコアの高い順（= 次にやるべき順）で並べて返す。
 */
tasksRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks`);
    const now = new Date();

    const active = rows.filter((r) => !r.completed).sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now));
    const done = rows
      .filter((r) => r.completed)
      .sort((a, b) => (b.completed_at?.getTime() ?? 0) - (a.completed_at?.getTime() ?? 0));

    res.json([...active, ...done].map((r) => decorate(r, now)));
  } catch (err) {
    next(err);
  }
});

/** タスク作成 */
tasksRouter.post('/', async (req, res, next) => {
  try {
    const input = parseTaskInput(req.body);
    if (!input.title) {
      return res.status(400).json({ error: 'title は必須です' });
    }
    const { rows } = await pool.query<TaskRow>(
      `INSERT INTO tasks (title, description, category_id, base_priority, due_date, estimated_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [input.title, input.description, input.categoryId, input.basePriority, input.dueDate, input.estimatedMinutes]
    );
    res.status(201).json(decorate(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** タスク更新（内容の編集） */
tasksRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = parseTaskInput(req.body);
    if (!input.title) {
      return res.status(400).json({ error: 'title は必須です' });
    }
    const { rows } = await pool.query<TaskRow>(
      `UPDATE tasks
         SET title = $1, description = $2, category_id = $3,
             base_priority = $4, due_date = $5, estimated_minutes = $6
       WHERE id = $7
       RETURNING ${COLUMNS}`,
      [input.title, input.description, input.categoryId, input.basePriority, input.dueDate, input.estimatedMinutes, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(decorate(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** 完了状態のトグル */
tasksRouter.patch('/:id/complete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const completed = Boolean(req.body?.completed);
    const { rows } = await pool.query<TaskRow>(
      `UPDATE tasks
         SET completed = $1,
             completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2
       RETURNING ${COLUMNS}`,
      [completed, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(decorate(rows[0]));
  } catch (err) {
    next(err);
  }
});

/** タスク削除 */
tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
