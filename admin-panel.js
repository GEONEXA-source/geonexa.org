const ADMIN_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/clever-api";
let session=null, users=[];
document.addEventListener("DOMContentLoaded", init);
async function init(){
  const {data,error}=await supabaseClient.auth.getSession();
  if(error||!data.session){location.href="login.html";return;}
  session=data.session;
  document.getElementById("hamb").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("signOut").addEventListener("click",async e=>{e.preventDefault();await supabaseClient.auth.signOut();location.href="login.html";});
  document.getElementById("refresh").onclick=loadUsers;
  document.getElementById("closeDetails").onclick=()=>document.getElementById("detailModal").classList.remove("open");
  document.getElementById("detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")e.target.classList.remove("open")});
  document.getElementById("search").addEventListener("input",render);
  await loadUsers();
}
async function loadUsers(){
  setStatus("Loading user directory…");
  if(window.showLoader)showLoader("Loading user directory…");
  try{const res=await fetch(ADMIN_ENDPOINT,{headers:{"Authorization":`Bearer ${session.access_token}`}});const data=await res.json();if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);users=data.users||[];updateStats();render();setStatus(`Updated ${new Date().toLocaleTimeString()}`);}catch(err){setStatus("Admin data unavailable: "+(err.message||err),true);document.getElementById("usersBody").innerHTML=`<tr><td colspan="7" class="empty">${esc(err.message||err)}</td></tr>`;}finally{if(window.hideLoader)hideLoader();}}
function updateStats(){const active=u=>u.is_subscribed&&(!u.subscription_expires_at||new Date(u.subscription_expires_at)>new Date());document.getElementById("totalUsers").textContent=users.length;document.getElementById("engineers").textContent=users.filter(u=>["engineer","surveyor"].includes(String(u.role||u.user_type||"").toLowerCase())).length;document.getElementById("subscribers").textContent=users.filter(active).length;document.getElementById("admins").textContent=users.filter(u=>String(u.role||"").toLowerCase()==="admin").length;}
function render(){const q=document.getElementById("search").value.trim().toLowerCase();const filtered=users.filter(u=>!q||[u.email,u.full_name,u.phone,u.phone_number,u.province,u.district,u.sector,u.role,u.user_type,u.organization].some(v=>String(v||"").toLowerCase().includes(q)));const body=document.getElementById("usersBody");if(!filtered.length){body.innerHTML=`<tr><td colspan="7" class="empty">No users match your search.</td></tr>`;return;}body.innerHTML=filtered.map(u=>{const role=String(u.role||u.user_type||"user");const active=u.is_subscribed&&(!u.subscription_expires_at||new Date(u.subscription_expires_at)>new Date());return `<tr><td><div class="name">${esc(u.full_name||"Unnamed user")}</div><div class="sub">${esc(u.id||"")}</div></td><td><div>${esc(u.email||"—")}</div><div class="sub">${esc(u.phone||u.phone_number||"")}</div></td><td><span class="pill role">${esc(role)}</span></td><td>${esc([u.province,u.district,u.sector].filter(Boolean).join(" · ")||u.country||"—")}</td><td><span class="pill ${active?"active":"free"}">${active?"Active":"Free"}</span>${active&&u.subscription_expires_at?`<div class="sub">Until ${new Date(u.subscription_expires_at).toLocaleDateString()}</div>`:""}</td><td>${u.created_at?new Date(u.created_at).toLocaleDateString():"—"}</td><td>${u.id===session.user.id?`<span class="sub">Current admin</span>`:`<button class="btn" onclick="showDetails('${esc(u.id)}')">Details</button> <button class="btn danger delete-user" data-id="${esc(u.id)}" data-name="${esc(u.full_name||u.email||"user")}">Delete</button>`}</td></tr>`}).join("");body.querySelectorAll(".delete-user").forEach(b=>b.onclick=()=>deleteUser(b.dataset.id,b.dataset.name));}
async function deleteUser(id,name){if(!confirm(`Delete ${name}? This permanently removes the account and cannot be undone.`))return;setStatus("Deleting account…");if(window.showLoader)showLoader("Deleting account…");try{const res=await fetch(ADMIN_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({action:"delete",user_id:id})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Delete failed");users=users.filter(u=>u.id!==id);updateStats();render();setStatus("User deleted successfully.");}catch(err){setStatus("Delete failed: "+(err.message||err),true);}finally{if(window.hideLoader)hideLoader();}}
function setStatus(s,error){const el=document.getElementById("status");el.textContent=s;el.style.color=error?"#ff8d8d":"var(--muted)";}
function esc(s){const d=document.createElement("div");d.textContent=String(s??"");return d.innerHTML;}

function showDetails(id){
 const u=users.find(x=>x.id===id); if(!u)return;
 document.getElementById("detailTitle").textContent=u.full_name||u.email||"User details";
 const skip=new Set(["payments","id"]);
 document.getElementById("detailGrid").innerHTML=Object.entries(u).filter(([k])=>!skip.has(k)).map(([k,v])=>`<div class="detail"><small>${esc(k.replaceAll("_"," "))}</small>${esc(typeof v==="object"?JSON.stringify(v):String(v??"—"))}</div>`).join("");
 const pays=u.payments||[];
 document.getElementById("detailPayments").innerHTML=pays.length?pays.map(p=>`<div class="payment"><span>${esc(p.network||"Mobile Money")} · ${esc(p.status||"")}<br><small>${p.created_at?new Date(p.created_at).toLocaleString():""}</small></span><b>${p.amount!=null?Number(p.amount).toLocaleString()+" "+esc(p.currency||"RWF"):"—"}</b></div>`).join(""):"No payment records.";
 document.getElementById("detailModal").classList.add("open");
}
