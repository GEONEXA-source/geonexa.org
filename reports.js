// GeoNEXA AI — Reports page logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

const FREE_PREVIEW_RATIO = 0.4; // non-subscribers see this fraction of each report list

let isSubscribed = false;

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  const user = session.user;
  document.getElementById("avatarInitial").textContent = user.email.charAt(0).toUpperCase();

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  await checkSubscription(user.id);
  await loadReports();
  await loadTransactions();
  wirePaywallModal();
});

// ---------- Subscription status ----------
async function checkSubscription(userId) {
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("is_subscribed, subscription_expires_at")
      .eq("id", userId)
      .single();

    if (error) throw error;

    const notExpired = !data.subscription_expires_at || new Date(data.subscription_expires_at) > new Date();
    isSubscribed = !!(data.is_subscribed && notExpired);
  } catch (err) {
    console.error("Subscription check failed:", err);
    isSubscribed = false; // fail safe — treat as free tier rather than block the page
  }

  const badge = document.getElementById("subStatusBadge");
  if (badge) {
    badge.textContent = isSubscribed ? "✓ Subscribed — full access" : "Free plan — 40% preview";
    badge.style.color = isSubscribed ? "var(--green)" : "var(--muted)";
  }

  const subCardStatus = document.getElementById("subCardStatus");
  const standaloneBtn = document.getElementById("standaloneSubscribeBtn");
  if (subCardStatus && standaloneBtn) {
    if (isSubscribed) {
      subCardStatus.textContent = "You're subscribed — full access to every report.";
      standaloneBtn.style.display = "none";
    } else {
      subCardStatus.textContent = "Free plan — unlock 100% of every report with mobile money.";
      standaloneBtn.style.display = "";
    }
  }
}

// ---------- Reports (gated) ----------
async function loadReports() {
  const listEl = document.getElementById("reportsList");
  const subtitleEl = document.getElementById("reportsSubtitle");

  try {
    const { data, error, count } = await supabaseClient
      .schema("cadastral")
      .from("parcels")
      .select("*", { count: "exact" })
      .order("data_date", { ascending: false })
      .limit(20);

    if (error) throw error;

    subtitleEl.textContent = `${count || 0} parcel${count === 1 ? "" : "s"} analyzed`;

    if (!data || data.length === 0) {
      listEl.innerHTML = emptyState(
        "📄",
        "No reports yet. Reports will appear here automatically once parcel data is ingested into the cadastral.parcels table."
      );
      return;
    }

    renderGatedList(listEl, data, rowToReportHTML);
  } catch (err) {
    console.error("Reports load error:", err);
    subtitleEl.textContent = "Unable to load reports";
    listEl.innerHTML = emptyState(
      "⚠️",
      "Reports couldn't be loaded. Make sure the cadastral schema is exposed under Supabase → Settings → API → Exposed schemas, and that the parcels table is toggled on under Exposed tables."
    );
  }
}

async function loadTransactions() {
  const listEl = document.getElementById("transactionsList");

  try {
    const { data, error } = await supabaseClient
      .from("land_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = emptyState("💰", "No transactions recorded yet.");
      return;
    }

    renderGatedList(listEl, data, rowToTransactionHTML);
  } catch (err) {
    console.error("Transactions load error:", err);
    listEl.innerHTML = emptyState(
      "⚠️",
      "Transactions couldn't be loaded. Make sure the land_transactions table is exposed via PostgREST."
    );
  }
}

// Renders the first 40% of rows normally; if not subscribed, the rest render
// blurred with a single paywall card overlaid on top of them.
function renderGatedList(listEl, rows, rowRenderer) {
  if (isSubscribed) {
    listEl.innerHTML = rows.map(rowRenderer).join("");
    return;
  }

  const visibleCount = Math.max(1, Math.ceil(rows.length * FREE_PREVIEW_RATIO));
  const visibleRows = rows.slice(0, visibleCount);
  const lockedRows = rows.slice(visibleCount);

  let html = visibleRows.map(rowRenderer).join("");

  if (lockedRows.length > 0) {
    html += `
      <div class="locked-wrap">
        <div class="locked-rows">${lockedRows.map(rowRenderer).join("")}</div>
        <div class="paywall-overlay">
          <div class="paywall-card">
            <div style="font-size:22px;margin-bottom:6px;">🔒</div>
            <p><b>${lockedRows.length} more result${lockedRows.length === 1 ? "" : "s"}</b> hidden</p>
            <p class="fine">Subscribe to unlock 100% of every report — 2,000 RWF/month</p>
            <button class="btn-solid subscribe-btn">Subscribe with Mobile Money</button>
          </div>
        </div>
      </div>`;
  }

  listEl.innerHTML = html;
}

function rowToReportHTML(row) {
  const title = row.upi || `Parcel ${row.gid ?? ""}`;
  const location = [row.cell, row.sector, row.district].filter(Boolean).join(", ") || "Unknown location";
  const date = row.data_date ? new Date(row.data_date).toLocaleDateString() : "";
  const landUse = row.land_use || null;

  return `
    <div class="report-row">
      <div>
        <div class="report-title">${escapeHTML(title)}</div>
        <div class="report-sub">${escapeHTML(location)}${date ? " · " + date : ""}</div>
      </div>
      ${landUse ? `<span class="score-pill" style="background:rgba(20,184,166,.15);color:var(--teal);">${escapeHTML(landUse)}</span>` : ""}
    </div>`;
}

function rowToTransactionHTML(row) {
  const title = row.parcel_id || row.upi || `Transaction ${row.id ?? ""}`;
  const amount = row.amount ? formatRWF(row.amount) : "—";
  const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : "";

  return `
    <div class="report-row">
      <div>
        <div class="report-title">${escapeHTML(title)}</div>
        <div class="report-sub">${date}</div>
      </div>
      <div class="report-title">${amount}</div>
    </div>`;
}

function scorePill(score) {
  let color = "var(--red)", bg = "rgba(239,68,68,.15)";
  if (score >= 70) { color = "var(--green)"; bg = "rgba(34,197,94,.15)"; }
  else if (score >= 50) { color = "var(--yellow)"; bg = "rgba(234,179,8,.15)"; }
  return `<span class="score-pill" style="background:${bg};color:${color};">${score}</span>`;
}

function formatRWF(amount) {
  return new Intl.NumberFormat("en-RW", { style: "currency", currency: "RWF", maximumFractionDigits: 0 }).format(amount);
}

function emptyState(icon, message) {
  return `<div class="empty-state"><div class="icon">${icon}</div><p>${message}</p></div>`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Subscribe buttons → dedicated Subscription page ----------
function wirePaywallModal() {
  // Delegate clicks since "Subscribe" buttons are created dynamically inside gated lists
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("subscribe-btn")) {
      window.location.href = "subscription.html";
    }
  });
}
