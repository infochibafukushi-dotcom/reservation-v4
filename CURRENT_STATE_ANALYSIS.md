# 現状分析レポート（reservation-v4 / 2026-04-27時点）

## 0. エグゼクティブサマリー
- **現行の主系統は「GASなし」構成で、`index.html` + `admin.html` が `config.js` 経由で Cloudflare Worker API を直接利用**する形で動いています（公開画面・管理画面とも同一API基盤）。
- APIは Cloudflare Workers + D1 を前提とした単一 `worker.js` に集約され、予約作成・ブロック管理・設定管理・メニュー管理・CSV出力まで実装済みです。
- 予約可否判定は「手動ブロック + 予約由来ブロック + 当日最短時間」の3要素で構成され、公開/管理カレンダーで同様のルールが使われています。
- 一方で、**現状の管理APIは認証トークン検証をしておらず、ログイン成功後のトークンをAPI側で未検証**です（UI上のログイン制御はあるがサーバー強制力がない）。
- リポジトリ内には旧世代ファイル（`form.html`, `app.js`, `calendar.js`）が残っており、現行の `index.*.js` 系実装と二重化しています。運用事故防止のため、現行採用ファイルの明示と旧系の整理が必要です。

## 1. 現行アーキテクチャ（v4）

### 1-1. フロント（公開）
- 画面本体は `index.html`。
- APIクライアント共通は `index.api.js`。
- 予約フォーム制御は `index.booking.js`。
- カレンダー/表示文言反映は `index.calendar.js`。
- 管理画面への隠し導線（ロゴ連打）は `index.ui.js`。

### 1-2. フロント（管理）
- 画面本体は `admin.html`。
- 管理ロジックは `admin.js` 単体に集約（旧v2で分割されていた `admin.app.js` 等は現リポジトリには存在しない）。
- APIクライアントは公開側と同じ `index.api.js` を再利用。

### 1-3. バックエンド
- Cloudflare Worker (`worker.js`) が REST API を提供。
- D1に `settings`, `reservations`, `blocks` を保持。
- `ensureSchema` で起動時にテーブル作成/列追加を行う自己修復型スキーマ運用。

## 2. 公開画面（お客様導線）で「できること」

### 2-1. 空き枠閲覧
- 7日単位で前後移動。
- 通常時間（6:00〜21:00）/時間外含む表示（0:00〜23:30）切替。
- 枠表示は `◎`（予約可）/`×`（予約不可）。

### 2-2. 予約入力〜送信
- 予約可能枠クリックでモーダルを開く。
- 必須入力（同意、氏名カナ、電話、お伺い先、移動方法）を検証。
- 電話フォーマット・カナ入力を検証。
- メニュー選択に応じて概算を即時計算。
- 送信成功時は予約IDを完了ビューに表示し、直後に再読込して枠を埋める。

### 2-3. 管理導線
- ロゴを短時間に5回タップすると `admin.html` に遷移。

## 3. 公開導線の「仕組み」

### 3-1. 可否判定ロジック
- カレンダー上の枠は以下のOR条件で不可判定：
  1) `blocks` テーブル由来のブロック（手動/予約由来）
  2) 当日最短時間設定（`same_day_enabled`, `min_hours`）を満たさない枠
- 予約由来ブロックは `type='auto'` として保存され、UIで `reserved` クラスが付与される。

### 3-2. 初期化/データ取得
- `loadPublicBootstrap()` でブランド設定 + 文言設定を先に反映。
- `loadCalendarData()` で表示範囲のブロックを取得し、グリッド描画。
- `/api/rangeData` 失敗時は `/api/getBlocks` にフォールバック。

### 3-3. 料金計算
- 基本料金（base/dispatch/special）+ サービス加算（選択項目）を合計。
- メニュー/基本料金取得失敗時はフロント内フォールバック定義を使用。

## 4. 管理画面で「できること」

### 4-1. 認証・表示制御
- ログイン画面と管理画面本体の表示切替。
- ログアウト時に `sessionStorage` の認証情報を削除。
- 公開ページへの戻る導線あり。

### 4-2. ダッシュボード
- 予約件数 / 未対応 / 確認済 / 完了 を表示。

### 4-3. 予約カレンダー運用
- 週送り。
- 通常/時間外表示切替。
- 30分単位の個別ブロックトグル。
- 日単位トグル。
- 時間帯一括ブロック/解除。
- 当日最短時間による派生ブロック可視化。

### 4-4. 予約一覧・詳細
- 上位10件のカード一覧 + 全件テーブルモーダル。
- 詳細モーダル表示。
- ステータス更新（未対応/確認済/完了/キャンセル）。
- 非表示化（`is_visible=0`）。
- CSVダウンロード。

### 4-5. ブランド/運用設定
- ロゴ文字・サブテキスト・画像URL。
- GitHub連携項目（user/repo/branch/path/PAT）。
- Webhook URL。
- 当日予約設定（表示ON/OFF + 最短時間）。
- 管理パスワード変更。

### 4-6. 料金/文言マスタ
- 基本料金（3項目）編集保存。
- グループ設定（公開/必須/並び）編集。
- メニュー項目（名称・価格・説明・表示・所属）編集。
- UI文言（予約モーダル/完了文言など）編集保存。

## 5. API実装の実態（GAS非依存）

### 5-1. 公開系
- `GET /api/bootstrap`
- `GET /api/rangeData?start=...&end=...`
- `GET /api/getBlocks`
- `GET /api/menu`
- `GET /api/baseFees`
- `GET /api/uiTexts`
- `POST /api/createReservation`
- `POST /api/cancelReservation`

### 5-2. 管理系
- `POST /api/admin/login`
- `GET /api/admin/settings`
- `POST /api/admin/settings/save`
- `POST /api/admin/password/change`
- `POST /api/admin/menu/save`
- `POST /api/admin/baseFees/save`
- `POST /api/admin/uiTexts/save`
- `POST /api/admin/logo/upload`
- `POST /api/admin/blocks/slot`
- `POST /api/admin/blocks/day`
- `POST /api/admin/blocks/timeRange`
- `POST /api/admin/reservations/update`
- `POST /api/admin/reservations/hide`
- `GET /api/admin/reservations/csv`

## 6. 予約データ処理の要点
- 予約作成時、`roundTrip` 文言に応じてブロック数を 2枠 or 4枠に決定。
- 予約確定時に `blocks` へ `type='auto'` を連続INSERT（`INSERT OR IGNORE` + ユニーク制約）。
- `cancel` 時は予約由来ブロックを削除。
- `blocks(date,time)` のユニークインデックスで二重予約衝突をDB側でも防御。

## 7. 現状のギャップ/リスク（優先順）

### 高優先
1. **API認証が実質未適用**
   - `admin/login` はトークンを返すが、以降の管理APIでトークン検証がない。
   - 現状は「管理画面UIを開けるか」だけで、API自体は直接叩ける状態。

2. **機密値の平文保存**
   - `settings` に GitHub PAT を平文保存している。

3. **CORSがワイルドカード固定**
   - 全オリジン許可のため、管理API露出リスクを増幅。

### 中優先
4. **旧実装の残置による保守混乱**
   - `form.html`, `app.js`, `calendar.js` は現行導線と別世代。
   - `app.js` は `ENDPOINTS.getUITexts` を参照するが `config.js` には未定義。

5. **`/api/admin/logout` の実体なし**
   - `config.js` に定義はあるが Worker 実装に存在しない（UI影響は小）。

6. **時刻処理のJST固定/環境依存混在**
   - 一部は `+09:00` 明示、一部はローカル `new Date()` 依存。

## 8. 「お客様導線」と「表ページ（予約一覧）」の整理（v4実装ベース）

### 8-1. お客様導線
- 入口: `index.html`
- 主な操作: 週移動 / 時間帯切替 / 空き枠選択 / フォーム入力 / 予約確定
- 成功時: 予約ID表示 + 枠再読込

### 8-2. 表ページ（管理テーブル）
- 入口: `admin.html` 内モーダル（`#reservationModal`）
- 主な操作: 全件俯瞰 / 行クリックで詳細 / ステータス更新 / 非表示化
- 連動: 更新後に再取得・再描画し、統計とカレンダーにも反映

## 9. v4での「GAS非使用再現」の達成度
- **達成済み**: 予約・ブロック・設定・メニュー・文言・CSV・通知まで Worker API に統合。
- **未達/要強化**: 管理APIの認証強制、秘密情報管理、旧世代ファイル整理、監査ログ。

## 10. 次アクション提案（実装順）
1. 管理APIに `Authorization: Bearer <token>` 検証を導入（最低限HMAC署名トークン+有効期限）。
2. CORSを本番公開ドメインと管理ドメインに限定。
3. GitHub PAT を暗号化保管 or Secret Store移管。
4. 旧世代ファイルを `legacy/` に隔離し、READMEで現行採用ファイルを明記。
5. タイムゾーン処理を「保存JST文字列・判定JST」のルールに統一。
