const APP=window.APP_CONFIG;const API_BASE=APP.API_BASE.replace(/\/$/,"");const ENDPOINTS=APP.ENDPOINTS;
function apiUrl(path){return API_BASE+path}
function toast(message,ms=2200){const el=document.getElementById("toast");if(!el){alert(message);return}el.textContent=message;el.style.display="block";clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.style.display="none",ms)}
async function fetchWithRetry(url,options={},retries=2){let last;for(let i=0;i<=retries;i++){try{return await fetch(url,options)}catch(e){last=e;await new Promise(r=>setTimeout(r,250*(i+1)))}}throw last}
function getAdminToken(){try{return String(sessionStorage.getItem("admin_token")||window.__adminToken||"").trim()}catch{return String(window.__adminToken||"").trim()}}
function setAdminToken(token){const value=String(token||"").trim();window.__adminToken=value;try{if(value)sessionStorage.setItem("admin_token",value);else sessionStorage.removeItem("admin_token")}catch{}}
function clearAdminSession(){window.__adminToken="";try{sessionStorage.removeItem("admin_auth");sessionStorage.removeItem("admin_token")}catch{}}
function authHeaders(extra={}){const headers={...extra};const token=getAdminToken();if(token)headers.Authorization=`Bearer ${token}`;return headers}
function authErrorMessage(status,data,text){if(status===401||status===403||String(data?.message||text||"").toLowerCase().includes("unauthorized"))return"認証が切れています。再ログインしてください。";return data?.message||text||`HTTP ${status}`}
async function parseApiResponse(res){const text=await res.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!res.ok){if(res.status===401||res.status===403)clearAdminSession();throw new Error(authErrorMessage(res.status,data,text))}return data}
async function apiGet(path){const res=await fetchWithRetry(apiUrl(path),{cache:"no-store",headers:authHeaders()});return parseApiResponse(res)}
async function apiPost(path,payload){const res=await fetchWithRetry(apiUrl(path),{method:"POST",headers:authHeaders({"Content-Type":"application/json"}),body:JSON.stringify(payload||{})});return parseApiResponse(res)}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]))}
function clearPublicCache(){try{localStorage.removeItem("reservation_bootstrap");localStorage.removeItem("reservation_range_cache")}catch{}}
