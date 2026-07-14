# Task Flow — スマートタスク管理アプリ

締切が近づくと重要度が **自動で格上げ** され、いま取り組むべき **順番を提案** してくれる
タスク管理アプリです。「実践のためのWebプログラミング」レポート課題として作成した、
フロントエンド・バックエンド・データベースの三層構成アプリケーションです。

## 主な機能

- タスクの登録・編集・削除・完了トグル
- カテゴリによる分類（色つきラベル、カテゴリの追加も可能）
- 期限（日時）と所要時間（分）の設定
- 重要度（低 / 中 / 高 / 最優先）による色分け
- **締切接近による重要度の自動エスカレーション**
  期限が近づくほど実効重要度を動的に引き上げる（例: 1週間以内→中、3日以内→高、24時間以内・超過→最優先）
- **「やるべき順番」の自動提案**
  実効重要度・締切までの残り時間・所要時間から緊急度スコアを計算し、未完了タスクを並べ替え

## 技術スタック（三層構成）

| 層 | 技術 |
| --- | --- |
| プレゼンテーション（フロント） | HTML / CSS / TypeScript（バンドラなし・素の DOM 操作） |
| アプリケーション（バックエンド） | Node.js / Express / TypeScript による REST API |
| データ永続化（DB） | PostgreSQL（`pg` ドライバ） |

デプロイ先は [Render](https://render.com)。`render.yaml` により Web サービスと
PostgreSQL をまとめてプロビジョニングします。

## ディレクトリ構成

```
.
├── src/                  # バックエンド (TypeScript → dist/ にコンパイル)
│   ├── server.ts         # エントリポイント。静的配信 + API + 起動時スキーマ初期化
│   ├── db.ts             # PostgreSQL 接続プールとスキーマ定義
│   ├── priority.ts       # 重要度の自動格上げ・順番提案ロジック（本アプリの中核）
│   └── routes/
│       ├── tasks.ts      # /api/tasks の CRUD
│       └── categories.ts # /api/categories の CRUD
├── frontend/
│   ├── app.ts            # フロントの TypeScript → public/app.js にコンパイル
│   └── tsconfig.json
├── public/               # 静的ファイル (index.html, style.css, app.js)
├── render.yaml           # Render の Infrastructure as Code
└── tsconfig.json         # バックエンド用 tsconfig
```

## API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/tasks` | タスク一覧（緊急度順にソート済み） |
| POST | `/api/tasks` | タスク作成 |
| PUT | `/api/tasks/:id` | タスク更新 |
| PATCH | `/api/tasks/:id/complete` | 完了状態のトグル |
| DELETE | `/api/tasks/:id` | タスク削除 |
| GET | `/api/categories` | カテゴリ一覧 |
| POST | `/api/categories` | カテゴリ作成 |
| DELETE | `/api/categories/:id` | カテゴリ削除 |

## ローカルでの起動

前提: Node.js 20+ と PostgreSQL。

```bash
# 1. 依存関係のインストール
npm install

# 2. データベースを用意（例）
createdb taskdb

# 3. 接続情報を環境変数で渡してビルド & 起動
export DATABASE_URL="postgresql://ユーザー:パスワード@localhost:5432/taskdb"
npm run build
npm start
# → http://localhost:3000 で起動
```

テーブルは起動時に自動作成されます（`CREATE TABLE IF NOT EXISTS`）。マイグレーション不要。

## Render へのデプロイ

1. このリポジトリを GitHub に push する
2. Render で「New +」→「Blueprint」を選び、このリポジトリを指定する
3. `render.yaml` が読み込まれ、Web サービスと PostgreSQL が作成される
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - `DATABASE_URL` は作成された DB から自動で注入される
4. デプロイ完了後、発行された URL でアプリにアクセスできる

> Render の無料 PostgreSQL は SSL 必須のため、`src/db.ts` で接続先に応じて
> 自動的に SSL を有効化しています。
