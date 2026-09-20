const ENGINEER_AI_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/ai-assistant";
let session = null, profile = null, subscribed = false, selectedLocation = null, latestAnalysis = null;
let planLevel = null; // 'monthly' | 'annual' | 'institution' — null means no AI access

// Different subscription tiers get a different depth of AI analysis.
// This is enforced by prepending an instruction to what's sent to the
// AI, so it works regardless of the Edge Function's own internals.
const PLAN_CONFIG = {
  monthly:     { label: "Monthly", maxAttempts: 3, promptPrefix: "Give a concise, direct answer (2-4 sentences) to the following question." },
  annual:      { label: "Annual",  maxAttempts: 3, promptPrefix: "Give a thorough, detailed analysis of the following question. Cover: a direct answer, relevant zoning/legal considerations, potential risks, and a clear recommendation. Use short labeled sections." },
  institution: { label: "Institution", maxAttempts: 8, promptPrefix: "Give a thorough, professional-grade analysis of the following question, suitable for an institutional user. Cover: a direct answer, relevant zoning/legal considerations, potential risks with a Low/Medium/High rating, and a clear recommendation. Use short labeled sections." },
};

document.addEventListener("DOMContentLoaded", init);
async function init(){
 try{
  if(window.showLoader)showLoader("Loading your workspace…");
  const {data,error}=await supabaseClient.auth.getSession();
  if(error||!data.session){location.href="login.html";return;}
  session=data.session;
  document.getElementById("hamb").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("signOut").addEventListener("click",async(e)=>{e.preventDefault();await supabaseClient.auth.signOut();location.href="login.html";});
  const p=await supabaseClient.from("profiles").select("full_name,role,user_type,is_subscribed,subscription_plan,subscription_expires_at").eq("id",session.user.id).single();
  if(p.error){if(window.hideLoader)hideLoader();showLocked("Profile could not be loaded: "+p.error.message);return;}
  profile=p.data;

  const isAdmin = (profile.role||profile.user_type||"").toLowerCase()==="admin";
  const roleForNav = (profile.role||profile.user_type||"").toLowerCase();
  const isEngineerRole = ["engineer","surveyor","admin"].includes(roleForNav);
  const navEP = document.getElementById("navEngineerPanel");
  const navTC = document.getElementById("navTeamChat");
  const navReports = document.getElementById("navReports");
  const navSaved = document.getElementById("navSaved");
  if(navEP) navEP.style.display = isEngineerRole ? "" : "none";
  if(navTC) navTC.style.display = isEngineerRole ? "" : "none";
  if(navReports) navReports.style.display = isEngineerRole ? "none" : "";
  if(navSaved) navSaved.style.display = isEngineerRole ? "none" : "";
  const notExpired = !profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date();
  const plan = (profile.subscription_plan || "").toLowerCase();
  subscribed = isAdmin || !!(profile.is_subscribed && notExpired && PLAN_CONFIG[plan]);
  planLevel = isAdmin ? "institution" : (subscribed ? plan : null); // admin gets full (institution-level) access

  if(window.hideLoader)hideLoader();

  if(!subscribed){
    document.getElementById("planBadge").textContent = plan === "weekly"
      ? "Weekly plan — AI Assistant needs Monthly or Annual"
      : "Free plan — subscription required";
    showLocked("The AI Assistant is available on Monthly, Annual, and Institution plans. Weekly and free accounts don't include AI access.");
    return;
  }

  document.getElementById("planBadge").textContent = isAdmin ? "✓ Admin — full AI access" : `✓ ${PLAN_CONFIG[plan].label} plan — AI Assistant access`;
  document.getElementById("workspace").style.display="grid";
  restoreLocation();
  document.getElementById("chatForm").addEventListener("submit",sendMessage);
  document.getElementById("reportBtn").addEventListener("click",generateReport);
 }catch(err){
  if(window.hideLoader)hideLoader();
  console.error("AI Assistant init failed:",err);
  showLocked("Something went wrong loading this page: "+(err.message||err)+". Try refreshing.");
 }
}
function showLocked(msg){document.getElementById("locked").style.display="block";if(msg)document.getElementById("lockStatus").textContent=msg;}
function restoreLocation(){try{const raw=sessionStorage.getItem("geonexa_pending_location");if(!raw)return;sessionStorage.removeItem("geonexa_pending_location");selectedLocation=JSON.parse(raw);renderLocation();}catch(_) {}}
function renderLocation(){const l=selectedLocation;if(!l)return;document.getElementById("locationBox").innerHTML=`<b>${esc(l.label||"Selected location")}</b><br>Lat ${Number(l.lat).toFixed(5)} · Lng ${Number(l.lng).toFixed(5)}${l.parcel?.upi?`<br>UPI: <b>${esc(l.parcel.upi)}</b>`:""}`;}
function formatWait(seconds){const m=Math.ceil(seconds/60);return m<=1?"about a minute":`about ${m} minutes`;}
async function sendMessage(e){e.preventDefault();const input=document.getElementById("chatInput"),msg=input.value.trim();if(!msg)return;
 const btn=document.getElementById("sendBtn");btn.disabled=true;
 const cfg=PLAN_CONFIG[planLevel];
 try{
   const {data:limit,error:limitErr}=await supabaseClient.rpc("check_ai_limit_allowed",{p_user_id:session.user.id,p_max_attempts:cfg.maxAttempts});
   if(limitErr){append("assistant","Couldn't verify rate limit — try again shortly.");btn.disabled=false;return;}
   if(!limit.allowed){append("assistant",`You've hit the question limit for now. Try again in ${formatWait(limit.retry_after_seconds)}.`);btn.disabled=false;return;}
   await supabaseClient.rpc("record_ai_attempt",{p_user_id:session.user.id});
 }catch(_){ /* fail open — never block on the limiter itself misbehaving */ }
 append("user",msg);input.value="";const thinking=append("assistant","Thinking…");
 if(window.showLoader)showLoader("Asking the AI Assistant…");
 const apiMessage=`${cfg.promptPrefix}\n\nQuestion: ${msg}`;
 try{const res=await fetch(ENGINEER_AI_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({message:apiMessage,context:{user_type:profile.user_type,role:profile.role,plan:planLevel,workspace:"engineer"},location:selectedLocation})});const data=await res.json();if(!res.ok)throw new Error(data.error||`AI request failed (${res.status})`);thinking.textContent=data.reply||"No response received.";latestAnalysis={message:msg,reply:data.reply||"No response received.",location:selectedLocation,plan:planLevel,timestamp:new Date().toISOString()};sessionStorage.setItem("geonexa_latest_ai_analysis",JSON.stringify(latestAnalysis));sessionStorage.setItem("geonexa_report_payload",JSON.stringify(latestAnalysis));document.getElementById("reportBtn").disabled=false;document.getElementById("reportStatus").textContent="Full report ready — you can generate and download the PDF.";}catch(err){thinking.textContent="AI Assistant error: "+(err.message||err);}finally{btn.disabled=false;if(window.hideLoader)hideLoader();}}
function append(role,text){const row=document.createElement("div");row.className=`msg ${role}`;row.textContent=text;document.getElementById("chatLog").appendChild(row);document.getElementById("chatLog").scrollTop=999999;return row;}
function generateReport(){if(!latestAnalysis?.reply){const raw=sessionStorage.getItem("geonexa_latest_ai_analysis");if(raw)try{latestAnalysis=JSON.parse(raw)}catch(_){} }if(latestAnalysis?.reply){sessionStorage.setItem("geonexa_report_payload",JSON.stringify(latestAnalysis));location.href="ai-report.html";}}
function esc(s){const d=document.createElement("div");d.textContent=String(s??"");return d.innerHTML;}
