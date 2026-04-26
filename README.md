# reservation-v4 完全上書き版

GASなし、Cloudflare Workers + D1対応。

## 実装済み

### 公開画面
- v2系に寄せた7日カレンダー
- ◎/×表示
- 30分単位
- 深夜早朝表示切替
- 予約フォーム
- 概算料金
- 予約時の自動ブロック
- 片道2枠、往復/待機/病院付き添い4枠

### 管理画面
- ログイン
- 予約一覧
- ステータス変更
- キャンセル
- 枠単位ブロック
- 日単位ブロック
- 週送り
- 売上集計
- CSVダウンロード
- 管理パスワード変更
- 通知Webhook URL設定
- メニュー/料金編集

## 設置

1. Cloudflare Worker の worker.js を上書き
2. D1 Binding
   - Variable name: DB
   - Database: reservation-db
3. GitHub Pages に残りファイルを上書き
4. config.js の API_BASE を必要に応じて変更

## 初期管理パスワード

1234
