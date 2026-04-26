const APP = window.APP_CONFIG;
const API_BASE = APP.API_BASE.replace(/\/$/, "");
const ENDPOINTS = APP.ENDPOINTS;

function toast(message, ms = 2200){
  const el = document.getElementById("toast");
  if (!el) return alert(message);
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.style.display = "none", ms);
}

function apiUrl(path){
  return API_BASE + path;
}

async function apiGet(path){
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || text || `HTTP ${res.status}`);
  return data;
}

async function apiPost(path, payload){
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || text || `HTTP ${res.status}`);
  return data;
}
