// GeoNEXA AI — Login logic
// Rate limiting (max attempts + lockout) is enforced in the database via
// RPC functions — check_login_allowed / record_login_attempt. No Edge
// Function involved, so URL/slug issues can't affect login.

const loginForm = document.getElementById("loginForm");
const formStatus = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

function formatWait(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
    formStatus.textContent = "";
    if (window.showLoader) showLoader("Signing you in…");

    try {
        // 1. Ask the database whether this email is currently locked out.
        const { data: gate, error: gateErr } = await supabaseClient.rpc(
            "check_login_allowed",
            { p_email: identifier }
        );

        if (gateErr) {
            console.error("Rate-limit check failed:", gateErr);
            // Fail open rather than blocking login entirely if the RPC itself errors.
        } else if (gate && gate.allowed === false) {
            if (window.hideLoader) hideLoader();
            formStatus.textContent = `Too many failed attempts. Try again in ${formatWait(gate.retry_after_seconds)}.`;
            formStatus.style.color = "#e57373";
            submitBtn.disabled = false;
            submitBtn.textContent = "Login to GeoNEXA →";
            return;
        }

        // 2. Attempt the actual sign-in.
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: identifier,
            password,
        });

        // 3. Record the outcome for rate limiting (fire-and-forget; don't
        //    block the UI on this).
        supabaseClient.rpc("record_login_attempt", {
            p_email: identifier,
            p_success: !error,
        }).then(({ error: recordErr }) => {
            if (recordErr) console.error("Failed to record login attempt:", recordErr);
        });

        if (error) {
            if (window.hideLoader) hideLoader();
            formStatus.textContent = error.message || "Login failed. Please check your email and password.";
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
        formStatus.textContent = "Something went wrong. Please check your connection and try again.";
        formStatus.style.color = "#e57373";
        submitBtn.disabled = false;
        submitBtn.textContent = "Login to GeoNEXA →";
    }
});
