// GeoNEXA AI — Login logic (rate-limited via secure-login Edge Function)

// ⚠️ Update this to match your actual Supabase project ref if it ever changes.
const SECURE_LOGIN_ENDPOINT = "https://ogwckglzluhjwmucrodb.supabase.co/functions/v1/super-service";

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

    try {
        const res = await fetch(SECURE_LOGIN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: identifier, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (window.hideLoader) hideLoader();
            formStatus.textContent = data.error || "Login failed. Please try again.";
            formStatus.style.color = "#e57373";
            submitBtn.disabled = false;
            submitBtn.textContent = "Login to GeoNEXA →";
            return;
        }

        // The Edge Function did the actual password check with Supabase Auth
        // and returned a real session — apply it to the client SDK so
        // supabaseClient.auth.getSession() works normally from here on.
        const { error: setSessionError } = await supabaseClient.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
        });

        if (setSessionError) {
            if (window.hideLoader) hideLoader();
            formStatus.textContent = "Signed in, but couldn't start your session: " + setSessionError.message;
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

        setTimeout(() => {
            window.location.href = redirectTo;
        }, 1200);

    } catch (err) {
        if (window.hideLoader) hideLoader();
        console.error("Login request failed:", err);
        formStatus.textContent = "Couldn't reach the login service. Check your connection and try again.";
        formStatus.style.color = "#e57373";
        submitBtn.disabled = false;
        submitBtn.textContent = "Login to GeoNEXA →";
    }
});
