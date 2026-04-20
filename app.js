const API="https://YOUR-WORKER-URL/api/getInitData";

let start=new Date();

function f(d){return d.toISOString().split("T")[0]}
function add(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}

async function render(){
let t=document.getElementById("calendar");t.innerHTML="";
let r=await fetch(API);let j=await r.json();let blocks=j.blocks||[];

let days=[];
for(let i=0;i<7;i++){days.push(add(start,i));}

let head=document.createElement("tr");head.appendChild(document.createElement("td"));
days.forEach(d=>{
let td=document.createElement("td");
td.innerText=(d.getMonth()+1)+"/"+d.getDate();
head.appendChild(td);
});
t.appendChild(head);

for(let h=6;h<=21;h++){
for(let m of [0,30]){
let tr=document.createElement("tr");
let time=document.createElement("td");
let ts=("0"+h).slice(-2)+":"+(m?30:0).toString().padStart(2,"0");
time.innerText=ts;
tr.appendChild(time);

days.forEach(d=>{
let td=document.createElement("td");
let box=document.createElement("div");
let ds=f(d);

let block=blocks.some(b=>b.date==ds&&b.time==ts);

if(block){
box.className="slot ng";box.innerText="×";
}else{
box.className="slot ok";box.innerText="◎";
box.onclick=()=>location.href="form.html?date="+ds+"&time="+ts;
}

td.appendChild(box);tr.appendChild(td);
});
t.appendChild(tr);
}
}
}

document.getElementById("prev").onclick=()=>{start=add(start,-7);render()}
document.getElementById("next").onclick=()=>{start=add(start,7);render()}

render();
