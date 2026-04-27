const APP=window.APP_CONFIG;const API_BASE=APP.API_BASE.replace(/\/$/,"");const ENDPOINTS=APP.ENDPOINTS;
function apiUrl(path){return API_BASE+path}
function toast(message,ms=2200){const el=document.getElementById("toast");if(!el){alert(message);return}el.textContent=message;el.style.display="block";clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.style.display="none",ms)}
async function fetchWithRetry(url,options={},retries=2){let last;for(let i=0;i<=retries;i++){try{return await fetch(url,options)}catch(e){last=e;await new Promise(r=>setTimeout(r,250*(i+1)))}}throw last}
async function apiGet(path){const res=await fetchWithRetry(apiUrl(path),{cache:"no-store"});const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!res.ok)throw new Error(data?.message||text||`HTTP ${res.status}`);return data}
async function apiPost(path,payload){const res=await fetchWithRetry(apiUrl(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload||{})});const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!res.ok)throw new Error(data?.message||text||`HTTP ${res.status}`);return data}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]))}
function clearPublicCache(){try{localStorage.removeItem("reservation_bootstrap");localStorage.removeItem("reservation_range_cache")}catch{}}
