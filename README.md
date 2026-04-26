# UI 100%一致版（GASなし）

公開画面・管理画面を同じカレンダー2系の見た目に統一しています。

## 重要
- 公開画面右下の管理画面ボタンは削除済み
- 管理画面はカレンダーを最上部・最大表示
- 予約一覧、売上集計、CSV、メニュー編集、Webhook設定は維持
- GASは使用しません
- Cloudflare Workers + D1 使用

## 設置
1. Cloudflare Worker に worker.js を上書き
2. D1 Binding 名は DB
3. GitHub Pages に残りのファイルを上書き
4. 管理画面: admin.html
5. 初期パスワード: 1234
