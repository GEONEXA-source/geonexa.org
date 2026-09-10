// GeoNEXA AI — Login logic

const loginForm = document.getElementById("loginForm");
const formStatus = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
    formStatus.textContent = "";
    if (window.showLoader) showLoader("Signing you in…");

    // Supabase Auth uses email/password by default.
    // If you want phone-number login too, you'd need Supabase phone auth set up separately.
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: identifier,
        password: password
    });

    if (error) {
        if (window.hideLoader) hideLoader();
        formStatus.textContent = error.message;
        formStatus.style.color = "#e57373";
        submitBtn.disabled = false;
        submitBtn.textContent = "Login to GeoNEXA →";
        return;
    }

    if (window.showLoader) showLoader("Loading your workspace…");

    // Route users to the workspace that matches their role.
    let redirectTo = "dashboard.html";
    try {
        const { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("role,user_type")
            .eq("id", data.user.id)
            .single();

        const role = !profileError && profile ? String(profile.role || profile.user_type || "").toLowerCase() : "";
        if (role === "admin") redirectTo = "admin-panel.html";
        else if (role === "engineer" || role === "surveyor") redirectTo = "engineer-panel.html";
    } catch (lookupErr) {
        console.error("Role lookup failed; opening standard dashboard:", lookupErr);
    }

    formStatus.textContent = "Login successful! ...";
    formStatus.style.color = "#12b8ae";

          
