const API_URL = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

async function init() {
  const res = await fetch(API_URL + "/api/getInitData");
  const data = await res.json();

  console.log(data);

  document.getElementById("app").innerHTML = `
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;
}

init();
