const API_URL = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

let isLogin = false;

async function login() {
  const pass = document.getElementById("password").value;

  if (pass !== "1234") {
    alert("パスワード違う");
    return;
  }

  isLogin = true;
  loadReservations();
}

async function loadReservations() {
  const res = await fetch(API_URL + "/api/getReservations");
  const data = await res.json();

  render(data);
}

function render(list) {
  let html = "<h2>予約一覧</h2>";

  list.forEach(r => {
    html += `
      <div style="border:1px solid #000; margin:10px; padding:10px;">
        ${r.reservation_datetime} / ${r.customer_name} / ${r.phone_number}
        <br>
        ${r.pickup_location} → ${r.destination}
        <br>
        ${r.total_price}円
        <br>
        <button onclick="del('${r.id}')">削除</button>
      </div>
    `;
  });

  document.getElementById("app").innerHTML = html;
}

async function del(id) {
  await fetch(API_URL + "/api/deleteReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  loadReservations();
}
