const API="/api/getInitData";

const p=new URLSearchParams(location.search);
const date=p.get("date");

document.getElementById("date").innerText=date;

fetch(API).then(r=>r.json()).then(data=>{

const blocks=data.blocks||[];
const wrap=document.getElementById("times");

for(let h=6;h<=21;h++){
for(let m of [0,30]){

let time=("0"+h).slice(-2)+":"+(m==0?"00":"30");

let isBlock=blocks.some(b=>b.date==date && b.time==time);

let div=document.createElement("div");
div.className="time";

div.innerHTML=`
<span>${time}</span>
<span class="${isBlock?'ng':'ok'}">${isBlock?'×':'◎'}</span>
`;

if(!isBlock){
div.onclick=()=>{
location.href="form-step1.html?date="+date+"&time="+time;
};
}

wrap.appendChild(div);

}
}

});
