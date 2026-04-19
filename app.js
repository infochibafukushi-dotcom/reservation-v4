
let startDate = new Date();
let fullMode = false;

function render(){
  let cal = document.getElementById("calendar");
  cal.innerHTML = "";

  let table = document.createElement("table");
  let header = document.createElement("tr");

  header.appendChild(document.createElement("th"));

  for(let i=0;i<7;i++){
    let d = new Date(startDate);
    d.setDate(d.getDate()+i);
    let th = document.createElement("th");
    th.innerText = (d.getMonth()+1)+"/"+d.getDate();
    header.appendChild(th);
  }
  table.appendChild(header);

  let startHour = fullMode ? 0 : 6;
  let endHour = fullMode ? 24 : 21;

  for(let h=startHour;h<endHour;h++){
    for(let m of [0,30]){
      let tr = document.createElement("tr");

      let time = document.createElement("td");
      time.innerText = (h+"").padStart(2,"0")+":"+(m==0?"00":"30");
      tr.appendChild(time);

      for(let d=0;d<7;d++){
        let td = document.createElement("td");
        td.className = "ok";

        let now = new Date();
        let slot = new Date(startDate);
        slot.setDate(slot.getDate()+d);
        slot.setHours(h,m,0,0);

        if(slot < now){
          td.className="ng";
          td.innerText="×";
        }else{
          td.innerText="○";
        }

        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
  }

  cal.appendChild(table);
}

function prevWeek(){
  startDate.setDate(startDate.getDate()-7);
  render();
}
function nextWeek(){
  startDate.setDate(startDate.getDate()+7);
  render();
}
function toggleMode(){
  fullMode = !fullMode;
  render();
}

render();
