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

    // Supabase Auth uses email/password by default.
    // If you want phone-number login too, you'd need Supabase phone auth set up separately.
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: identifier,
        password: password
    });

    if (error) {
        formStatus.textContent = error.message;
        formStatus.style.color = "#e57373";
        submitBtn.disabled = false;
        submitBtn.textContent = "Login to GeoNEXA →";
        return;
    }

    // Figure out where this user belongs based on their role.
    // Defaults to dashboard.html if anything about the role lookup
    // fails, so a broken lookup never locks someone out.
    let redirectTo = "dashboard.html";

    try {
        const { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .single();

        if (!profileError && profile && profile.role === "admin") {
            redirectTo = "admin-dashboard.html";
        }
    } catch (lookupErr) {
        console.error("Role lookup failed, defaulting to index.html:", lookupErr);
    }

    formStatus.textContent = "Login successful! ...";
    formStatus.style.color = "#12b8ae";

    setTimeout(() => {
        window.location.href = redirectTo;
    }, 1200);
});
