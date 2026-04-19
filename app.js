const CONFIG = {
  logoUrl: "logo.png"
};

let weekOffset = 0;
let fullMode = false;

function getTodayStart(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function formatYMD(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function jpLabel(d){
  const w = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}/${d.getDate()}(${w[d.getDay()]})`;
}

function buildDates(){
  const today = getTodayStart();
  const start = new Date(today);
  start.setDate(today.getDate() + (weekOffset * 7));
  const dates = [];
  for(let i=0;i<7;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    dates.push(d);
  }
  return dates;
}

function buildTimes(){
  const times = [];
  if(fullMode){
    for(let h=0; h<24; h++){
      times.push(`${String(h).padStart(2,'0')}:00`);
      times.push(`${String(h).padStart(2,'0')}:30`);
    }
  }else{
    for(let h=6; h<=21; h++){
      times.push(`${String(h).padStart(2,'0')}:00`);
      if(h < 21) times.push(`${String(h).padStart(2,'0')}:30`);
    }
  }
  return times;
}

function isPast(dateObj, time){
  const [hh, mm] = time.split(':').map(Number);
  const slot = new Date(dateObj);
  slot.setHours(hh, mm, 0, 0);
  return slot.getTime() < Date.now();
}

function render(){
  const dates = buildDates();
  const times = buildTimes();

  document.getElementById('logo').src = CONFIG.logoUrl;

  document.getElementById('weekLabel').textContent =
    `${dates[0].getMonth()+1}/${dates[0].getDate()}〜${dates[6].getMonth()+1}/${dates[6].getDate()}`;

  document.getElementById('toggleModeBtn').textContent = fullMode ? '通常時間' : '深夜早朝';

  const head = document.getElementById('calendarHead');
  head.innerHTML = `
    <tr>
      <th class="time-head"></th>
      ${dates.map(d => `<th class="date-head">${jpLabel(d)}</th>`).join('')}
    </tr>
  `;

  const body = document.getElementById('calendarBody');
  body.innerHTML = times.map(t => `
    <tr>
      <td class="time-cell">${t}</td>
      ${dates.map(d => {
        const blocked = isPast(d, t);
        return `<td><button type="button" class="slot-btn ${blocked ? 'slot-ng' : 'slot-ok'}">${blocked ? '×' : '○'}</button></td>`;
      }).join('')}
    </tr>
  `).join('');
}

document.getElementById('prevBtn').addEventListener('click', ()=>{
  if(weekOffset > 0){
    weekOffset -= 1;
    render();
  }
});

document.getElementById('nextBtn').addEventListener('click', ()=>{
  weekOffset += 1;
  render();
});

document.getElementById('toggleModeBtn').addEventListener('click', ()=>{
  fullMode = !fullMode;
  render();
});

render();
