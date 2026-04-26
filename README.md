# reservation-v4 本番完全連動版

常に本番用です。GASは使いません。

## 含む機能
- Cloudflare Workers + D1 API
- ◎/× D1リアル反映
- 予約フォーム連動
- 予約後の自動ブロック
- 管理画面カレンダー連動
- 枠単位/日単位ブロック
- 予約一覧/キャンセル/ステータス更新
- CSV出力
- メニュー編集
- 基本料金編集（基本運賃・予約配車料・特殊車両料）
- Webhook設定
- 管理画面各項目アコーディオン

## 設置
1. worker.js を Cloudflare Worker に上書き
2. D1 Binding は DB
3. その他ファイルを GitHub Pages へ上書き
4. 初期管理パスワード: 1234
