const API_URL = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

let state = {
  reservations: [],
  blocks: []
};

async function init() {
  const res = await fetch(API_URL + "/api/getInitData");
  const data = await res.json();

  state.reservations = data.reservations;
  state.blocks = data.blocks;

  renderCalendar();
}

function renderCalendar() {
  let html = "<h2>日付選択</h2>";

  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);

    const date = d.toISOString().split("T")[0];

    html += `<button onclick="selectDate('${date}')">${date}</button><br>`;
  }

  html += `<div id="times"></div>`;

  document.getElementById("app").innerHTML = html;
}

function selectDate(date) {
  let html = `<h3>${date}</h3>`;

  for (let h = 6; h <= 18; h++) {
    const time = String(h).padStart(2, "0") + ":00";

    const isReserved = state.reservations.some(r =>
      r.reservation_datetime.includes(date + " " + time)
    );

    const isBlocked = state.blocks.some(b =>
      b.date === date && b.time === time
    );

    if (isReserved || isBlocked) {
      html += `<div>${time} ×</div>`;
    } else {
      html += `<button onclick="selectTime('${date}','${time}')">${time} ○</button><br>`;
    }
  }

  document.getElementById("times").innerHTML = html;
}

function selectTime(date, time) {
  renderForm(date, time);
}

function renderForm(date, time) {
  document.getElementById("app").innerHTML = `
    <h2>予約フォーム</h2>
    ${date} ${time}<br><br>

    <input id="name" placeholder="名前"><br><br>
    <input id="phone" placeholder="電話番号"><br><br>
    <input id="pickup" placeholder="出発地"><br><br>
    <input id="destination" placeholder="行き先"><br><br>

    <button onclick="submitReservation('${date}','${time}')">予約する</button>
  `;
}

async function submitReservation(date, time) {
  const data = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    date,
    time,
    pickup: document.getElementById("pickup").value,
    destination: document.getElementById("destination").value,
    price: 5000
  };

  const res = await fetch(API_URL + "/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  if (result.success) {
    alert("予約完了");
    location.reload();
  } else {
    alert("エラー");
  }
}

init();
