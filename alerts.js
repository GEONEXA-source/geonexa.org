// GeoNEXA AI — Alerts logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

let allAlerts = [];
let activeFilter = "all";

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.dataset.filter;
      render();
    });
  });

  await loadAlerts();
});

async function loadAlerts() {
  const subtitleEl = document.getElementById("subtitle");
  try {
    const { data, error } = await supabaseClient
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    allAlerts = data || [];
    render();
  } catch (err) {
    console.error("Alerts load failed:", err);
    subtitleEl.textContent = "Unable to load";
    document.getElementById("alertsList").innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>Couldn't load alerts. Make sure the alerts table is exposed in Supabase → Settings → API.</p></div>`;
  }
}

function render() {
  const listEl = document.getElementById("alertsList");
  const subtitleEl = document.getElementById("subtitle");

  let rows = allAlerts;
  if (activeFilter === "unread") rows = rows.filter((a) => !a.is_read);
  else if (activeFilter !== "all") rows = rows.filter((a) => a.category === activeFilter);

  const unreadCount = allAlerts.filter((a) => !a.is_read).length;
  subtitleEl.textContent = `${allAlerts.length} total · ${unreadCount} unread`;

  if (rows.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔔</div>
        <p>${allAlerts.length === 0
          ? "No alerts yet. You'll see boundary disputes, risk updates, report completions, and billing notices here as they happen."
          : "No alerts match this filter."}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = rows.map(alertHTML).join("");
  wireMarkRead();
}

function alertHTML(a) {
  const colors = { info: "var(--blue)", warning: "var(--yellow)", critical: "var(--red)" };
  const color = colors[a.severity] || "var(--blue)";
  const date = new Date(a.created_at).toLocaleString();

  return `
    <div class="alert-card ${a.is_read ? "" : "unread"}" data-id="${a.id}">
      <span class="severity-dot" style="background:${color};"></span>
      <div class="alert-body">
        <div class="alert-title">${escapeHTML(a.title)}</div>
        <div class="alert-message">${escapeHTML(a.message)}</div>
        <div class="alert-meta">${date} · ${escapeHTML(a.category)}</div>
      </div>
      ${a.is_read ? "" : `<button class="mark-read-btn" data-id="${a.id}">Mark read</button>`}
    </div>`;
}

function wireMarkRead() {
  document.querySelectorAll(".mark-read-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      try {
        const { error } = await supabaseClient.from("alerts").update({ is_read: true }).eq("id", id);
        if (error) throw error;
        const alert = allAlerts.find((a) => a.id === id);
        if (alert) alert.is_read = true;
        render();
      } catch (err) {
        console.error("Mark read failed:", err);
        btn.disabled = false;
        alert("Couldn't mark as read: " + (err.message || err));
      }
    });
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
