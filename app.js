
let startDate = new Date();
let fullMode = false;

function render(){
  let cal = document.getElementById("calendar");
  cal.innerHTML="";

  let today = new Date();
  let endDate = new Date();
  endDate.setMonth(endDate.getMonth()+1);

  let table = document.createElement("table");
  let header = document.createElement("tr");
  header.appendChild(document.createElement("th"));

  let days = [];
  let d = new Date(today);

  while(d <= endDate){
    days.push(new Date(d));
    d.setDate(d.getDate()+1);
  }

  days.forEach(day=>{
    let th = document.createElement("th");
    th.innerText = (day.getMonth()+1)+"/"+day.getDate();
    header.appendChild(th);
  });

  table.appendChild(header);

  let startH = fullMode ? 0 : 6;
  let endH = fullMode ? 24 : 21;

  for(let h=startH;h<endH;h++){
    for(let m of [0,30]){
      let tr = document.createElement("tr");

      let t = document.createElement("td");
      t.innerText = String(h).padStart(2,"0")+":"+(m==0?"00":"30");
      tr.appendChild(t);

      days.forEach(day=>{
        let td = document.createElement("td");

        let slot = new Date(day);
        slot.setHours(h,m,0,0);

        if(slot < today){
          td.className="ng";
          td.innerText="×";
        }else{
          td.className="ok";
          td.innerText="○";
        }

        tr.appendChild(td);
      });

      table.appendChild(tr);
    }
  }

  cal.appendChild(table);
}

function toggleMode(){
  fullMode = !fullMode;
  render();
}

function prevWeek(){}
function nextWeek(){}

render();
