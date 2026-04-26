
const grid=document.getElementById("calendarGrid")

function pad(n){return String(n).padStart(2,"0")}

function render(){
let html=""

html+="<div class='time-label'>時間</div>"
for(let d=0;d<7;d++){
html+="<div class='date-header'>"+(d+1)+"日</div>"
}

for(let h=6;h<=21;h++){
let time=pad(h)+":00"
html+="<div class='time-label'>"+time+"</div>"

for(let d=0;d<7;d++){
html+="<div class='slot-cell'>◎</div>"
}
}

grid.innerHTML=html
}

render()
