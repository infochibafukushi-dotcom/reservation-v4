const API="/api/getInitData";
let start=new Date();

function f(d){return d.toISOString().split("T")[0]}
function add(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}

async function render(){
let t=document.getElementById("calendar");t.innerHTML="";
let r=await fetch(API);let j=await r.json();let blocks=j.blocks||[];

let today=new Date();today.setHours(0,0,0,0)

let days=[];
for(let i=0;i<14;i++){
let d=add(start,i);
if(d>=today){days.push(d)}
if(days.length==7)break;
}

let head=document.createElement("tr");head.appendChild(document.createElement("td"));
days.forEach(d=>{
let td=document.createElement("td");
td.innerText=(d.getMonth()+1)+"/"+d.getDate();
if(d.getDay()==0)td.className="sun";
if(d.getDay()==6)td.className="sat";
if(f(d)==f(new Date()))td.className+=" today";
head.appendChild(td);
});
t.appendChild(head);

for(let h=6;h<=21;h++){
for(let m of [0,30]){
let tr=document.createElement("tr");
let time=document.createElement("td");
time.innerText=("0"+h).slice(-2)+":"+(m?30:0).toString().padStart(2,"0");
tr.appendChild(time);

days.forEach(d=>{
let td=document.createElement("td");
let box=document.createElement("div");
let ds=f(d);
let ts=("0"+h).slice(-2)+":"+(m?30:0).toString().padStart(2,"0");

let past=new Date(ds+"T"+ts)<new Date();
let block=blocks.some(b=>b.date==ds&&b.time==ts);

if(past||block){
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

document.getElementById("prev").onclick=()=>{start=add(start,-7);render()}
document.getElementById("next").onclick=()=>{start=add(start,7);render()}

render();
