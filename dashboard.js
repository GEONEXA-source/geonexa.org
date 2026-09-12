// GeoNEXA AI — Dashboard logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

// ⚠️ Update this to your own Supabase project's Edge Function URL once deployed.
// It should look like: https://<your-project-ref>.functions.supabase.co/ai-assistant
const AI_ASSISTANT_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/ai-assistant";

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
  // If we already loaded this profile earlier in this session, show it
  // immediately — no "Loading…" flash, no placeholder swap. This is what
  // makes the dashboard feel fixed (like Instagram/Facebook) instead of
  // re-loading every time the app is reopened from the task bar.
  let cachedApplied = false;
  try {
    const cachedRaw = sessionStorage.getItem("geonexa_cached_profile");
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      currentUser = cached.user;
      currentProfile = cached.profile;
      applyProfileDisplay(cached.user.email, cached.profile);
      cachedApplied = true;
    }
  } catch (_) {}

  if (!cachedApplied) setPageStatus("Checking session…");

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
    if (!cachedApplied) setPageStatus("Session check error: " + (err.message || err), true);
    return;
  }

  currentUser = session.user;
  // Only show the placeholder/"loading profile" state on a genuinely first
  // load. If we already applied cached data above, stay silent — no visible
  // change while this background refresh runs.
  if (!cachedApplied) {
    applyProfileDisplay(currentUser.email, null);
    setPageStatus("Signed in as " + currentUser.email + " — loading profile…");
  }

  try {
    const profilePromise = supabaseClient
      .from("profiles")
      .select("full_name, role, user_type, avatar_url")
      .eq("id", currentUser.id)
      .single();

    // Don't let a hung request freeze the greeting forever.
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 6000));
    const result = await Promise.race([profilePromise, timeout]);

    if (result.timedOut) {
      if (!cachedApplied) setPageStatus("Profile lookup timed out after 6s — check config.js credentials and the profiles RLS policy.", true);
      return;
    }

    const { data: profile, error: profileError } = result;
    if (profileError) throw profileError;

    currentProfile = profile || null;
    applyProfileDisplay(currentUser.email, currentProfile);

    // Cache for the rest of this session so a resumed/reopened dashboard
    // shows the profile instantly instead of reloading it visibly.
    try {
      sessionStorage.setItem("geonexa_cached_profile", JSON.stringify({
        user: { email: currentUser.email, id: currentUser.id },
        profile: currentProfile,
      }));
    } catch (_) {}

    // Welcome toast only once per session — not every time the app is
    // reopened from the task bar to an already-loaded dashboard.
    if (!sessionStorage.getItem("geonexa_welcomed")) {
      showWelcomeToast(profile && profile.full_name ? profile.full_name.split(" ")[0] : currentUser.email);
      sessionStorage.setItem("geonexa_welcomed", "1");
    }

    setPageStatus(""); // clear — everything worked
  } catch (err) {
    if (!cachedApplied) setPageStatus("Profile load failed: " + (err.message || JSON.stringify(err)) + " — showing email instead.", true);
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
  if (avatarEl) {
    if (profile && profile.avatar_url) {
      avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="Profile photo">`;
    } else {
      avatarEl.textContent = nameToShow.charAt(0).toUpperCase();
    }
  }

  const usersLink = document.getElementById("navUsersAccess");
  if (usersLink) usersLink.style.display = (profile && profile.role === "admin") ? "" : "none";
  const engineerLink = document.getElementById("navEngineerPanel");
  if (engineerLink) {
    const role = String((profile && (profile.role || profile.user_type)) || "").toLowerCase();
    engineerLink.style.display = ["engineer", "surveyor"].includes(role) ? "" : "none";
  }
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
      try { sessionStorage.removeItem("geonexa_cached_profile"); sessionStorage.removeItem("geonexa_welcomed"); } catch (_) {}
      window.location.href = "login.html";
    });
  }

  // Settings (profile dropdown)
  const settingsMenuBtn = document.getElementById("settingsMenuBtn");
  if (settingsMenuBtn) {
    settingsMenuBtn.addEventListener("click", () => {
      window.location.href = "coming-soon.html?feature=Settings";
    });
  }

  // AI Assistant — nav link + quick action button both open it
  const aiNavLink = document.getElementById("navAIAssistant");
  if (aiNavLink) aiNavLink.addEventListener("click", (e) => { e.preventDefault(); openAIAssistant(); });

  const qaAskAI = document.getElementById("qaAskAI");
  if (qaAskAI) qaAskAI.addEventListener("click", () => { window.location.href = "ai-assistant.html"; });

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
  sessionStorage.setItem("geonexa_pending_location", JSON.stringify(selectedLocation));
  window.location.href = "ai-assistant.html";
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
  resultsEl.innerHTML = `<div class="search-loading">Searching parcels and places…</div>`;
  resultsEl.classList.add("open");

  const clean = query.replace(/[%_]/g, "").trim();
  let parcelResults = [];
  let placeResults = [];

  // Use the same PostGIS RPC as Map Explorer so dashboard searches can find
  // UPI, district, sector, cell and land-use records from the real schema.
  try {
    const { data, error } = await supabaseClient.rpc("search_cadastral_parcels", {
      search_text: clean,
      result_limit: 6
    });
    if (error) throw error;
    parcelResults = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Cadastral RPC search unavailable:", err);
  }

  // Also allow normal place/location text searches through Nominatim.
  if (parcelResults.length < 6) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=rw&limit=${Math.max(3, 6 - parcelResults.length)}&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (res.ok) placeResults = await res.json();
    } catch (err) {
      console.warn("Location search failed:", err);
    }
  }

  if (!parcelResults.length && !placeResults.length) {
    resultsEl.innerHTML = `<div class="search-empty">No UPI, parcel, or place found for "${escapeHTML(query)}".</div>`;
    return;
  }

  resultsEl.innerHTML = [
    ...parcelResults.map((p, i) => {
      const label = p.upi || `Parcel ${p.gid}`;
      const loc = [p.cell, p.sector, p.district].filter(Boolean).join(", ");
      return `<div class="search-result" data-type="parcel" data-idx="${i}">
        <span class="sr-icon" style="background:rgba(20,184,166,.15);color:var(--teal);">🧾</span>
        <div><div class="sr-title">${escapeHTML(label)}</div><div class="sr-sub">${escapeHTML(loc || p.land_use || "Cadastral parcel")}</div></div>
      </div>`;
    }),
    ...placeResults.map((p, i) => `<div class="search-result" data-type="place" data-idx="${i}"><span class="sr-icon">📍</span><div><div class="sr-title">${escapeHTML(shortLabel(p.display_name))}</div><div class="sr-sub">${escapeHTML(p.type || "place")}</div></div></div>`)
  ].join("");

  resultsEl.querySelectorAll(".search-result").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.idx);
      if (row.dataset.type === "parcel") {
        const p = parcelResults[idx];
        const lat = Number(p.centroid_lat);
        const lng = Number(p.centroid_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          resultsEl.innerHTML = `<div class="search-empty">Parcel found, but its geometry centroid is unavailable.</div>`;
          return;
        }
        const label = p.upi || `Parcel ${p.gid}`;
        setSelectedLocation(lat, lng, label);
        selectedLocation.parcel = {
          gid: p.gid, upi: p.upi, district: p.district, sector: p.sector,
          cell: p.cell, land_use: p.land_use, area_sqm: p.area_sqm,
          source: p.source, data_date: p.data_date
        };
        if (dashMap) dashMap.setView([lat, lng], 15);
        document.getElementById("mapSearchInput").value = label;
      } else {
        const p = placeResults[idx];
        setSelectedLocation(parseFloat(p.lat), parseFloat(p.lon), shortLabel(p.display_name));
        document.getElementById("mapSearchInput").value = shortLabel(p.display_name);
      }
      resultsEl.classList.remove("open");
    });
  });
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
  window.location.href = "ai-assistant.html";
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
    thinkingEl.textContent = "AI Assistant error: " + (err.message || JSON.stringify(err));
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
