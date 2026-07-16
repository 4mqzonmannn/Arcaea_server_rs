# CLAUDE_CODE_PROMPT.md

## Role
あなたはフルスタックエンジニア（Rust/Rocket & React/Vite/TypeScript）です。Arcaea_server_rsプロジェクトのWeb管理画面（admin-webapp）の利便性向上、およびサーバー全体（バックエンド）の運用管理機能の改良を担当します。

## Goal
現在のRustサーバー（Rocketベース）とReact管理画面（Vite + Tailwind）に対し、以下の改良を実施して運用・管理機能を大幅に強化すること。

1. **運用ダッシュボードの実装**: サーバーのメトリクス（Prometheus）やアクティブユーザー数、最新のシステムログを視覚化するホーム画面の追加。
2. **プレイヤー管理機能の強化**: ユーザーの検索、詳細情報（スコア、所持アイテム）の確認、アカウント停止（BAN）および個別アイテム付与（Present）のUI実装と対応するバックエンドAPIの整備。
3. **楽曲(Song)・アセット(Bundle)管理の高度化**: 既存のJSON編集やファイル配置をGUI上で安全に行える機能（ドラッグ＆ドロップでの順序変更、ジャケットプレビュー、S3連携のアップロード機能）の追加。
4. **イベント・World Modeの管理UI**: ゲーム内イベントやWorld Modeのマップ・報酬設定をGUIから編集し、サーバーに動的反映させる機能の実装。

## Context
このプロジェクトはRustによるゲームサーバー実装（`Arcaea_server_rs`）です。バックエンドはRocketフレームワーク、SQLx(MySQL)、Redis、AWS S3 SDKを使用しています。フロントエンド(`frontend`ディレクトリ)はReact、Vite、Tailwind CSSで構築されたモダンな構成です。
現在、`src/main.rs` には各種サービス（`UserService`, `BundleService`, `ScoreService` など）と管理用APIルート(`/web`)が存在しますが、運用をさらに効率化するためにUIとAPIの両面からの拡張が求められています。

## First Read-only Checks
1. `src/route/admin.rs` および関連するAPIエンドポイントの実装を確認し、現在の管理APIの機能を把握する。
2. `frontend/src/` 内の既存コンポーネント（例: `SongEditorModal.js` など）の設計とルーティングを確認する。
3. `Cargo.toml` の依存関係（特に `rocket_prometheus`, `tracing` など）を確認し、メトリクス取得のエンドポイントがどのように構成されているかを調査する。
4. `src/service/` 以下の主要なサービスモジュールのメソッドを確認し、APIから呼び出せる機能の範囲を把握する。

## Allowed Actions
- `frontend/src/` 以下への新しいReactコンポーネント、ページ、APIクライアント機能の追加。
- `frontend/` でのUIスタイル（Tailwind CSS）の調整およびライブラリの追加（要事前確認なしのマイナーなもの）。
- `src/route/admin.rs` などへの新しいエンドポイントの追加。
- 既存のRustサービス層（`src/service/`）への非破壊的な機能追加（検索メソッド、統計取得メソッドなど）。
- データベースのRead操作を行うクエリの追加。

## Ask Before Actions
- データベーススキーマ（`migrations/`）の変更や、既存テーブルの削除・構造変更を伴う作業。
- バックエンドの認証・認可ロジックに対する大幅な変更。
- 新しい外部ミドルウェア（Redis以外のKVSなど）の導入。
- サーバーの再起動を伴うテスト実行や、マイグレーションの実行。
- 外部APIへの通信や、環境変数（`.env`）の構造変更。

## Forbidden Actions
- 既存のユーザーデータ、楽曲データ、本番稼働で利用される設定ファイル（`songs/songlist`等）の破壊的変更・削除。
- `Ask Before Actions` で指定された項目の無断実行。
- 本番環境でのマイグレーションやリセットコマンドの無断実行。
- シークレット（パスワード、APIキー、トークン）をログやコードにハードコード・出力すること。

## Step-by-step Plan
1. **現状分析と設計整理**: フロントエンドのルーティングとバックエンドの管理API(`admin.rs`)の現状をマッピングする。
2. **ダッシュボードAPIの実装**: バックエンドにサーバー統計情報（ユーザー数、アセット数など）を返すエンドポイントを追加する。
3. **フロントエンド・ダッシュボードの構築**: React側にダッシュボード画面を作成し、APIと繋ぎ込む。
4. **プレイヤー管理機能の拡張**: `UserService`を拡張し、ユーザー一覧のページネーション付き取得やBANフラグ更新APIを実装。フロントエンドに対応するUIを追加。
5. **楽曲・Bundle管理のUI改善**: 既存のエディタを拡張し、画像プレビュー機能やS3同期状況のステータス表示をフロントエンドに追加。バックエンドはファイルアップロードの安全な処理を補強。
6. **テストと検証**: フロントエンドのビルドテスト、バックエンドのコンパイルおよびローカルでのAPI動作確認。

## Files To Inspect
- `src/route/admin.rs`
- `src/main.rs`
- `src/service/user.rs` (またはそれに該当するファイル)
- `frontend/package.json`
- `frontend/src/App.tsx` (またはフロントエンドのエントリーポイント・ルーティング設定)
- `frontend/src/components/SongEditorModal.js`

## Files To Create or Modify
- `src/route/admin.rs` (新規APIルートの追加)
- `frontend/src/pages/Dashboard.tsx` (新規作成)
- `frontend/src/pages/UsersManagement.tsx` (新規作成)
- `frontend/src/api/admin.ts` (APIクライアントの実装追加)
- バックエンドの各種サービスクラスファイル（必要に応じて拡張）

## Commands To Run

### Read-only
- `cargo check` (Rustのコンパイルチェック)
- `cd frontend && pnpm run lint` または `npm run lint`
- `grep` や `cat` を用いたコードの調査。

### Requires Approval
- `cargo run` または `cargo test` によるサーバーの起動・テスト実行。
- `sqlx migrate run` などのDBマイグレーション実行。
- `pnpm install <package>` によるフロントエンドへの新しい主要ライブラリ追加。

## Validation
- `cargo check` および `cd frontend && pnpm build` がエラーなく通ること。
- バックエンドに追加した管理APIに対し、curl等で正しいJSONレスポンスが返ること。
- フロントエンドのダッシュボードや管理画面がブラウザ（またはプレビュー環境）で正常に描画され、APIからデータを取得できること。

## Rollback
- フロントエンドおよびバックエンドのソースコード変更を `git restore` や `git reset --hard` によって破棄し、以前のコミット状態に戻す。
- データベーススキーマを変更した場合（承認後）は、`sqlx migrate revert` を実行してスキーマを戻す。

## Expected Final Report
- 追加したAPIエンドポイントのリストとそれぞれの役割。
- フロントエンドに追加・改修した画面（ページ）の機能説明。
- 次のステップとして残っている課題（もしあれば）の提示。
- 「これらの変更により、管理画面の利便性とサーバー運用能力がどのように向上したか」の総括。
