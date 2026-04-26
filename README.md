# 本物レベル版（GASなし）

- 公開画面右下の管理画面ボタンは削除済み
- 管理画面はカレンダー2寄せ
- Cloudflare Workers + D1
- 予約、ブロック、キャンセル、CSV、売上、設定、メニュー編集対応

## 設置
1. worker.js を Cloudflare Worker に貼り替え
2. D1 Binding は `DB`
3. GitHub Pages側は残りのファイルを上書き
4. config.js の API_BASE を確認

## 管理画面
admin.html

初期パスワード: 1234
