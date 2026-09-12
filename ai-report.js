let payload = null;
let isSubscribed = false;

document.addEventListener("DOMContentLoaded", async () => {
  try { payload = JSON.parse(sessionStorage.getItem("geonexa_report_payload") || "null"); } catch (_) {}
  if (!payload?.reply) {
    document.getElementById("reportBody").textContent = "No AI analysis is available. Return to the AI Assistant and run an analysis first.";
    return;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = "login.html"; return; }
  try {
    const { data, error } = await supabaseClient.from("profiles")
      .select("is_subscribed,subscription_expires_at")
      .eq("id", session.user.id).single();
    if (!error) isSubscribed = !!(data.is_subscribed && (!data.subscription_expires_at || new Date(data.subscription_expires_at) > new Date()));
  } catch (_) { isSubscribed = false; }
  render();
  document.getElementById("downloadBtn").addEventListener("click", downloadPDF);
});

function render() {
  const loc = payload.location || {};
  document.getElementById("accessBadge").textContent = isSubscribed ? "✓ Paid plan — 100% report" : "Free plan — 40% preview";
  document.getElementById("accessBadge").style.color = isSubscribed ? "var(--green)" : "var(--muted)";
  document.getElementById("meta").innerHTML = `<b>Location:</b> ${esc(loc.label || "Not specified")}<br><b>Coordinates:</b> ${loc.lat != null ? Number(loc.lat).toFixed(5) : "—"}, ${loc.lng != null ? Number(loc.lng).toFixed(5) : "—"}<br><b>Generated:</b> ${new Date(payload.timestamp || Date.now()).toLocaleString()}${loc.parcel?.upi ? `<br><b>UPI:</b> ${esc(loc.parcel.upi)}` : ""}`;
  const full = String(payload.reply || "");
  const words = full.split(/\s+/).filter(Boolean);
  const shown = isSubscribed ? full : words.slice(0, Math.max(1, Math.ceil(words.length * .4))).join(" ");
  document.getElementById("reportBody").textContent = shown + (isSubscribed || shown === full ? "" : "\n\n[40% preview — the remaining analysis is locked on the Free plan]");
  const gate = document.getElementById("gate");
  const download = document.getElementById("downloadBtn");
  if (isSubscribed) {
    gate.style.display = "none";
    download.disabled = false;
    download.textContent = "Download PDF";
  } else {
    gate.style.display = "block";
    gate.innerHTML = `<b>🔒 60% of this report is locked.</b><p class="badge">Subscribe to GeoNEXA to unlock 100% of the AI analysis and PDF download.</p><button class="btn primary" onclick="location.href='subscription.html'">Upgrade to Full Access</button>`;
    download.disabled = true;
  }
}

function downloadPDF() {
  if (!isSubscribed || !payload?.reply) return;
  if (!window.GeoNexaPDF) { alert("PDF engine is still loading. Please try again."); return; }
  const loc = payload.location || {};
  const blob = GeoNexaPDF.makePDF(
    "GeoNEXA AI Analysis Report",
    [
      `Location: ${loc.label || "Not specified"}`,
      `Coordinates: ${loc.lat != null ? Number(loc.lat).toFixed(5) : "—"}, ${loc.lng != null ? Number(loc.lng).toFixed(5) : "—"}`,
      `UPI: ${loc.parcel?.upi || "Not specified"}`,
      `Generated: ${new Date(payload.timestamp || Date.now()).toLocaleString()}`
    ],
    String(payload.reply || "")
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GeoNEXA-AI-Report-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }
