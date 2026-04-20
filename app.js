let week=0;
let full=false;
let selectedDate="",selectedTime="";
let menuData={vehicle:[],assist:[],stairs:[],round:[]};

function render(){
  let table=document.getElementById("calendar");
  table.innerHTML="";
  let tr=document.createElement("tr");
  for(let i=0;i<7;i++){
    let td=document.createElement("td");
    let btn=document.createElement("div");
    btn.className="slot ok";
    btn.innerText="◎";
    btn.onclick=()=>openForm("日付","時間");
    td.appendChild(btn);
    tr.appendChild(td);
  }
  table.appendChild(tr);
}

function openForm(date,time){
  document.getElementById("calendarArea").style.display="none";
  document.getElementById("formArea").style.display="block";
  document.getElementById("selectedDateTime").innerText=date+" "+time;
  loadMenu();
}

function backToCalendar(){
  document.getElementById("calendarArea").style.display="block";
  document.getElementById("formArea").style.display="none";
}

function loadMenu(){
  fetch("/api/menu")
  .then(r=>r.json())
  .then(data=>{
    menuData=data;
    fill("vehicle",data.vehicle);
    fill("assist",data.assist);
    fill("stairs",data.stairs);
    fill("round",data.round);
  });
}

function fill(id,arr){
  let el=document.getElementById(id);
  el.innerHTML="";
  arr.forEach((x,i)=>{
    let o=document.createElement("option");
    o.value=i;
    o.textContent=x.name+"("+x.price+"円)";
    el.appendChild(o);
  });
}

function calc(){
  let t=0;
  if(vehicle.value) t+=menuData.vehicle[vehicle.value].price;
  if(assist.value) t+=menuData.assist[assist.value].price;
  if(stairs.value) t+=menuData.stairs[stairs.value].price;
  if(round.value) t+=menuData.round[round.value].price;
  total.innerText=t;
}

function submitForm(){
  if(!agree.checked) return alert("同意必須");
  if(!name.value||!phone.value||!from.value||!to.value) return alert("未入力あり");
  alert("予約完了（仮）");
}

render();
