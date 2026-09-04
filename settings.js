// GeoNEXA AI — Settings page logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

let currentUserId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  currentUserId = session.user.id;

  wireTabs();
  wireSidebar();

  await loadProfile(session.user);
  await loadPreferences(session.user.id);
  await loadAppearance(session.user.id);
  await loadNotifications(session.user.id);

  const form = document.getElementById("accountForm");
  if (form) form.addEventListener("submit", handleSave);

  wirePreferences();
  wireAppearance();
  wireNotifications();
  wireSecurity();
});

// ---------- Tabs ----------
function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("pane-" + btn.dataset.tab).classList.add("active");
    });
  });
}

function wireSidebar() {
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
  }
}

// ---------- Load profile ----------
async function loadProfile(user) {
  document.getElementById("fldEmail").value = user.email;
  document.getElementById("avatarLgEmail").textContent = user.email;
  const notifyEmailAddr = document.getElementById("notifyEmailAddr");
  if (notifyEmailAddr) notifyEmailAddr.textContent = user.email;

  try {
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("full_name, role, phone_number, organization, country, is_subscribed, subscription_expires_at")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    const name = profile.full_name || user.email;

    document.getElementById("fldFullName").value = profile.full_name || "";
    document.getElementById("fldOrganization").value = profile.organization || "";
    document.getElementById("fldPhone").value = profile.phone_number || "";
    document.getElementById("fldCountry").value = profile.country || "Rwanda";
    if (profile.role) document.getElementById("fldRole").value = profile.role;

    document.getElementById("profileName").textContent = name;
    document.getElementById("profileRole").textContent = profile.role || "User";
    document.getElementById("avatarInitial").textContent = name.charAt(0).toUpperCase();
    document.getElementById("avatarLg").textContent = name.charAt(0).toUpperCase();
    document.getElementById("avatarLgName").textContent = name;

    const notExpired = !profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date();
    const isSubscribed = !!(profile.is_subscribed && notExpired);
    const pill = document.getElementById("tierPill");
    pill.textContent = isSubscribed ? "✓ Subscribed" : "Free Tier";
    if (isSubscribed) pill.classList.add("subscribed");
  } catch (err) {
    console.error("Profile load failed:", err);
    document.getElementById("profileName").textContent = user.email;
    document.getElementById("avatarInitial").textContent = user.email.charAt(0).toUpperCase();
    document.getElementById("avatarLg").textContent = user.email.charAt(0).toUpperCase();
    document.getElementById("avatarLgName").textContent = user.email;
    document.getElementById("tierPill").textContent = "Unable to load plan";
  }
}

// ---------- Preferences ----------
const DEFAULT_PREFS = {
  units: "metric",
  currency: "RWF",
  language: "en",
  default_map_layer: "all",
  default_zoom: 8,
  grounded_ai: true,
};

async function loadPreferences(userId) {
  let prefs = DEFAULT_PREFS;

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .single();

    if (error) throw error;
    prefs = { ...DEFAULT_PREFS, ...(data.preferences || {}) };
  } catch (err) {
    console.error("Preferences load failed, using defaults:", err);
  }

  setSegmentedValue("unitsSegmented", prefs.units);
  document.getElementById("fldCurrency").value = prefs.currency;
  document.getElementById("fldLanguage").value = prefs.language;
  document.getElementById("fldDefaultLayer").value = prefs.default_map_layer;
  document.getElementById("fldZoom").value = prefs.default_zoom;
  document.getElementById("zoomValue").textContent = prefs.default_zoom;
  document.getElementById("fldGroundedAI").checked = !!prefs.grounded_ai;
}

function setSegmentedValue(containerId, value) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

function getSegmentedValue(containerId) {
  const container = document.getElementById(containerId);
  const active = container?.querySelector("button.active");
  return active ? active.dataset.value : null;
}

function wirePreferences() {
  document.querySelectorAll(".segmented").forEach((seg) => {
    seg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setSegmentedValue(seg.id, btn.dataset.value));
    });
  });

  const zoomSlider = document.getElementById("fldZoom");
  if (zoomSlider) {
    zoomSlider.addEventListener("input", () => {
      document.getElementById("zoomValue").textContent = zoomSlider.value;
    });
  }

  const saveBtn = document.getElementById("savePrefsBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSavePreferences);
}

async function handleSavePreferences() {
  const saveBtn = document.getElementById("savePrefsBtn");
  const statusEl = document.getElementById("prefsSaveStatus");

  saveBtn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Saving…";

  const preferences = {
    units: getSegmentedValue("unitsSegmented") || "metric",
    currency: document.getElementById("fldCurrency").value,
    language: document.getElementById("fldLanguage").value,
    default_map_layer: document.getElementById("fldDefaultLayer").value,
    default_zoom: Number(document.getElementById("fldZoom").value),
    grounded_ai: document.getElementById("fldGroundedAI").checked,
  };

  try {
    const { error } = await supabaseClient
      .from("profiles")
      .update({ preferences })
      .eq("id", currentUserId);

    if (error) throw error;

    statusEl.style.color = "var(--green)";
    statusEl.textContent = "Saved.";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  } catch (err) {
    console.error("Preferences save failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't save: " + (err.message || err);
  } finally {
    saveBtn.disabled = false;
  }
}
async function handleSave(e) {
  e.preventDefault();
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("saveStatus");

  saveBtn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Saving…";

  const updates = {
    full_name: document.getElementById("fldFullName").value.trim(),
    organization: document.getElementById("fldOrganization").value.trim(),
    phone_number: document.getElementById("fldPhone").value.trim(),
    role: document.getElementById("fldRole").value,
    country: document.getElementById("fldCountry").value.trim(),
  };

  try {
    const { error } = await supabaseClient
      .from("profiles")
      .update(updates)
      .eq("id", currentUserId);

    if (error) throw error;

    statusEl.style.color = "var(--green)";
    statusEl.textContent = "Saved.";

    // Reflect the new name immediately in the top bar without a reload
    const name = updates.full_name || document.getElementById("fldEmail").value;
    document.getElementById("profileName").textContent = name;
    document.getElementById("avatarInitial").textContent = name.charAt(0).toUpperCase();
    document.getElementById("avatarLg").textContent = name.charAt(0).toUpperCase();
    document.getElementById("avatarLgName").textContent = name;
    document.getElementById("profileRole").textContent = updates.role || "User";

    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  } catch (err) {
    console.error("Save failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't save: " + (err.message || err);
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- Appearance ----------
const DEFAULT_APPEARANCE = { theme: "dark", density: "comfortable", accent: "teal" };

async function loadAppearance(userId) {
  let appearance = DEFAULT_APPEARANCE;
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .single();
    if (error) throw error;
    appearance = { ...DEFAULT_APPEARANCE, ...(data.preferences?.appearance || {}) };
  } catch (err) {
    console.error("Appearance load failed, using defaults:", err);
  }
  applyAppearance(appearance);
}

function applyAppearance(appearance) {
  setSegmentedValue("themeSegmented", appearance.theme);
  setSegmentedValue("densitySegmented", appearance.density);
  document.querySelectorAll("#accentSwatches .swatch").forEach((sw) => {
    sw.classList.toggle("active", sw.dataset.value === appearance.accent);
  });

  const resolvedTheme = appearance.theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : appearance.theme;
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  document.documentElement.setAttribute("data-density", appearance.density);

  const accentHex = { teal: "#14b8a6", blue: "#3b82f6", purple: "#a855f7", green: "#22c55e" }[appearance.accent] || "#14b8a6";
  document.documentElement.style.setProperty("--teal", accentHex);
}

function wireAppearance() {
  document.querySelectorAll("#themeSegmented button, #densitySegmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSegmentedValue(btn.closest(".segmented").id, btn.dataset.value);
      previewAppearance();
    });
  });

  document.querySelectorAll("#accentSwatches .swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      document.querySelectorAll("#accentSwatches .swatch").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
      previewAppearance();
    });
  });

  const saveBtn = document.getElementById("saveAppearanceBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveAppearance);
}

function previewAppearance() {
  applyAppearance(readAppearanceFromForm());
}

function readAppearanceFromForm() {
  const activeSwatch = document.querySelector("#accentSwatches .swatch.active");
  return {
    theme: getSegmentedValue("themeSegmented") || "dark",
    density: getSegmentedValue("densitySegmented") || "comfortable",
    accent: activeSwatch ? activeSwatch.dataset.value : "teal",
  };
}

async function handleSaveAppearance() {
  const saveBtn = document.getElementById("saveAppearanceBtn");
  const statusEl = document.getElementById("appearanceSaveStatus");
  saveBtn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Saving…";

  try {
    const { data: current, error: readError } = await supabaseClient
      .from("profiles").select("preferences").eq("id", currentUserId).single();
    if (readError) throw readError;

    const preferences = { ...(current.preferences || {}), appearance: readAppearanceFromForm() };
    const { error } = await supabaseClient.from("profiles").update({ preferences }).eq("id", currentUserId);
    if (error) throw error;

    statusEl.style.color = "var(--green)";
    statusEl.textContent = "Saved.";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  } catch (err) {
    console.error("Appearance save failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't save: " + (err.message || err);
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- Notifications ----------
const DEFAULT_NOTIFICATIONS = {
  email: true, sms: false, in_app: true,
  disputes: true, risk: true, reports: true, billing: true,
};

async function loadNotifications(userId) {
  let n = DEFAULT_NOTIFICATIONS;
  try {
    const { data, error } = await supabaseClient
      .from("profiles").select("preferences").eq("id", userId).single();
    if (error) throw error;
    n = { ...DEFAULT_NOTIFICATIONS, ...(data.preferences?.notifications || {}) };
  } catch (err) {
    console.error("Notifications load failed, using defaults:", err);
  }

  document.getElementById("notifyEmail").checked = n.email;
  document.getElementById("notifySms").checked = n.sms;
  document.getElementById("notifyInApp").checked = n.in_app;
  document.getElementById("notifyDisputes").checked = n.disputes;
  document.getElementById("notifyRisk").checked = n.risk;
  document.getElementById("notifyReports").checked = n.reports;
  document.getElementById("notifyBilling").checked = n.billing;
}

function wireNotifications() {
  const saveBtn = document.getElementById("saveNotificationsBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveNotifications);
}

async function handleSaveNotifications() {
  const saveBtn = document.getElementById("saveNotificationsBtn");
  const statusEl = document.getElementById("notificationsSaveStatus");
  saveBtn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Saving…";

  const notifications = {
    email: document.getElementById("notifyEmail").checked,
    sms: document.getElementById("notifySms").checked,
    in_app: document.getElementById("notifyInApp").checked,
    disputes: document.getElementById("notifyDisputes").checked,
    risk: document.getElementById("notifyRisk").checked,
    reports: document.getElementById("notifyReports").checked,
    billing: document.getElementById("notifyBilling").checked,
  };

  try {
    const { data: current, error: readError } = await supabaseClient
      .from("profiles").select("preferences").eq("id", currentUserId).single();
    if (readError) throw readError;

    const preferences = { ...(current.preferences || {}), notifications };
    const { error } = await supabaseClient.from("profiles").update({ preferences }).eq("id", currentUserId);
    if (error) throw error;

    statusEl.style.color = "var(--green)";
    statusEl.textContent = "Saved.";
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  } catch (err) {
    console.error("Notifications save failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't save: " + (err.message || err);
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- Security ----------
function wireSecurity() {
  const pwForm = document.getElementById("passwordForm");
  if (pwForm) pwForm.addEventListener("submit", handlePasswordChange);

  const newPwInput = document.getElementById("fldNewPassword");
  if (newPwInput) newPwInput.addEventListener("input", updateStrengthBar);

  const signOutAllBtn = document.getElementById("signOutAllBtn");
  if (signOutAllBtn) signOutAllBtn.addEventListener("click", handleSignOutAll);
}

function updateStrengthBar() {
  const value = document.getElementById("fldNewPassword").value;
  const fill = document.getElementById("strengthBarFill");
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;

  const widths = ["8%", "35%", "65%", "100%"];
  const colors = ["var(--red)", "var(--red)", "#eab308", "var(--green)"];
  fill.style.width = value ? widths[Math.min(score, 3)] : "0%";
  fill.style.background = colors[Math.min(score, 3)];
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const newPw = document.getElementById("fldNewPassword").value;
  const confirmPw = document.getElementById("fldConfirmPassword").value;
  const statusEl = document.getElementById("passwordSaveStatus");
  const btn = document.getElementById("savePasswordBtn");

  if (newPw.length < 8) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Password must be at least 8 characters.";
    return;
  }
  if (newPw !== confirmPw) {
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Passwords don't match.";
    return;
  }

  btn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Updating…";

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPw });
    if (error) throw error;

    statusEl.style.color = "var(--green)";
    statusEl.textContent = "Password updated.";
    document.getElementById("fldNewPassword").value = "";
    document.getElementById("fldConfirmPassword").value = "";
    document.getElementById("strengthBarFill").style.width = "0%";
  } catch (err) {
    console.error("Password change failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't update password: " + (err.message || err);
  } finally {
    btn.disabled = false;
  }
}

async function handleSignOutAll() {
  const btn = document.getElementById("signOutAllBtn");
  const statusEl = document.getElementById("signOutAllStatus");
  btn.disabled = true;
  statusEl.style.color = "var(--muted)";
  statusEl.textContent = "Signing out of all devices…";

  try {
    const { error } = await supabaseClient.auth.signOut({ scope: "global" });
    if (error) throw error;
    window.location.href = "login.html";
  } catch (err) {
    console.error("Global sign-out failed:", err);
    statusEl.style.color = "var(--red)";
    statusEl.textContent = "Couldn't sign out everywhere: " + (err.message || err);
    btn.disabled = false;
  }
}
