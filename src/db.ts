import { Pool } from 'pg';

/**
 * データ永続化層。PostgreSQL への接続プールを 1 つだけ生成して共有する。
 * 接続情報は環境変数 DATABASE_URL から取得する（Render が自動で注入する）。
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // 起動時点で無ければ早めに気づけるようにする。
  console.warn('[db] DATABASE_URL が設定されていません。ローカルなら .env や環境変数で指定してください。');
}

// 本番 (Render) の PostgreSQL は SSL 必須。ローカルの平文接続では無効化する。
const useSsl = /render\.com|amazonaws\.com/.test(connectionString ?? '') || process.env.PGSSL === 'true';

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

/** スキーマを冪等に適用する。存在しなければ作成し、初回はサンプルのカテゴリを入れる。 */
export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id       SERIAL PRIMARY KEY,
      name     TEXT NOT NULL UNIQUE,
      color    TEXT NOT NULL DEFAULT '#6366f1',
      position INTEGER NOT NULL DEFAULT 0
    );

    -- 既存 DB にも position 列を追加（並び替え用）
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS tasks (
      id                SERIAL PRIMARY KEY,
      title             TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      base_priority     INTEGER NOT NULL DEFAULT 2 CHECK (base_priority BETWEEN 1 AND 4),
      due_date          TIMESTAMPTZ,
      estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
      completed         BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks (due_date);
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM categories');
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO categories (name, color, position) VALUES
        ('仕事',   '#3b82f6', 1),
        ('プライベート', '#22c55e', 2),
        ('勉強',   '#a855f7', 3),
        ('買い物', '#f59e0b', 4)`
    );
  }
}
