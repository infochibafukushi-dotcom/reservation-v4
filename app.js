const container=document.getElementById("dates");

let today=new Date();

for(let i=0;i<14;i++){
let d=new Date();
d.setDate(today.getDate()+i);

let el=document.createElement("div");
el.className="date";
el.innerText=(d.getMonth()+1)+"/"+d.getDate();

el.onclick=()=>{
location.href="time.html?date="+d.toISOString().split("T")[0];
};

container.appendChild(el);
}
