// GeoNEXA AI — Map Explorer logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

let explorerMap = null;
let explorerMarker = null;
let currentSelection = null; // { lat, lng, label }

document.addEventListener("DOMContentLoaded", async () => {
  // Auth guard — same pattern as dashboard.js
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  initMap();
  wireSearch();

  document.getElementById("analyzeBtn").addEventListener("click", handleAnalyze);
  document.getElementById("clearBtn").addEventListener("click", clearSelection);
});

// ---------- Map ----------
function initMap() {
  explorerMap = L.map("fullMap").setView([-1.9403, 29.8739], 8); // Rwanda center
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(explorerMap);

  explorerMap.on("click", (e) => selectLocation(e.latlng.lat, e.latlng.lng));
}

async function selectLocation(lat, lng, knownLabel) {
  currentSelection = { lat, lng, label: knownLabel || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };

  if (explorerMarker) explorerMap.removeLayer(explorerMarker);
  explorerMarker = L.marker([lat, lng]).addTo(explorerMap);
  explorerMap.setView([lat, lng], Math.max(explorerMap.getZoom(), 13));

  const panel = document.getElementById("locationPanel");
  const nameEl = document.getElementById("locName");
  const coordsEl = document.getElementById("locCoords");
  panel.classList.add("open");
  coordsEl.textContent = `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
  nameEl.textContent = currentSelection.label;

  if (!knownLabel) {
    nameEl.textContent = "Looking up address…";
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const place = await res.json();
      const label = place && place.display_name ? shortLabel(place.display_name) : currentSelection.label;
      currentSelection.label = label;
      nameEl.textContent = label;
    } catch (err) {
      console.error("Reverse geocode failed:", err);
      nameEl.textContent = currentSelection.label;
    }
  }

  loadNearbyParcels(lat, lng);
}

function clearSelection() {
  currentSelection = null;
  if (explorerMarker) { explorerMap.removeLayer(explorerMarker); explorerMarker = null; }
  document.getElementById("locationPanel").classList.remove("open");
}

// ---------- Nearby parcels (uses the get_nearby_parcels RPC — see SQL migration) ----------
async function loadNearbyParcels(lat, lng) {
  const listEl = document.getElementById("nearbyList");
  listEl.innerHTML = `<div style="padding:6px 0;">Checking nearby parcels…</div>`;

  try {
    const { data, error } = await supabaseClient.rpc("get_nearby_parcels", {
      search_lat: lat,
      search_lng: lng,
      radius_m: 2000,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = `<div style="padding:6px 0;">No parcels recorded within 2km yet.</div>`;
      return;
    }

    listEl.innerHTML = data.slice(0, 5).map((p) => `
      <div class="nearby-row">
        <span>${escapeHTML(p.upi || p.parcel_id || "Parcel")}</span>
        <span>${p.distance_m ? Math.round(p.distance_m) + "m away" : ""}</span>
      </div>`).join("");
  } catch (err) {
    console.error("Nearby parcel lookup failed:", err);
    listEl.innerHTML = `<div style="padding:6px 0;">Parcel lookup unavailable — the get_nearby_parcels function may not be deployed yet.</div>`;
  }
}

// ---------- Search ----------
function wireSearch() {
  const input = document.getElementById("searchInput");
  const resultsEl = document.getElementById("searchResults");
  let debounceTimer = null;

  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 3) {
      resultsEl.classList.remove("open");
      resultsEl.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(() => runSearch(query, resultsEl), 400);
  });

  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) resultsEl.classList.remove("open");
  });
}

async function runSearch(query, resultsEl) {
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
      <div class="search-result" data-idx="${i}">📍 ${escapeHTML(shortLabel(p.display_name))}</div>
    `).join("");

    resultsEl.querySelectorAll(".search-result").forEach((row) => {
      row.addEventListener("click", () => {
        const p = places[Number(row.dataset.idx)];
        selectLocation(parseFloat(p.lat), parseFloat(p.lon), shortLabel(p.display_name));
        resultsEl.classList.remove("open");
        document.getElementById("searchInput").value = shortLabel(p.display_name);
      });
    });
  } catch (err) {
    console.error("Search failed:", err);
    resultsEl.innerHTML = `<div class="search-empty">Search failed. Check your connection and try again.</div>`;
  }
}

// ---------- Handoff to AI Assistant on the dashboard ----------
function handleAnalyze() {
  if (!currentSelection) return;
  sessionStorage.setItem("geonexa_pending_location", JSON.stringify(currentSelection));
  window.location.href = "dashboard.html";
}

function shortLabel(displayName) {
  return displayName.split(",").slice(0, 3).join(",");
}
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
