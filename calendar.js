
const cal=document.getElementById("calendar")

function pad(n){return String(n).padStart(2,"0")}

function render(){
let html='<div class="grid">'

html+='<div class="time">時間</div>'
for(let d=0;d<7;d++){
html+='<div class="day">'+(d+1)+'日</div>'
}

for(let h=6;h<=21;h++){
html+='<div class="time">'+pad(h)+':00</div>'
for(let d=0;d<7;d++){
html+='<div class="cell">◎</div>'
}
}

html+='</div>'
cal.innerHTML=html
}

render()
