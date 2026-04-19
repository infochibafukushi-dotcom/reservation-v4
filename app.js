const cal = document.getElementById('cal');
const rangeEl = document.getElementById('range');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const nightBtn = document.getElementById('night');

let start = new Date(); start.setHours(0,0,0,0);
let show24 = false;

function fmt(d){
  const m = d.getMonth()+1, day = d.getDate();
  return m + '/' + day;
}
function ymd(d){
  const y=d.getFullYear(), m=('0'+(d.getMonth()+1)).slice(-2), da=('0'+d.getDate()).slice(-2);
  return y+'-'+m+'-'+da;
}

function render(){
  cal.innerHTML = '';
  const header = document.createElement('tr');
  const empty = document.createElement('th'); empty.className='time'; empty.innerText='';
  header.appendChild(empty);

  const days=[];
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    days.push(d);
    const th = document.createElement('th');
    th.innerText = fmt(d);
    header.appendChild(th);
  }
  cal.appendChild(header);

  const begin = show24 ? 0 : 6;
  const end = show24 ? 23 : 21;

  const now = new Date();

  for(let h=begin; h<=end; h++){
    for(let m of [0,30]){
      const tr = document.createElement('tr');
      const t = document.createElement('td');
      t.className='time';
      t.innerText = ('0'+h).slice(-2)+':'+(m===0?'00':'30');
      tr.appendChild(t);

      days.forEach(d=>{
        const td = document.createElement('td');
        const box = document.createElement('div');
        box.className='slot ok';
        const span = document.createElement('span'); span.innerText='◎';
        box.appendChild(span);

        const slotTime = new Date(d);
        slotTime.setHours(h,m,0,0);

        if(slotTime < now){
          box.classList.remove('ok'); box.classList.add('ng');
          span.innerText='×';
          box.style.pointerEvents='none';
        }else{
          box.onclick = ()=>{
            const q = new URLSearchParams({
              date: ymd(d),
              time: ('0'+h).slice(-2)+':'+(m===0?'00':'30')
            });
            location.href = 'form-step1.html?' + q.toString();
          };
        }

        td.appendChild(box);
        tr.appendChild(td);
      });

      cal.appendChild(tr);
    }
  }

  const endDay = new Date(start); endDay.setDate(start.getDate()+6);
  rangeEl.innerText = ymd(start) + '〜' + ymd(endDay);
}

prevBtn.onclick = ()=>{ start.setDate(start.getDate()-7); render(); };
nextBtn.onclick = ()=>{ start.setDate(start.getDate()+7); render(); };
nightBtn.onclick = ()=>{ show24 = !show24; render(); };

render();
