# 介護タクシー予約システム Cloudflare Workers + D1 完全版

GASを使わず、Cloudflare Workers + D1で動く予約カレンダー一式です。

## 入っているファイル

- index.html
- style.css
- config.js
- index.api.js
- index.calendar.js
- index.booking.js
- index.ui.js
- admin.html
- admin.js
- thanks.html
- worker.js
- logo.png

## 設置手順

### 1. Cloudflare Worker
Cloudflare Workers の worker.js を、このZIP内の worker.js でフル差し替えしてください。

### 2. D1 Binding
Worker の Bindings に D1 database を追加してください。

- Variable name: `DB`
- Database: `reservation-db`

### 3. config.js
必要に応じて `config.js` のURLを変更してください。

```js
API_BASE: "https://throbbing-bush-8f59.info-chibafukushi.workers.dev"
```

### 4. GitHub Pages
以下を reservation-v4 にアップロードしてください。

- index.html
- style.css
- config.js
- index.api.js
- index.calendar.js
- index.booking.js
- index.ui.js
- admin.html
- admin.js
- thanks.html
- logo.png

## 動作

- 公開画面: index.html
- 管理画面: admin.html
- 管理パスワード初期値: 1234

## API

- GET /api/getBlocks
- GET /api/getReservations
- POST /api/createReservation
- POST /api/cancelReservation
- POST /api/admin/login
- POST /api/admin/blocks/slot
- POST /api/admin/blocks/day
