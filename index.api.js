// ================================
// API BASE（Cloudflare Workers）
// ================================
const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

// ================================
// 共通FETCH
// ================================
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();
    return data;
  } catch (e) {
    console.error("API ERROR:", e);
    return { success: false };
  }
}

// ================================
// 初期データ取得
// ================================
async function api_getInitData() {
  return await apiFetch("/init-lite");
}

// ================================
// ブロック取得
// ================================
async function api_getBlocked() {
  return await apiFetch("/blocked");
}

// ================================
// 予約作成
// ================================
async function api_createReservation(payload) {
  return await apiFetch("/create", {
    method: "POST",
    body: payload
  });
}

// ================================
// 互換ラッパ（既存コード維持）
// ================================
async function api_getConfig() {
  return { success: true };
}

// ================================
// 外部公開（既存構造維持）
// ================================
window.API = {
  getInitData: api_getInitData,
  getBlocked: api_getBlocked,
  createReservation: api_createReservation,
  getConfig: api_getConfig
};
