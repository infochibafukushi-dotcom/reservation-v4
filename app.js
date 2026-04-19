const API_URL = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

async function init() {
  const res = await fetch(API_URL + "/api/getInitData");
  const data = await res.json();

  renderForm(data);
}

function renderForm(data) {
  const menuOptions = data.menu.map(m => `
    <option value="${m.name}" data-price="${m.price}">
      ${m.name}（${m.price}円）
    </option>
  `).join("");

  document.getElementById("app").innerHTML = `
    <h2>予約フォーム</h2>

    <input id="name" placeholder="名前"><br><br>
    <input id="phone" placeholder="電話番号"><br><br>

    <input id="date" type="date"><br><br>
    <input id="time" type="time"><br><br>

    <input id="pickup" placeholder="出発地"><br><br>
    <input id="destination" placeholder="行き先"><br><br>

    <select id="menu">
      ${menuOptions}
    </select><br><br>

    <button onclick="submitReservation()">予約する</button>
  `;
}

async function submitReservation() {
  const data = {
    name: document.getElementById("name").value,
    phone: document.getElementById("phone").value,
    date: document.getElementById("date").value,
    time: document.getElementById("time").value,
    pickup: document.getElementById("pickup").value,
    destination: document.getElementById("destination").value,
    type: "",
    options: [],
    price: 5000
  };

  const res = await fetch(API_URL + "/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  alert(result.success ? "予約完了" : "エラー");
}

init();
