// GeoNEXA AI — Saved Properties logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  if (hamburgerBtn && sidebar) hamburgerBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

  await loadSaved();
});

async function loadSaved() {
  const listEl = document.getElementById("savedList");
  const subtitleEl = document.getElementById("subtitle");

  try {
    const { data, error } = await supabaseClient
      .from("saved_properties")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      subtitleEl.textContent = "Nothing saved yet";
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">❤</div>
          <p>You haven't saved any properties yet. Browse parcels in Property Analysis and tap "Save" to bookmark them here.</p>
          <a href="property-analysis.html" class="btn-solid-sm" style="text-decoration:none;">Browse Properties →</a>
        </div>`;
      return;
    }

    subtitleEl.textContent = `${data.length} saved propert${data.length === 1 ? "y" : "ies"}`;
    listEl.innerHTML = data.map(rowHTML).join("");
    wireButtons(data);
  } catch (err) {
    console.error("Saved properties load failed:", err);
    subtitleEl.textContent = "Unable to load";
    listEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>Couldn't load saved properties. Make sure the saved_properties table is exposed in Supabase → Settings → API.</p></div>`;
  }
}

function rowHTML(row) {
  const location = [row.cell, row.sector, row.district].filter(Boolean).join(", ") || "Unknown location";
  const date = new Date(row.created_at).toLocaleDateString();

  return `
    <div class="parcel-card" data-id="${row.id}" data-gid="${row.parcel_gid}">
      <div>
        <div class="parcel-title">${escapeHTML(row.upi || "Parcel " + row.parcel_gid)}</div>
        <div class="parcel-sub">${escapeHTML(location)}</div>
        <div class="parcel-saved-date">Saved ${date}</div>
      </div>
      ${row.land_use ? `<span class="land-use-pill">${escapeHTML(row.land_use)}</span>` : ""}
      <div class="parcel-actions">
        <button class="btn-solid-sm analyze-btn" data-gid="${row.parcel_gid}" data-upi="${escapeHTML(row.upi || "")}" data-district="${escapeHTML(row.district || "")}">Analyze with AI →</button>
        <button class="btn-danger remove-btn" data-id="${row.id}">Remove</button>
      </div>
    </div>`;
}

function wireButtons(data) {
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const gid = btn.dataset.gid;
      btn.disabled = true;
      btn.textContent = "Loading location…";
      try {
        const { data: centroid, error } = await supabaseClient.rpc("get_parcel_centroid", { target_gid: Number(gid) });
        if (error) throw error;
        const point = centroid && centroid[0];
        if (!point) throw new Error("No location found for this parcel");

        sessionStorage.setItem("geonexa_pending_location", JSON.stringify({
          lat: point.centroid_lat,
          lng: point.centroid_lng,
          label: btn.dataset.upi || `Parcel in ${btn.dataset.district || "Rwanda"}`,
        }));
        window.location.href = "dashboard.html";
      } catch (err) {
        console.error("Analyze handoff failed:", err);
        btn.disabled = false;
        btn.textContent = "Analyze with AI →";
        alert("Couldn't locate this parcel: " + (err.message || err));
      }
    });
  });

  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this property from your saved list?")) return;
      btn.disabled = true;
      try {
        const { error } = await supabaseClient.from("saved_properties").delete().eq("id", btn.dataset.id);
        if (error) throw error;
        btn.closest(".parcel-card").remove();
        const remaining = document.querySelectorAll(".parcel-card").length;
        document.getElementById("subtitle").textContent = remaining > 0 ? `${remaining} saved propert${remaining === 1 ? "y" : "ies"}` : "Nothing saved yet";
        if (remaining === 0) loadSaved();
      } catch (err) {
        console.error("Remove failed:", err);
        btn.disabled = false;
        alert("Couldn't remove: " + (err.message || err));
      }
    });
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
