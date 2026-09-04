// GeoNEXA AI — Dashboard logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

// ⚠️ Update this to your own Supabase project's Edge Function URL once deployed.
// It should look like: https://<your-project-ref>.functions.supabase.co/ai-assistant
const AI_ASSISTANT_ENDPOINT = "https://ogwckglzluhjwmucrodb.functions.supabase.co/ai-assistant";

let currentUser = null;
let currentProfile = null;
let dashMap = null;
let dashMarker = null;
let selectedLocation = null; // { lat, lng, label }

// ---------- Auth guard + profile load ----------
// Wrapped so any query failure (network hiccup, RLS issue, slow response)
// can never block the rest of the page — it falls back to the email and
// prints the real error into the #pageStatus line so it's visible on
// screen (no console needed) instead of hanging on "Loading…" forever.
async function guardAndLoadUser() {
  setPageStatus("Checking session…");
  let session;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
      setPageStatus("No active session — redirecting to login…");
      window.location.href = "login.html";
      return;
    }
    session = data.session;
  } catch (err) {
    setPageStatus("Session check error: " + (err.message || err), true);
    return;
  }

  currentUser = session.user;
  // Show something immediately instead of "Loading…" while the profile
  // query (which might be slow or fail) is still in flight.
  applyProfileDisplay(currentUser.email, null);
  setPageStatus("Signed in as " + currentUser.email + " — loading profile…");

  try {
    const profilePromise = supabaseClient
      .from("profiles")
      .select("full_name, role, user_type")
      .eq("id", currentUser.id)
      .single();

    // Don't let a hung request freeze the greeting forever.
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 6000));
    const result = await Promise.race([profilePromise, timeout]);

    if (result.timedOut) {
      setPageStatus("Profile lookup timed out after 6s — check config.js credentials and the profiles RLS policy.", true);
      return;
    }

    const { data: profile, error: profileError } = result;
    if (profileError) throw profileError;

    currentProfile = profile || null;
    applyProfileDisplay(currentUser.email, currentProfile);
    showWelcomeToast(profile && profile.full_name ? profile.full_name.split(" ")[0] : currentUser.email);
    setPageStatus(""); // clear — everything worked
  } catch (err) {
    setPageStatus("Profile load failed: " + (err.message || JSON.stringify(err)) + " — showing email instead.", true);
  }
}

function setPageStatus(message, isError) {
  const el = document.getElementById("pageStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--red)" : "var(--muted)";
}

function applyProfileDisplay(email, profile) {
  const nameToShow = (profile && profile.full_name) ? profile.full_name : email;

  const nameEl = document.getElementById("profileName");
  const roleEl = document.getElementById("profileRole");
  const avatarEl = document.getElementById("avatarInitial");

  if (nameEl) nameEl.textContent = nameToShow;
  if (roleEl) roleEl.textContent = (profile && (profile.role || profile.user_type)) || "User";
  if (avatarEl) avatarEl.textContent = nameToShow.charAt(0).toUpperCase();

  const usersLink = document.getElementById("navUsersAccess");
  if (usersLink) usersLink.style.display = (profile && profile.role === "admin") ? "" : "none";
}

function showWelcomeToast(firstName) {
  const toast = document.createElement("div");
  toast.textContent = `👋 Welcome to GeoNEXA AI, ${firstName}!`;
  toast.style.cssText = `
    position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:#111722;border:1px solid #14b8a6;color:#e8edf2;
    padding:11px 20px;border-radius:10px;font-size:13px;font-weight:600;
    z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.4);
    opacity:0;transition:opacity .3s ease;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = "1"; });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

// ---------- Page wiring ----------
// Note: guardAndLoadUser() is intentionally NOT awaited here — the map,
// buttons, and chart must work even if the profile lookup is slow or fails.
document.addEventListener("DOMContentLoaded", () => {
  guardAndLoadUser();
  initMap();
  renderRiskDonut();
  wireMapSearch();

  // Mobile sidebar toggle
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) {
    hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  // Profile dropdown
  const profileToggle = document.getElementById("profileToggle");
  const profileMenu = document.getElementById("profileMenu");
  if (profileToggle && profileMenu) {
    profileToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileMenu.classList.toggle("open");
    });
    document.addEventListener("click", () => profileMenu.classList.remove("open"));
  }

  // Sign out — always redirects, even if the signOut() call itself errors,
  // so a network hiccup can't leave you stuck with no way back to login.
  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      setPageStatus("Signing out…");
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
      } catch (err) {
        console.error("Sign out error:", err);
        setPageStatus("Sign out error: " + (err.message || err) + " — redirecting anyway…", true);
        await new Promise((r) => setTimeout(r, 1500)); // let the error be visible briefly
      }
      window.location.href = "login.html";
    });
  }

  // Settings (profile dropdown)
  const settingsMenuBtn = document.getElementById("settingsMenuBtn");
  if (settingsMenuBtn) {
    settingsMenuBtn.addEventListener("click", () => {
      window.location.href = "settings.html";
    });
  }

  // AI Assistant — nav link + quick action button both open it
  const aiNavLink = document.getElementById("navAIAssistant");
  if (aiNavLink) aiNavLink.addEventListener("click", (e) => { e.preventDefault(); openAIAssistant(); });

  const qaAskAI = document.getElementById("qaAskAI");
  if (qaAskAI) qaAskAI.addEventListener("click", () => openAIAssistant());

  const qaNewReport = document.getElementById("qaNewReport");
  if (qaNewReport) qaNewReport.addEventListener("click", () => { window.location.href = "reports.html"; });

  const qaOpenMap = document.getElementById("qaOpenMap");
  if (qaOpenMap) qaOpenMap.addEventListener("click", () => { window.location.href = "map-explorer.html"; });

  const aiCloseBtn = document.getElementById("aiCloseBtn");
  if (aiCloseBtn) aiCloseBtn.addEventListener("click", closeAIAssistant);

  const aiOverlay = document.getElementById("aiOverlay");
  if (aiOverlay) {
    aiOverlay.addEventListener("click", (e) => {
      if (e.target === aiOverlay) closeAIAssistant();
    });
  }

  const aiForm = document.getElementById("aiChatForm");
  if (aiForm) aiForm.addEventListener("submit", handleAISubmit);

  document.querySelectorAll(".ai-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openAIAssistant();
      document.getElementById("aiChatInput").value = btn.dataset.q;
      aiForm.requestSubmit();
    });
  });

  // "Analyze with AI" button next to the selected-location bar
  const analyzeBtn = document.getElementById("analyzeSelectedBtn");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => triggerLocationAnalysis());
  }

  // Pick up a location handed off from map-explorer.html ("Analyze with AI" there)
  consumePendingLocation();
});

// ---------- Location selection (shared by map click + search + handoff) ----------
function setSelectedLocation(lat, lng, label) {
  selectedLocation = { lat, lng, label: label || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };

  if (dashMap) {
    if (dashMarker) dashMap.removeLayer(dashMarker);
    dashMarker = L.marker([lat, lng]).addTo(dashMap);
    dashMap.setView([lat, lng], 13);
  }

  const bar = document.getElementById("selectedLocationBar");
  const text = document.getElementById("selectedLocationText");
  if (bar && text) {
    text.textContent = `📍 ${selectedLocation.label}`;
    bar.style.display = "flex";
  }
}

function triggerLocationAnalysis() {
  if (!selectedLocation) return;
  openAIAssistant();
  const input = document.getElementById("aiChatInput");
  input.value = `Analyze land suitability and risk for the location "${selectedLocation.label}" (lat ${selectedLocation.lat.toFixed(5)}, lng ${selectedLocation.lng.toFixed(5)}).`;
  document.getElementById("aiChatForm").requestSubmit();
}

function consumePendingLocation() {
  try {
    const raw = sessionStorage.getItem("geonexa_pending_location");
    if (!raw) return;
    sessionStorage.removeItem("geonexa_pending_location");
    const loc = JSON.parse(raw);
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      setSelectedLocation(loc.lat, loc.lng, loc.label);
      triggerLocationAnalysis();
    }
  } catch (err) {
    console.error("Could not read pending location:", err);
  }
}

// ---------- Location search (Nominatim, restricted to Rwanda) ----------
function wireMapSearch() {
  const input = document.getElementById("mapSearchInput");
  const resultsEl = document.getElementById("mapSearchResults");
  if (!input || !resultsEl) return;

  let debounceTimer = null;

  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(debounceTimer);

    if (query.length < 3) {
      resultsEl.classList.remove("open");
      resultsEl.innerHTML = "";
      return;
    }

    debounceTimer = setTimeout(() => runLocationSearch(query, resultsEl), 400);
  });

  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) {
      resultsEl.classList.remove("open");
    }
  });
}

async function runLocationSearch(query, resultsEl) {
  resultsEl.innerHTML = `<div class="search-loading">Searching…</div>`;
  resultsEl.classList.add("open");

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=rw&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const places = await res.json();

    if (!places || places.length === 0) {
      resultsEl.innerHTML = `<div class="search-empty">No places found for "${query}" in Rwanda.</div>`;
      return;
    }

    resultsEl.innerHTML = places.map((p, i) => `
      <div class="search-result" data-idx="${i}">
        <span class="sr-icon" style="background:rgba(20,184,166,.15);color:var(--teal);">📍</span>
        <div>
          <div class="sr-title">${escapeHTML(shortLabel(p.display_name))}</div>
          <div class="sr-sub">${escapeHTML(p.type || "place")}</div>
        </div>
      </div>`).join("");

    resultsEl.querySelectorAll(".search-result").forEach((row) => {
      row.addEventListener("click", () => {
        const p = places[Number(row.dataset.idx)];
        setSelectedLocation(parseFloat(p.lat), parseFloat(p.lon), shortLabel(p.display_name));
        resultsEl.classList.remove("open");
        document.getElementById("mapSearchInput").value = shortLabel(p.display_name);
      });
    });
  } catch (err) {
    console.error("Location search error:", err);
    resultsEl.innerHTML = `<div class="search-empty">Search failed. Check your connection and try again.</div>`;
  }
}

function shortLabel(displayName) {
  return displayName.split(",").slice(0, 3).join(",");
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- AI Assistant modal ----------
function openAIAssistant() {
  document.getElementById("aiOverlay").classList.add("open");
  document.getElementById("aiChatInput").focus();
}
function closeAIAssistant() {
  document.getElementById("aiOverlay").classList.remove("open");
}

async function handleAISubmit(e) {
  e.preventDefault();
  const input = document.getElementById("aiChatInput");
  const message = input.value.trim();
  if (!message) return;

  appendAIMessage("user", message);
  input.value = "";

  const sendBtn = document.getElementById("aiSendBtn");
  sendBtn.disabled = true;

  const thinkingEl = appendAIMessage("assistant", "Thinking…", true);
  thinkingEl.classList.add("thinking");

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error("Not signed in");

    const res = await fetch(AI_ASSISTANT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message: message,
        context: {
          user_type: currentProfile ? currentProfile.user_type : null,
          role: currentProfile ? currentProfile.role : null,
        },
        // If a location is selected (map click, search, or handoff from
        // map-explorer.html) the edge function will look up nearby parcels
        // and ground its answer in real data instead of guessing.
        location: selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng, label: selectedLocation.label } : null,
      }),
    });

    if (!res.ok) throw new Error("Assistant request failed (" + res.status + ")");

    const data = await res.json();
    thinkingEl.textContent = data.reply || "No response received.";
    thinkingEl.classList.remove("thinking");
  } catch (err) {
    console.error("AI Assistant error:", err);
    thinkingEl.textContent =
      "The assistant backend isn't reachable yet. Deploy the ai-assistant Supabase Edge Function and update AI_ASSISTANT_ENDPOINT in dashboard.js.";
    thinkingEl.classList.remove("thinking");
  } finally {
    sendBtn.disabled = false;
  }
}

function appendAIMessage(role, text, returnEl) {
  const log = document.getElementById("aiChatLog");
  const row = document.createElement("div");
  row.className = "ai-msg ai-msg-" + role;
  row.textContent = text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  return returnEl ? row : null;
}

// ---------- Risk breakdown donut ----------
function renderRiskDonut() {
  const canvas = document.getElementById("riskDonut");
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Suitable", "Moderate", "High Risk"],
      datasets: [{
        data: [67.6, 16.5, 15.9],
        backgroundColor: ["#22c55e", "#eab308", "#ef4444"],
        borderWidth: 0,
      }],
    },
    options: {
      cutout: "72%",
      plugins: { legend: { display: false } },
    },
  });
}

// ---------- Map (click anywhere to select a location) ----------
function initMap() {
  const mapEl = document.getElementById("map");
  if (!mapEl || typeof L === "undefined") return;

  dashMap = L.map("map").setView([-1.9403, 29.8739], 8); // Rwanda center
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(dashMap);

  dashMap.on("click", (e) => {
    setSelectedLocation(e.latlng.lat, e.latlng.lng);
  });
}
