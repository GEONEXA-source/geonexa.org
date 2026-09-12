const ENGINEER_AI_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/ai-assistant";
let session = null, profile = null, subscribed = false, selectedLocation = null, latestAnalysis = null;

document.addEventListener("DOMContentLoaded", init);
async function init(){
  if(window.showLoader)showLoader("Loading your workspace…");
  const {data,error}=await supabaseClient.auth.getSession();
  if(error||!data.session){location.href="login.html";return;}
  session=data.session;
  document.getElementById("hamb").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("signOut").addEventListener("click",async(e)=>{e.preventDefault();await supabaseClient.auth.signOut();location.href="login.html";});
  const p=await supabaseClient.from("profiles").select("full_name,role,user_type,is_subscribed,subscription_expires_at").eq("id",session.user.id).single();
  if(p.error){if(window.hideLoader)hideLoader();showLocked("Profile could not be loaded. Check the profiles table and RLS policy.");return;}
  profile=p.data;
  const role=(profile.role||profile.user_type||"").toLowerCase();
  if(!["engineer","surveyor"].includes(role)){location.href=role==="admin"?"admin-panel.html":"dashboard.html";return;}
  subscribed=!!(profile.is_subscribed&&(!profile.subscription_expires_at||new Date(profile.subscription_expires_at)>new Date()));
  document.getElementById("planBadge").textContent=subscribed?"✓ Full Engineer Access":"Free plan — subscription required";
  if(window.hideLoader)hideLoader();
  if(!subscribed){showLocked();return;}
  document.getElementById("workspace").style.display="grid";
  restoreLocation();
  document.getElementById("chatForm").addEventListener("submit",sendMessage);
  document.getElementById("reportBtn").addEventListener("click",generateReport);
}
function showLocked(msg){document.getElementById("locked").style.display="block";if(msg)document.getElementById("lockStatus").textContent=msg;}
function restoreLocation(){try{const raw=sessionStorage.getItem("geonexa_pending_location");if(!raw)return;sessionStorage.removeItem("geonexa_pending_location");selectedLocation=JSON.parse(raw);renderLocation();}catch(_) {}}
function renderLocation(){const l=selectedLocation;if(!l)return;document.getElementById("locationBox").innerHTML=`<b>${esc(l.label||"Selected location")}</b><br>Lat ${Number(l.lat).toFixed(5)} · Lng ${Number(l.lng).toFixed(5)}${l.parcel?.upi?`<br>UPI: <b>${esc(l.parcel.upi)}</b>`:""}`;}
async function sendMessage(e){e.preventDefault();const input=document.getElementById("chatInput"),msg=input.value.trim();if(!msg)return;append("user",msg);input.value="";const btn=document.getElementById("sendBtn");btn.disabled=true;const thinking=append("assistant","Thinking…");
 if(window.showLoader)showLoader("Asking the AI Assistant…");
 try{const res=await fetch(ENGINEER_AI_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({message:msg,context:{user_type:profile.user_type,role:profile.role,workspace:"engineer"},location:selectedLocation})});const data=await res.json();if(!res.ok)throw new Error(data.error||`AI request failed (${res.status})`);thinking.textContent=data.reply||"No response received.";latestAnalysis={message:msg,reply:data.reply||"No response received.",location:selectedLocation,timestamp:new Date().toISOString()};sessionStorage.setItem("geonexa_latest_ai_analysis",JSON.stringify(latestAnalysis));sessionStorage.setItem("geonexa_report_payload",JSON.stringify(latestAnalysis));document.getElementById("reportBtn").disabled=false;document.getElementById("reportStatus").textContent="Full report ready — you can generate and download the PDF.";}catch(err){thinking.textContent="AI Assistant error: "+(err.message||err);}finally{btn.disabled=false;if(window.hideLoader)hideLoader();}}
function append(role,text){const row=document.createElement("div");row.className=`msg ${role}`;row.textContent=text;document.getElementById("chatLog").appendChild(row);document.getElementById("chatLog").scrollTop=999999;return row;}
function generateReport(){if(!latestAnalysis?.reply){const raw=sessionStorage.getItem("geonexa_latest_ai_analysis");if(raw)try{latestAnalysis=JSON.parse(raw)}catch(_){} }if(latestAnalysis?.reply){sessionStorage.setItem("geonexa_report_payload",JSON.stringify(latestAnalysis));location.href="ai-report.html";}}
function esc(s){const d=document.createElement("div");d.textContent=String(s??"");return d.innerHTML;}
