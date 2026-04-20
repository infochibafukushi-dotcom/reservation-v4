const API="https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

let start=new Date();
let full=false;

function fmt(d){return d.toISOString().split("T")[0];}
function add(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x;}

async function render(){
  const table=document.getElementById("calendar");
  table.innerHTML="";

  const res=await fetch(API+"/api/getInitData");
  const data=await res.json();
  const blocks=data.blocks||[];

  let today=new Date();today.setHours(0,0,0,0);

  let days=[];
  for(let i=0;i<14;i++){ // 最大14日持つ
    let d=add(start,i);
    if(d>=today){
      days.push(d);
      if(days.length==7) break;
    }
  }

  const head=document.createElement("tr");
  head.appendChild(document.createElement("td"));

  days.forEach(d=>{
    let td=document.createElement("td");
    td.innerText=(d.getMonth()+1)+"/"+d.getDate();
    if(d.getDay()==0) td.className="sun";
    if(d.getDay()==6) td.className="sat";
    if(fmt(d)==fmt(new Date())) td.className+=" today";
    head.appendChild(td);
  });

  table.appendChild(head);

  let st=full?0:6;
  let ed=full?23:21;

  for(let h=st;h<=ed;h++){
    for(let m of [0,30]){
      let tr=document.createElement("tr");
      let t=document.createElement("td");
      t.innerText=("0"+h).slice(-2)+":"+(m==0?"00":"30");
      tr.appendChild(t);

      days.forEach(d=>{
        let td=document.createElement("td");
        let box=document.createElement("div");

        let ds=fmt(d);
        let ts=("0"+h).slice(-2)+":"+(m==0?"00":"30");

        let past=new Date(ds+"T"+ts)<new Date();
        let block=blocks.some(b=>b.date==ds&&b.time==ts);

        if(past||block){
          box.className="slot ng";
          box.innerText="×";
        }else{
          box.className="slot ok";
          box.innerText="◎";
          box.onclick=()=>{
            location.href="form-step1.html?date="+ds+"&time="+ts;
          };
        }

        td.appendChild(box);
        tr.appendChild(td);
      });

      table.appendChild(tr);
    }
  }

  document.getElementById("range").innerText=fmt(days[0])+"〜"+fmt(days[days.length-1]);
}

document.getElementById("prev").onclick=()=>{start=add(start,-7);render();}
document.getElementById("next").onclick=()=>{start=add(start,7);render();}
document.getElementById("mode").onclick=()=>{full=!full;render();}

render();
