// Cloudflare Workers + D1 版 設定ファイル
// 自分のWorker URLに変える場合はここだけ変更してください。
window.APP_CONFIG = {
  API_BASE: "https://throbbing-bush-8f59.info-chibafukushi.workers.dev",
  ENDPOINTS: {
    getBlocks: "/api/getBlocks",
    getReservations: "/api/getReservations",
    createReservation: "/api/createReservation",
    cancelReservation: "/api/cancelReservation",
    blockSlot: "/api/admin/blocks/slot",
    blockDay: "/api/admin/blocks/day",
    login: "/api/admin/login",
    menu: "/api/menu",
    uiTexts: "/api/getUITexts",
    baseFees: "/api/baseFees"
  }
};
