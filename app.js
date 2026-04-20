const API = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

let currentStart = new Date();
let fullMode = false;

function formatDate(d){
  const y = d.getFullYear();
  const m = ("0"+(d.getMonth()+1)).slice(-2);
  const day = ("0"+d.getDate()).slice(-2);
  return `${y}-${m}-${day}`;
}

function formatLabel(d){
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function addDays(base, n){
  const d = new Date(base);
  d.setDate(d.getDate()+n);
  return d;
}

async function render(){

  const table = document.getElementById("calendar");
  table.innerHTML = "";

  const res = await fetch(API + "/api/getInitData");
  const json = await res.json();

  const blocks = json.blocks || [];

  // ヘッダ（日付）
  const head = document.createElement("tr");
  head.appendChild(document.createElement("td"));

  let days = [];
  for(let i=0;i<7;i++){
    const d = addDays(currentStart, i);
    days.push(d);

    const th = document.createElement("td");
    th.innerText = formatLabel(d);
    head.appendChild(th);
  }

  table.appendChild(head);

  const start = fullMode ? 0 : 6;
  const end = fullMode ? 23 : 21;

  for(let h=start; h<=end; h++){
    for(let m of [0,30]){

      const tr = document.createElement("tr");

      const timeTd = document.createElement("td");
      timeTd.innerText = `${("0"+h).slice(-2)}:${m===0?"00":"30"}`;
      tr.appendChild(timeTd);

      days.forEach(d => {

        const td = document.createElement("td");
        const box = document.createElement("div");

        const dateStr = formatDate(d);
        const timeStr = `${("0"+h).slice(-2)}:${m===0?"00":"30"}`;

        const isPast = new Date(dateStr+"T"+timeStr) < new Date();

        const isBlocked = blocks.some(b =>
          b.date === dateStr && b.time === timeStr
        );

        if(isPast || isBlocked){
          box.className = "slot ng";
          box.innerText = "×";
        }else{
          box.className = "slot ok";
          box.innerText = "◎";

          box.onclick = () => {
            const q = new URLSearchParams({
              date: dateStr,
              time: timeStr
            });
            location.href = "form-step1.html?" + q.toString();
          };
        }

        td.appendChild(box);
        tr.appendChild(td);

      });

      table.appendChild(tr);
    }
  }

  document.getElementById("range").innerText =
    `${formatDate(days[0])}〜${formatDate(days[6])}`;
}

// ボタン
document.getElementById("prev").onclick = ()=>{
  currentStart = addDays(currentStart, -7);
  render();
};

document.getElementById("next").onclick = ()=>{
  currentStart = addDays(currentStart, 7);
  render();
};

document.getElementById("mode").onclick = ()=>{
  fullMode = !fullMode;
  render();
};

render();
