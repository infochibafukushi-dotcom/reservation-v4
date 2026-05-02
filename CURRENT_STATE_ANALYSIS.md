# 現状分析レポート（reservation-v4 / 2026-04-30時点）

## 0. エグゼクティブサマリー
- 本リポジトリの現行動線は **`index.html`（公開）+ `admin.html`（管理）+ `worker.js`（Cloudflare Worker API）** の構成で、GAS 非依存で予約業務を完結できる状態です。
- API は `worker.js` に集約され、予約作成、枠ブロック、メニュー/料金/文言設定、CSV 出力、簡易セッション認証まで実装されています。
- 予約可否は `blocks` テーブル中心（手動・予約由来）＋当日最短時間（`same_day_enabled`,`min_hours`）で統一されています。
- ただし、運用リスクとして **CORS 全許可、管理パスワード初期値運用、設定テーブルへの機密値保存、旧世代ファイル残置** が残っています。

---

## 1. 現行システム構成

### 1-1. 公開フロント
- `index.html` がエントリ。
- `index.api.js` が API 呼び出し共通化。
- `index.calendar.js` が空き枠表示、`index.booking.js` が予約送信を担当（公開画面から管理画面への隠し導線は廃止済み）。

### 1-2. 管理フロント
- `admin.html` + `admin.js` で構成。
- API クライアントは公開側と同じ `index.api.js` を再利用。
- ログイン状態はトークンを `sessionStorage` で保持し、管理系 API へ Bearer 付与する設計。

### 1-3. バックエンド
- `worker.js` が全 API エンドポイントを提供。
- D1 テーブルは `settings`, `reservations`, `blocks`。
- `ensureSchema()` で必要テーブル/列を起動時補完（自己修復型）。

---

## 2. 主要業務フロー分析

### 2-1. 予約作成フロー（公開）
1. 利用者が日時を選択。
2. `POST /api/createReservation` 実行。
3. Worker で必須項目・日時フォーマット検証。
4. 指定枠の `blocks` 存在チェック（衝突時 409）。
5. `reservations` 登録。
6. `roundTrip` から 2 枠/4 枠を判定し `blocks(type='auto')` を連続作成。
7. Webhook 通知（設定時のみ）。

### 2-2. 予約キャンセル/管理更新
- `cancel` または管理側の `status='cancel'` 更新時に、自動ブロック (`type='auto'`) を削除。
- 管理側は「更新」「非表示」「削除」を API で個別実行。

### 2-3. 枠管理
- 30分スロット単位（`blocks(date,time)` ユニーク）で二重予約をDBでも防止。
- 管理操作は個別/日単位/時間帯一括に対応。

---

## 3. 認証・セキュリティの実態

## 3-1. できていること
- `POST /api/admin/login` でトークン発行（12時間有効）。
- 管理系 API は `isAdminAuthorized()` により Bearer トークンと有効期限を検証。
- `POST /api/admin/logout` でサーバ保存トークンを無効化可能。

## 3-2. リスクが残る点
1. **CORS 全許可 (`Access-Control-Allow-Origin: *`)**
   - 管理 API も同一 CORS 設定で返却。トークン漏えい時の悪用範囲が広い。
2. **管理パスワード既定値 (`1234`) 依存リスク**
   - 初期化時に `settings.admin_password='1234'` を投入。
3. **機密情報の平文保存**
   - `settings` に GitHub PAT 等を文字列保存。
4. **セッションは単一トークン上書き型**
   - 多端末同時管理や監査要件がある場合は不十分。

---

## 4. データモデル評価

### 4-1. reservations
- PK は日時ベースの業務ID（重複時サフィックス）。
- `status`, `is_visible`, 料金内訳、フォーム項目を1テーブル保持。
- 特徴: 検索性は高いが、将来的な正規化（顧客、配車履歴、監査ログ分離）は未実施。

### 4-2. blocks
- `date,time` ユニークで衝突制御。
- `type`（manual/auto）で運用由来を区別。
- `cleanupStaleAutoBlocks()` が孤児ブロック掃除を担当。

### 4-3. settings
- KVS 形式で柔軟性は高い。
- 反面、型安全性・必須項目保証・機密管理で弱い。

---

## 5. コードベース健全性

### 5-1. 良い点
- API が単一 Worker に集約されデプロイは簡単。
- `bootstrap`/`rangeData` で公開画面初期表示の往復を削減。
- フォールバック API（`rangeData`→`getBlocks`）で可用性を担保。

### 5-2. 技術的負債
- `worker.js` の責務が大きく、認証・業務・通知・CSV が単一ファイル密結合。
- 旧世代ファイル（`form.html`,`app.js`,`calendar.js`）が現行実装と併存。
- README 記載「認証・ログアウト実装」と現状は整合するが、セキュリティ境界（CORSや秘密管理）までは未充足。

---

## 6. 運用視点での優先改善提案（優先順）

1. **CORS 制限**
   - `Access-Control-Allow-Origin` を本番ドメインのみに限定。
2. **認証強化**
   - パスワードハッシュ化（現状は平文比較）。
   - セッションIDの複数管理または失効リスト導入。
3. **機密管理改善**
   - PAT を D1 平文保存せず、Cloudflare Secrets/KV 等へ移管。
4. **コード分割**
   - `worker.js` を `auth / reservations / blocks / settings` などへ分割。
5. **旧資産整理**
   - 旧世代ファイルを `legacy/` へ隔離し、採用導線を README で固定。

---

## 7. 結論
- **予約システムとしての機能完成度は高く、GAS 代替として実運用可能なレベル**です。
- 一方で、**セキュリティ境界（CORS・秘密情報・認証運用）と保守性（単一巨大 Worker・旧資産残置）** が次のボトルネックです。
- まずは「CORS制限」「管理パスワード/機密管理強化」「Worker分割」の3点を先行することで、障害/漏えいリスクを大幅に下げられます。
