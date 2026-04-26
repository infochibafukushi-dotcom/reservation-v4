
const {ENDPOINTS}=window.APP_CONFIG

document.querySelectorAll(".acc-btn").forEach(btn=>{
btn.onclick=()=>{
const content=btn.nextElementSibling
content.classList.toggle("active")
}
})

async function loadBaseFees(){
const res=await fetch(ENDPOINTS.baseFees).then(r=>r.json())
document.getElementById("baseFee").value=res.baseFees.items[0].price
document.getElementById("dispatchFee").value=res.baseFees.items[1].price
document.getElementById("vehicleFee").value=res.baseFees.items[2].price
}

async function saveBaseFees(){
const payload={
base:document.getElementById("baseFee").value,
dispatch:document.getElementById("dispatchFee").value,
vehicle:document.getElementById("vehicleFee").value
}
await fetch(ENDPOINTS.saveBaseFees,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(payload)
})
alert("保存完了")
}

document.getElementById("saveBaseFees").onclick=saveBaseFees

loadBaseFees()
