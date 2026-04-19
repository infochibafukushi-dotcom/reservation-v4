差し替え対象

1. index.html
- GitHub Pages 側
- 1ファイル完結
- カレンダーは横7日、縦30分刻み
- 通常は 06:00〜21:00
- 右上の「深夜・早朝」で 00:00〜23:30 に切替
- 当日で過ぎた時間は自動で ×

2. worker.js
- Cloudflare Workers 側
- 片道扱い: 2枠
- 往復 / 待機 / 付き添い / 病院付き添い: 4枠
- 自動ブロックは blocks(date, time, type='auto') に保存

前提
- blocks テーブルに date, time, type があること
- menu テーブルに category があること
