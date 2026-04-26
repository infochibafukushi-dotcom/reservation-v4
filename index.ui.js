document.addEventListener("DOMContentLoaded",()=>{
  let logoTap=0,timer=null;
  function openAdmin(){location.href="admin.html"}
  document.getElementById("openAdminBtn")?.addEventListener("click",openAdmin);
  document.getElementById("logoAdminTrigger")?.addEventListener("click",()=>{
    logoTap+=1;
    clearTimeout(timer);
    timer=setTimeout(()=>logoTap=0,4000);
    if(logoTap>=5){logoTap=0;openAdmin()}
  });
});
