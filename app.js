let week = 0;
let full = false;

function getDates(){
  let base = new Date();
  base.setHours(0,0,0,0);
  base.setDate(base.getDate()+week*7);

  let arr=[];
  for(let i=0;i<7;i++){
    let d=new Date(base);
    d.setDate(base.getDate()+i);
    arr.push(d);
  }
  return arr;
}

function getTimes(){
  let arr=[];
  if(full){
    for(let h=0;h<24;h++){
      arr.push(h+":00");
      arr.push(h+":30");
    }
  }else{
    for(let h=6;h<=21;h++){
      arr.push(h+":00");
      if(h<21) arr.push(h+":30");
    }
  }
  return arr;
}

function isPast(d,t){
  let [h,m]=t.split(":").map(Number);
  let dt=new Date(d);
  dt.setHours(h,m);
  return dt < new Date();
}

function render(){
  let dates=getDates();
  let times=getTimes();
  let table=document.getElementById("calendar");

  document.getElementById("range").innerText=
    dates[0].toLocaleDateString()+"〜"+dates[6].toLocaleDateString();

  table.innerHTML="";

  let tr=document.createElement("tr");
  tr.innerHTML="<th></th>";
  dates.forEach(d=>{
    let th=document.createElement("th");
    th.innerText=(d.getMonth()+1)+"/"+d.getDate();
    if(d.getDay()==0) th.classList.add("sun");
    if(d.getDay()==6) th.classList.add("sat");
    tr.appendChild(th);
  });
  table.appendChild(tr);

  times.forEach(t=>{
    let tr=document.createElement("tr");
    let timeTd=document.createElement("td");
    timeTd.innerText=t;
    tr.appendChild(timeTd);

    dates.forEach(d=>{
      let td=document.createElement("td");
      if(d.getDay()==0) td.classList.add("sun");
      if(d.getDay()==6) td.classList.add("sat");

      let btn=document.createElement("button");
      btn.classList.add("slot");

      btn.classList.add("loading-slot");
      btn.innerText="◎";

      setTimeout(()=>{
        let blocked=isPast(d,t);
        btn.classList.remove("loading-slot");
        if(blocked){
          btn.classList.add("ng-slot");
          btn.innerText="×";
        }else{
          btn.classList.add("ok-slot");
          btn.innerText="◎";
        }
      },300);

      td.appendChild(btn);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

document.getElementById("prev").onclick=()=>{if(week>0){week--;render();}}
document.getElementById("next").onclick=()=>{week++;render();}
document.getElementById("mode").onclick=()=>{full=!full;render();}

render();
