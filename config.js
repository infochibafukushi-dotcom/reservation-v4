// reservation-v4 Cloudflare Workers + D1 本番設定
window.APP_CONFIG = {
  API_BASE: "https://throbbing-bush-8f59.info-chibafukushi.workers.dev",
  ENDPOINTS: {
    getBlocks: "/api/getBlocks",
    getReservations: "/api/getReservations",
    createReservation: "/api/createReservation",
    cancelReservation: "/api/cancelReservation",
    updateReservation: "/api/admin/reservations/update",
    getSalesSummary: "/api/admin/sales/summary",
    getCsv: "/api/admin/reservations/csv",
    blockSlot: "/api/admin/blocks/slot",
    blockDay: "/api/admin/blocks/day",
    login: "/api/admin/login",
    getSettings: "/api/admin/settings",
    saveSettings: "/api/admin/settings/save",
    getMenu: "/api/menu",
    saveMenu: "/api/admin/menu/save",
    getUITexts: "/api/getUITexts",
    baseFees: "/api/baseFees"
  }
};
