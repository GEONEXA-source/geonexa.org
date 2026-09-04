// GeoNEXA AI — Property Analysis logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

let savedGids = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

  document.getElementById("filterBtn").addEventListener("click", () => loadParcels());
  document.getElementById("districtFilter").addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadParcels();
  });

  await loadSavedGids();
  await loadParcels();
});

async function loadSavedGids() {
  try {
    const { data, error } = await supabaseClient.from("saved_properties").select("parcel_gid");
    if (error) throw error;
    savedGids = new Set((data || []).map((r) => r.parcel_gid));
  } catch (err) {
    console.error("Could not load saved properties:", err);
  }
}

async function loadParcels() {
  const listEl = document.getElementById("parcelList");
  const subtitleEl = document.getElementById("resultsSubtitle");
  const district = document.getElementById("districtFilter").value.trim() || null;

  listEl.innerHTML = `<div class="empty-state"><p>Searching…</p></div>`;

  try {
    const { data, error } = await supabaseClient.rpc("list_parcels_with_centroid", {
      search_district: district,
      result_limit: 30,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      subtitleEl.textContent = "No parcels found";
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>${district ? `No parcels found in "${escapeHTML(district)}".` : "No parcels in the database yet."}</p></div>`;
      return;
    }

    subtitleEl.textContent = `${data.length} parcel${data.length === 1 ? "" : "s"} found`;
    listEl.innerHTML = data.map(parcelCardHTML).join("");
    wireCardButtons(data);
  } catch (err) {
    console.error("Parcel load failed:", err);
    subtitleEl.textContent = "Unable to load parcels";
    listEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>Couldn't load parcels. Make sure list_parcels_with_centroid is deployed and the cadastral schema is exposed.</p></div>`;
  }
}

function parcelCardHTML(p) {
  const isSaved = savedGids.has(p.gid);
  const location = [p.cell, p.sector, p.district].filter(Boolean).join(", ") || "Unknown location";

  return `
    <div class="parcel-card" data-gid="${p.gid}">
      <div class="parcel-head">
        <div>
          <div class="parcel-title">${escapeHTML(p.upi || "Parcel " + p.gid)}</div>
          <div class="parcel-sub">${escapeHTML(location)}</div>
        </div>
        ${p.land_use ? `<span class="land-use-pill">${escapeHTML(p.land_use)}</span>` : ""}
      </div>
      <div class="parcel-meta">
        ${p.area_sqm ? `<div><span>Area</span><b>${Number(p.area_sqm).toLocaleString()} m²</b></div>` : ""}
        <div><span>Location</span><b>${p.centroid_lat.toFixed(4)}, ${p.centroid_lng.toFixed(4)}</b></div>
      </div>
      <div class="parcel-actions">
        <button class="btn-solid-sm analyze-btn" data-gid="${p.gid}">Analyze with AI →</button>
        <button class="btn-outline save-btn" data-gid="${p.gid}" ${isSaved ? "disabled" : ""}>${isSaved ? "✓ Saved" : "♡ Save"}</button>
      </div>
    </div>`;
}

function wireCardButtons(data) {
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = data.find((row) => String(row.gid) === btn.dataset.gid);
      if (!p) return;
      sessionStorage.setItem("geonexa_pending_location", JSON.stringify({
        lat: p.centroid_lat,
        lng: p.centroid_lng,
        label: p.upi || `Parcel in ${p.district || "Rwanda"}`,
      }));
      window.location.href = "dashboard.html";
    });
  });

  document.querySelectorAll(".save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const p = data.find((row) => String(row.gid) === btn.dataset.gid);
      if (!p) return;
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const { error } = await supabaseClient.from("saved_properties").insert({
          user_id: session.user.id,
          parcel_gid: p.gid,
          upi: p.upi,
          district: p.district,
          sector: p.sector,
          cell: p.cell,
          land_use: p.land_use,
        });
        if (error) throw error;
        savedGids.add(p.gid);
        btn.textContent = "✓ Saved";
      } catch (err) {
        console.error("Save failed:", err);
        btn.disabled = false;
        btn.textContent = "♡ Save";
        alert("Couldn't save this property: " + (err.message || err));
      }
    });
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
