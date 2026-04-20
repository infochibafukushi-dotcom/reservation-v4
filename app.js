const API="/api/getInitData";

const el=document.getElementById("dates");

let today=new Date();

for(let i=0;i<14;i++){
let d=new Date();
d.setDate(today.getDate()+i);

let div=document.createElement("div");
div.className="date";
div.innerText=(d.getMonth()+1)+"/"+d.getDate();

div.onclick=()=>{
location.href="time.html?date="+d.toISOString().split("T")[0];
};

el.appendChild(div);
}
