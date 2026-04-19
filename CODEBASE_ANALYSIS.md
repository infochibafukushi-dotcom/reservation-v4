# reservation-v4 現状コード解析（2026-04-19）

## 1. 全体アーキテクチャ
- フロントエンドのみで構成されたシングルページアプリ（public: `index.html` / admin: `admin.html`）。
- データ永続化・業務ロジックは Google Apps Script（GAS）Web API に集約。
- JSはビルド無しのグローバル関数共有構成で、`index.api.js`/`index.calendar.js`/`index.booking.js` と `admin.api.js`/`admin.calendar.js`/`admin.menu.js`/`admin.app.js` に分割。

## 2. 機能サマリ
### 公開画面
- カレンダー表示、枠クリック、予約フォーム入力、料金概算計算、予約送信。
- localStorage キャッシュ（bootstrap/block keys）と先読みで表示高速化。
- 同日予約制限（X表示）や他時間帯表示切替に対応。

### 管理画面
- セッションストレージの `admin_auth` + `admin_token` 前提でログイン状態判定。
- 予約一覧、詳細編集、非表示化、カレンダーブロック管理。
- ロゴ・文言・当日予約・メニュー（グループ/表示順/必須/自動セット）設定を保存。

## 3. 品質観点の所見
### 強み
- APIアクセスに timeout/retry/JSONP fallback が実装され、回線不安定時の復元性が高い。
- 公開画面はキャッシュを使って初回体感速度を改善している。
- UIはモバイル/PC向けのCSS調整が細かい。

### 課題
1. **機密情報の露出リスク**
   - `TRIGGER_URL` に `secret=secret1` が平文で埋め込み。
2. **可読性・保守性低下**
   - `index.booking.js` に「patch/fix」形式の上書きロジックが多層で混在し、責務境界が不明瞭。
3. **型安全性の欠如**
   - グローバル変数共有 + 文字列キー依存が多く、回帰不具合を誘発しやすい。
4. **API層の重複実装**
   - public/adminでほぼ同じ fetch/JSONP/retry 実装を二重管理。

## 4. 優先改善提案（短期）
1. 露出シークレットの無効化とローテーション。
2. `index.booking.js` のパッチ層統合（単一責務化）。
3. API共通クライアントを1ファイルへ統合。
4. 主要ドメイン（予約枠判定/料金算出）に最小限の自動テスト導入。

## 5. 優先改善提案（中期）
- ES Modules化してグローバル依存を排除。
- 型導入（JSDoc or TypeScript）で key/value 契約を明文化。
- GASのレスポンススキーマを固定化し、フロントでバリデーション。

