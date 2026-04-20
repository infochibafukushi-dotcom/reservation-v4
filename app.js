// ★API失敗でも描画するように修正

const API="https://YOUR-WORKER-URL/api/getInitData";

function f(d){return d.toISOString().split("T")[0]}
function add(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}

async function getBlocks(){
try{
let r=await fetch(API);
let j=await r.json();
return j.blocks||[];
}catch(e){
return []; // ←失敗でも空で描画
}
}

async function render(){

let t=document.getElementById("calendar");
t.innerHTML="";

let blocks=await getBlocks();

let start=new Date();

let days=[];
for(let i=0;i<7;i++){days.push(add(start,i));}

let head=document.createElement("tr");
head.appendChild(document.createElement("td"));

days.forEach(d=>{
let td=document.createElement("td");
td.innerText=(d.getMonth()+1)+"/"+d.getDate();
head.appendChild(td);
});
t.appendChild(head);

for(let h=6;h<=12;h++){
let tr=document.createElement("tr");

let time=document.createElement("td");
let ts=("0"+h).slice(-2)+":00";
time.innerText=ts;
tr.appendChild(time);

days.forEach(d=>{
let td=document.createElement("td");
let box=document.createElement("div");

let ds=f(d);
let block=blocks.some(b=>b.date==ds && b.time==ts);

if(block){
box.className="slot ng";
box.innerText="×";
}else{
box.className="slot ok";
box.innerText="◎";
}

td.appendChild(box);
tr.appendChild(td);
});

t.appendChild(tr);
}

}

render();
