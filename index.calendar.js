// ================================
// カレンダー描画（Workers対応版）
// ================================

document.addEventListener("DOMContentLoaded", async () => {
  initCalendar();
});

async function initCalendar() {
  const container = document.getElementById("calendar");

  if (!container) return;

  container.innerHTML = "読み込み中...";

  try {
    const blocked = await window.API.getBlocked();

    // Workersは [] を返す想定
    const blockedList = Array.isArray(blocked) ? blocked : [];

    renderCalendar(container, blockedList);

  } catch (e) {
    console.error(e);
    container.innerHTML = "読み込みエラー";
  }
}

// ================================
// カレンダーUI生成（簡易版）
// ================================
function renderCalendar(container, blockedList) {
  container.innerHTML = "";

  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setDate(today.getDate() + i);

    const dayStr = formatDate(day);

    const el = document.createElement("div");
    el.style.padding = "10px";
    el.style.borderBottom = "1px solid #ddd";

    el.innerHTML = `<strong>${dayStr}</strong>`;

    const slot = document.createElement("div");

    const isBlocked = blockedList.includes(dayStr);

    slot.innerHTML = isBlocked
      ? "❌ 予約不可"
      : "⭕ 予約可能";

    el.appendChild(slot);
    container.appendChild(el);
  }
}

// ================================
// 日付フォーマット
// ================================
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}
