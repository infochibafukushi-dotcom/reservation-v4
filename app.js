function render(){
  let table = document.getElementById("calendar");
  let tr = document.createElement("tr");
  for(let i=0;i<7;i++){
    let td = document.createElement("td");
    let btn = document.createElement("button");
    btn.innerText = "◎";
    btn.onclick = ()=> location.href="form-step1.html";
    td.appendChild(btn);
    tr.appendChild(td);
  }
  table.appendChild(tr);
}
render();
