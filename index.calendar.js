const calendarState={page:0,fullDay:false,blocks:[],blockSet:new Set()};
const DAYS=7,MAX_DAYS=31,NORMAL_START=6,NORMAL_END=21,FULL_START=0,FULL_END=23;
function pad(v){return String(v).padStart(2,"0")}
function formatDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function jaDay(d){return ["日","月","火","水","木","金","土"][d.getDay()]}
function slotKey(date,time){return `${date}_${time}`}
function todayBase(){const d=new Date();d.setHours(0,0,0,0);return d}
function datesForPage(){const start=addDays(todayBase(),calendarState.page*DAYS);return Array.from({length:DAYS},(_,i)=>addDays(start,i))}
function times(){const out=[];const s=calendarState.fullDay?FULL_START:NORMAL_START;const e=calendarState.fullDay?FULL_END:NORMAL_END;for(let h=s;h<=e;h++){for(let m=0;m<60;m+=30){if(!calendarState.fullDay&&h===e&&m>0)continue;out.push(`${pad(h)}:${pad(m)}`)}}return out}
function isPast(date,time){return new Date(`${date}T${time}:00`)<new Date()}
function isBlocked(date,time){return calendarState.blockSet.has(slotKey(date,time))||isPast(date,time)}
function setLoading(show){document.getElementById("loading")?.classList.toggle("hidden",!show)}
function renderCalendar(){const grid=document.getElementById("calendarGrid");const range=document.getElementById("dateRange");const ds=datesForPage();const ts=times();grid.innerHTML="";range.textContent=`${formatDate(ds[0]).replaceAll("-","/")} - ${formatDate(ds[6]).slice(5).replace("-","/")}`;
const corner=document.createElement("div");corner.className="time-label sticky-corner";corner.textContent="時間";grid.appendChild(corner);
ds.forEach(d=>{const el=document.createElement("div");el.className=`day-head ${[0,6].includes(d.getDay())?"weekend":""}`;el.innerHTML=`<span>${d.getMonth()+1}/${d.getDate()}</span><small>${jaDay(d)}</small>`;grid.appendChild(el)});
ts.forEach(time=>{const t=document.createElement("div");t.className="time-label";t.textContent=time;grid.appendChild(t);ds.forEach(d=>{const date=formatDate(d);const blocked=isBlocked(date,time);const b=document.createElement("button");b.type="button";b.className=`slot-cell ${blocked?"ng":""}`;b.textContent=blocked?"×":"◎";b.disabled=blocked;if(!blocked)b.addEventListener("click",()=>openBookingForm(date,time));grid.appendChild(b)})});
document.getElementById("prevWeek").disabled=calendarState.page<=0;document.getElementById("nextWeek").disabled=(calendarState.page+1)*DAYS>=MAX_DAYS}
async function loadCalendarData(){setLoading(true);try{const data=await apiGet(ENDPOINTS.getBlocks);calendarState.blocks=data.blocks||[];calendarState.blockSet=new Set(calendarState.blocks.map(b=>slotKey(b.date,b.time)))}catch(e){toast("空き枠取得に失敗しました")}finally{renderCalendar();setLoading(false)}}
document.addEventListener("DOMContentLoaded",()=>{document.getElementById("prevWeek").addEventListener("click",()=>{calendarState.page=Math.max(0,calendarState.page-1);loadCalendarData()});document.getElementById("nextWeek").addEventListener("click",()=>{calendarState.page+=1;loadCalendarData()});document.getElementById("modeToggle").addEventListener("click",()=>{calendarState.fullDay=!calendarState.fullDay;document.getElementById("modeToggle").textContent=calendarState.fullDay?"通常時間表示":"他時間予約";renderCalendar()});loadCalendarData()});
