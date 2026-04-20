const p=new URLSearchParams(location.search);
const date=p.get("date");

document.getElementById("date").innerText=date;

const list=document.getElementById("times");

for(let h=6;h<=21;h++){
for(let m of [0,30]){

let time=("0"+h).slice(-2)+":"+(m==0?"00":"30");

let el=document.createElement("div");
el.className="time";

let status=Math.random()>0.2;

el.innerHTML=`
<span>${time}</span>
<span class="${status?'ok':'ng'}">${status?'◎':'×'}</span>
`;

if(status){
el.onclick=()=>{
location.href="form-step1.html?date="+date+"&time="+time;
};
}

list.appendChild(el);
}
}
