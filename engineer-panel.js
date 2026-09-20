// GeoNEXA AI — Engineer Panel (hub page)
// Requires config.js to be loaded first (it defines `supabaseClient`)

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (window.showLoader) showLoader("Loading your panel…");

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) {
    if (window.hideLoader) hideLoader();
    location.href = "login.html";
    return;
  }
  const session = data.session;

  const p = await supabaseClient
    .from("profiles")
    .select("full_name, role, user_type, is_subscribed, subscription_expires_at, avatar_url")
    .eq("id", session.user.id)
    .single();

  if (p.error) {
    if (window.hideLoader) hideLoader();
    document.getElementById("content").innerHTML = `<div class="empty-state">Profile could not be loaded. Check the profiles table and RLS policy.</div>`;
    return;
  }

  const profile = p.data;
  const role = (profile.role || profile.user_type || "").toLowerCase();

  if (!["engineer", "surveyor"].includes(role)) {
    if (window.hideLoader) hideLoader();
    location.href = role === "admin" ? "admin-panel.html" : "dashboard.html";
    return;
  }

  const name = profile.full_name || session.user.email || "Engineer";
  const avatarEl = document.getElementById("avatarInitial");
  if (profile.avatar_url) {
    avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="">`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  const subscribed = !!(profile.is_subscribed && (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date()));

  renderContent(subscribed, profile);
  if (window.hideLoader) hideLoader();
}

function renderContent(subscribed, profile) {
  const content = document.getElementById("content");

  const planCardHTML = subscribed
    ? `
      <div class="plan-card">
        <span class="plan-badge active">✓ Active</span>
        <div class="plan-title">Full Engineer Access</div>
        <div class="plan-detail">You have unlimited AI analysis and full access to the team chat.</div>
      </div>`
    : `
      <div class="plan-card">
        <span class="plan-badge">Free Plan</span>
        <div class="plan-title">Subscribe to unlock the Engineer Panel</div>
        <div class="plan-detail">AI Assistant and Team Chat both require an active subscription — 2,000 RWF/month via MTN or Airtel Mobile Money.</div>
        <a href="subscription.html" class="btn-solid">Subscribe with Mobile Money →</a>
      </div>`;

  const cardsHTML = `
    <div class="cards">
      ${actionCard({
        icon: "🤖",
        title: "AI Assistant",
        desc: "Ask questions about any parcel, zoning, or spatial risk and get an AI-grounded answer.",
        href: "ai-assistant.html",
        locked: !subscribed,
      })}
      ${actionCard({
        icon: "💬",
        title: "Team Chat",
        desc: "Chat with other subscribed engineers and surveyors. Admins post announcements here too.",
        href: "engineer-chat.html",
        locked: !subscribed,
      })}
    </div>`;

  content.innerHTML = planCardHTML + cardsHTML;
}

function actionCard({ icon, title, desc, href, locked }) {
  const inner = `
    <div class="action-icon">${icon}</div>
    <h3>${title}</h3>
    <p>${desc}</p>
    ${locked ? `<div class="lock-note">🔒 Requires subscription</div>` : ""}
  `;
  if (locked) {
    return `<div class="action-card locked">${inner}</div>`;
  }
  return `<a class="action-card" href="${href}">${inner}</a>`;
}
