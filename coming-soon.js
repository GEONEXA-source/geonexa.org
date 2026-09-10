// GeoNEXA AI — Coming Soon page logic
// Requires config.js to be loaded first (it defines `supabaseClient`)

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const feature = params.get("feature");
  if (feature) {
    document.getElementById("featureTitle").textContent = feature;
    document.title = `GeoNEXA AI — ${feature}`;
  }
});
