// GeoNEXA AI — Subscription page logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

// ⚠️ Update this to your deployed initiate-payment Edge Function URL.
const PAYMENT_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/clever-processor";

let currentUserId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }
  currentUserId = session.user.id;

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

  wireModal();
  await loadPlanStatus();
  await loadHistory();
});

// ---------- Plan status ----------
async function loadPlanStatus() {
  const badge = document.getElementById("planBadge");
  const title = document.getElementById("planTitle");
  const detail = document.getElementById("planDetail");
  const expiry = document.getElementById("planExpiry");
  const subscribeBtn = document.getElementById("subscribeBtn");

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("is_subscribed, subscription_expires_at")
      .eq("id", currentUserId)
      .single();

    if (error) throw error;

    const notExpired = !data.subscription_expires_at || new Date(data.subscription_expires_at) > new Date();
    const isSubscribed = !!(data.is_subscribed && notExpired);

    if (isSubscribed) {
      badge.textContent = "✓ Active";
      badge.classList.add("active");
      title.textContent = "GeoNEXA Full Access";
      detail.textContent = "100% access to every report, transaction, and AI analysis.";
      const days = Math.ceil((new Date(data.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
      expiry.textContent = `Renews or expires in ${days} day${days === 1 ? "" : "s"} (${new Date(data.subscription_expires_at).toLocaleDateString()})`;
      subscribeBtn.textContent = "Renew Subscription";
    } else {
      badge.textContent = "Free Plan";
      title.textContent = "Free Plan";
      detail.textContent = "40% preview access to reports and transactions.";
      expiry.textContent = "";
      subscribeBtn.textContent = "Subscribe with Mobile Money";
    }
  } catch (err) {
    console.error("Plan status load failed:", err);
    badge.textContent = "Unable to load plan";
    title.textContent = "—";
  }
}

// ---------- Payment history ----------
async function loadHistory() {
  const listEl = document.getElementById("historyList");
  try {
    const { data, error } = await supabaseClient
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No payments yet. Your history will show up here once you subscribe.</div>`;
      return;
    }

    listEl.innerHTML = data.map(historyRowHTML).join("");
  } catch (err) {
    console.error("History load failed:", err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load payment history.</div>`;
  }
}

function historyRowHTML(p) {
  const colors = { successful: ["var(--green)", "rgba(34,197,94,.15)"], pending: ["var(--yellow)", "rgba(234,179,8,.15)"], failed: ["var(--red)", "rgba(239,68,68,.15)"] };
  const [color, bg] = colors[p.status] || colors.pending;
  const date = new Date(p.created_at).toLocaleString();

  return `
    <div class="history-row">
      <div>
        <div>${escapeHTML(p.network || "Mobile Money")} · ${escapeHTML(p.phone_number || "")}</div>
        <div style="color:var(--muted);font-size:11px;margin-top:2px;">${date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="history-amount">${Number(p.amount).toLocaleString()} ${escapeHTML(p.currency)}</span>
        <span class="status-pill" style="background:${bg};color:${color};">${escapeHTML(p.status)}</span>
      </div>
    </div>`;
}

// ---------- Payment modal ----------
function wireModal() {
  document.getElementById("subscribeBtn").addEventListener("click", () => {
    document.getElementById("paywallModalOverlay").classList.add("open");
  });
  document.getElementById("paywallCloseBtn").addEventListener("click", closeModal);
  document.getElementById("paywallModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "paywallModalOverlay") closeModal();
  });
  document.getElementById("paywallPaymentForm").addEventListener("submit", handlePaymentSubmit);
}

function closeModal() {
  document.getElementById("paywallModalOverlay").classList.remove("open");
}

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const phone_number = document.getElementById("paywallPhone").value.trim();
  const network = document.getElementById("paywallNetwork").value;
  const statusEl = document.getElementById("paywallStatus");
  const submitBtn = document.getElementById("paywallSubmitBtn");

  if (!phone_number) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Enter your mobile money phone number.";
    return;
  }

  submitBtn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Sending payment request…";

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const res = await fetch(PAYMENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ phone_number, network }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error((data.error || "Payment could not be started") + (data.details ? " — " + data.details : ""));

    if (data.redirect) {
      statusEl.style.color = "var(--teal)";
      statusEl.textContent = "Redirecting to confirm your payment…";
      setTimeout(() => { window.location.href = data.redirect; }, 700);
    } else {
      statusEl.style.color = "var(--teal)";
      statusEl.textContent = "Check your phone and approve the mobile money prompt. Reload this page once confirmed.";
    }
  } catch (err) {
    console.error("Payment error:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Payment couldn't be started: " + (err.message || err);
  } finally {
    submitBtn.disabled = false;
  }
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
