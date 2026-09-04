// GeoNEXA AI — Signup logic

const signupForm = document.getElementById("signupForm");
const formStatus = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
const passwordError = document.getElementById("passwordError");

signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim();
    const province = document.getElementById("province").value.trim();
    const userType = document.getElementById("userType").value;
    const interest = document.getElementById("interest").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Password match check
    if (password !== confirmPassword) {
        passwordError.style.display = "block";
        return;
    }
    passwordError.style.display = "none";

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";
    formStatus.textContent = "";

    // 1. Create the auth user
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        formStatus.textContent = error.message;
        formStatus.style.color = "#e57373";
        submitBtn.disabled = false;
        submitBtn.textContent = "Create GeoNEXA Account →";
        return;
    }

    const userId = data.user ? data.user.id : null;

    // 2. Insert extra profile fields into a "profiles" table.
    // role is set from the same userType selection so the
    // dashboards' role-based checks actually reflect what the
    // person picked. "admin" is never a valid signup selection —
    // a database trigger also blocks it server-side as a backstop
    // in case that ever changes or gets bypassed.
    if (userId) {
        const { error: profileError } = await supabaseClient
            .from("profiles")
            .insert({
                id: userId,
                full_name: fullName,
                phone: phone,
                province: province,
                user_type: userType,
                role: userType,
                interest: interest
            });

        if (profileError) {
            formStatus.textContent = "Account created, but profile save failed: " + profileError.message;
            formStatus.style.color = "#e57373";
            submitBtn.disabled = false;
            submitBtn.textContent = "Create GeoNEXA Account →";
            return;
        }
    }

    formStatus.textContent = "Account created! Check your email to confirm, then log in.";
    formStatus.style.color = "#12b8ae";
    signupForm.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = "Create GeoNEXA Account →";

    // Optional: redirect to login after a short delay
    setTimeout(() => {
        window.location.href = "login.html";
    }, 2500);
});
