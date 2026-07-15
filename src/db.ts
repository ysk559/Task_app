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

/**
 * スキーマを冪等に適用する。
 *
 * ログインを設けない代わりに、ブラウザごとに発行する匿名の client_id で
 * データを分離する。すべての行は client_id を持ち、API はそれで絞り込む。
 * デフォルトカテゴリは「そのクライアントを初めて見たとき」に投入する（clients テーブルで判定）。
 */
export async function initSchema(): Promise<void> {
  await pool.query(`
    -- 既知のクライアント（＝ブラウザ）。初回登録の検出とデフォルト投入に使う。
    CREATE TABLE IF NOT EXISTS clients (
      id         TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id        SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL DEFAULT '',
      name      TEXT NOT NULL,
      color     TEXT NOT NULL DEFAULT '#6366f1',
      position  INTEGER NOT NULL DEFAULT 0
    );

    -- 既存 DB のための移行
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
    -- 旧: name のグローバル一意制約を外し、クライアント単位の一意制約へ
    ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;

    CREATE TABLE IF NOT EXISTS tasks (
      id                SERIAL PRIMARY KEY,
      client_id         TEXT NOT NULL DEFAULT '',
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

    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS idx_tasks_client    ON tasks (client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks (due_date);
    CREATE INDEX IF NOT EXISTS idx_categories_client ON categories (client_id);

    -- カテゴリ名の一意性はクライアント単位にする
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_client_name_key') THEN
        ALTER TABLE categories ADD CONSTRAINT categories_client_name_key UNIQUE (client_id, name);
      END IF;
    END $$;
  `);
}

/** そのクライアントに標準カテゴリ一式を投入する（初回登録時に使用）。 */
export async function seedDefaultCategories(clientId: string): Promise<void> {
  await pool.query(
    `INSERT INTO categories (client_id, name, color, position) VALUES
      ($1, '仕事',        '#3b82f6', 1),
      ($1, 'プライベート', '#22c55e', 2),
      ($1, '勉強',        '#a855f7', 3),
      ($1, '買い物',      '#f59e0b', 4)
     ON CONFLICT (client_id, name) DO NOTHING`,
    [clientId]
  );
}
