// GeoNEXA AI — Map Explorer logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

let explorerMap = null;
let explorerMarker = null;
let explorerBoundaryLayer = null; // holds a district/sector/cell boundary polygon when one is selected
let currentSelection = null; // { lat, lng, label } or { lat, lng, label, isArea:true }

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

// Removes any marker AND any boundary polygon currently shown, so a new
// selection (point or area) always starts from a clean map.
function clearMapLayers() {
  if (explorerMarker) { explorerMap.removeLayer(explorerMarker); explorerMarker = null; }
  if (explorerBoundaryLayer) { explorerMap.removeLayer(explorerBoundaryLayer); explorerBoundaryLayer = null; }
}

async function selectLocation(lat, lng, knownLabel) {
  currentSelection = { lat, lng, label: knownLabel || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };

  clearMapLayers();
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
    if (window.showLoader) showLoader("Looking up address…");
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
    } finally {
      if (window.hideLoader) hideLoader();
    }
  }

  loadNearbyParcels(lat, lng);
}

// Selects a whole administrative area (district, sector, cell, etc.) by
// drawing its actual boundary polygon instead of just dropping a pin.
// `geojson` comes straight from Nominatim's polygon_geojson=1 response.
function selectAreaBoundary(geojson, lat, lng, label) {
  currentSelection = { lat, lng, label, isArea: true };

  clearMapLayers();
  explorerBoundaryLayer = L.geoJSON(geojson, {
    style: {
      color: "#14b8a6",
      weight: 2,
      fillColor: "#14b8a6",
      fillOpacity: 0.12,
    },
  }).addTo(explorerMap);

  try {
    explorerMap.fitBounds(explorerBoundaryLayer.getBounds(), { padding: [30, 30], maxZoom: 14 });
  } catch (err) {
    // Fallback if bounds are somehow invalid
    explorerMap.setView([lat, lng], 12);
  }

  const panel = document.getElementById("locationPanel");
  const nameEl = document.getElementById("locName");
  const coordsEl = document.getElementById("locCoords");
  panel.classList.add("open");
  nameEl.textContent = label;
  coordsEl.textContent = `Area boundary selected — center ≈ ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  loadNearbyParcels(lat, lng);
}

function clearSelection() {
  currentSelection = null;
  clearMapLayers();
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
  const btn = document.getElementById("searchBtn");
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

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (query.length >= 2) runSearch(query, resultsEl);
    }
  });

  if (btn) {
    btn.addEventListener("click", () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (query.length >= 2) runSearch(query, resultsEl);
    });
  }

  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input && e.target !== btn) resultsEl.classList.remove("open");
  });

  // If we arrived here from another page (e.g. dashboard.html?q=... redirecting
  // to map-explorer.html?q=...), auto-run the search on load.
  const params = new URLSearchParams(window.location.search);
  const incomingQuery = params.get("q");
  if (incomingQuery && incomingQuery.trim().length >= 2) {
    input.value = incomingQuery.trim();
    runSearch(incomingQuery.trim(), resultsEl);
  }
}

async function runSearch(query, resultsEl) {
  resultsEl.innerHTML = `<div class="search-loading">Searching parcels and places…</div>`;
  resultsEl.classList.add("open");
  if (window.showLoader) showLoader("Searching…");

  const clean = query.replace(/[%_]/g, "").trim();
  let parcelResults = [];

  // Search cadastral parcels through the PostGIS RPC. The RPC matches the
  // real cadastral.parcels schema: gid, upi, district, sector, cell,
  // area_sqm, land_use, source, data_date and geom.
  try {
    const { data, error } = await supabaseClient.rpc("search_cadastral_parcels", {
      search_text: clean,
      result_limit: 6
    });
    if (error) throw error;
    parcelResults = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Cadastral RPC search unavailable; falling back to place search.", err);
  }

  const placeResults = [];
  if (parcelResults.length < 6) {
    try {
      // polygon_geojson=1 asks Nominatim for the actual boundary shape
      // (district/sector/cell outline) instead of just a center point.
      // addressdetails=1 helps us label the result type more clearly.
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=rw&polygon_geojson=1&addressdetails=1&limit=${Math.max(3, 6 - parcelResults.length)}&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (res.ok) {
        const places = await res.json();
        placeResults.push(...(places || []));
      }
    } catch (err) {
      console.warn("Place search failed:", err);
    }
  }

  if (window.hideLoader) hideLoader();

  if (!parcelResults.length && !placeResults.length) {
    resultsEl.innerHTML = `<div class="search-empty">No UPI, parcel, or place found for "${escapeHTML(query)}".</div>`;
    return;
  }

  resultsEl.innerHTML = [
    ...parcelResults.map((p, i) => {
      const label = p.upi || `Parcel ${p.gid}`;
      const loc = [p.cell, p.sector, p.district].filter(Boolean).join(", ");
      return `<div class="search-result" data-type="parcel" data-idx="${i}">🧾 <span><b>${escapeHTML(label)}</b><br><small>${escapeHTML(loc || "Cadastral parcel")}</small></span></div>`;
    }),
    ...placeResults.map((p, i) => {
      const isArea = p.geojson && (p.geojson.type === "Polygon" || p.geojson.type === "MultiPolygon");
      const icon = isArea ? "🗺️" : "📍";
      const typeTag = isArea ? ` <small style="opacity:.7;">(boundary)</small>` : "";
      return `<div class="search-result" data-type="place" data-idx="${i}">${icon} ${escapeHTML(shortLabel(p.display_name))}${typeTag}</div>`;
    })
  ].join("");

  resultsEl.querySelectorAll(".search-result").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.idx);
      if (row.dataset.type === "parcel") {
        const p = parcelResults[idx];
        const coords = extractParcelCoords(p);
        if (!coords) {
          resultsEl.innerHTML = `<div class="search-empty">Parcel found, but its map coordinates are not available. Expose the parcel geometry/centroid through Supabase.</div>`;
          return;
        }
        const label = p.upi || `Parcel ${p.gid}`;
        selectLocation(coords.lat, coords.lng, label);
        currentSelection.parcel = {
          gid: p.gid, upi: p.upi, district: p.district,
          sector: p.sector, cell: p.cell, land_use: p.land_use,
          area_sqm: p.area_sqm, source: p.source, data_date: p.data_date
        };
        document.getElementById("searchInput").value = label;
      } else {
        const p = placeResults[idx];
        const lat = parseFloat(p.lat);
        const lng = parseFloat(p.lon);
        const label = shortLabel(p.display_name);
        const isArea = p.geojson && (p.geojson.type === "Polygon" || p.geojson.type === "MultiPolygon");

        if (isArea) {
          // Draw the district/sector/cell boundary and zoom to fit it
          selectAreaBoundary(p.geojson, lat, lng, label);
        } else {
          // Point-only result (e.g. a specific address or landmark)
          selectLocation(lat, lng, label);
        }
        document.getElementById("searchInput").value = label;
      }
      resultsEl.classList.remove("open");
    });
  });
}

function extractParcelCoords(p) {
  if (p.centroid_lat != null && p.centroid_lng != null) {
    return { lat: Number(p.centroid_lat), lng: Number(p.centroid_lng) };
  }
  let g = p.geom;
  if (typeof g === "string") {
    try { g = JSON.parse(g); } catch (_) {}
  }
  if (g && g.type === "Point" && Array.isArray(g.coordinates)) {
    return { lat: Number(g.coordinates[1]), lng: Number(g.coordinates[0]) };
  }
  if (g && g.type === "Feature" && g.geometry) return extractParcelCoords({geom:g.geometry});
  return null;
}

// ---------- Handoff to AI Assistant on the dashboard ----------
function handleAnalyze() {
  if (!currentSelection) return;
  sessionStorage.setItem("geonexa_pending_location", JSON.stringify(currentSelection));
  window.location.href = "ai-assistant.html";
}

function shortLabel(displayName) {
  return displayName.split(",").slice(0, 3).join(",");
}
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
                          }
                 
