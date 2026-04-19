このZIPの中身

1. index.html
- GitHub Pages に置く公開画面
- 1ファイル完結
- LINE風の段階式
- サービス選択はアコーディオン + プルダウン

2. worker.js
- Cloudflare Workers に丸ごと貼り替える用
- 自動ブロック対応
- blocks テーブルは date / time / type を使用

前提
- D1 の menu テーブルに category が入っていること
- blocks テーブルは date, time, type を持っていること
- reservations テーブルは既存の項目を使用

ブロック仕様
- 往復送迎が空 or 不要: 2枠
- 往復 / 待機 / 付き添い / 病院付き添い: 4枠
