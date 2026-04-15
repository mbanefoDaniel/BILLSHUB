// ===== Nefotech - Authentication (API-backed) =====

document.addEventListener('DOMContentLoaded', () => {
    initLoginForm();
    initRegisterForm();
    initPasswordToggles();
    initPasswordStrength();

    // Redirect if already logged in
    if (API.isLoggedIn() && (window.location.pathname.includes('login') || window.location.pathname.includes('register'))) {
        window.location.href = 'dashboard.html';
    }
});

function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitBtn.disabled = true;

        try {
            await API.login(email, password);
            window.location.href = 'dashboard.html';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
            shakeElement(errorEl);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

function initRegisterForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regConfirm').value;
        const agree = document.getElementById('agreeTerms').checked;
        const errorEl = document.getElementById('registerError');
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.style.display = 'block';
            shakeElement(errorEl);
            return;
        }

        if (!agree) {
            errorEl.textContent = 'You must agree to the Terms of Service';
            errorEl.style.display = 'block';
            shakeElement(errorEl);
            return;
        }

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitBtn.disabled = true;

        try {
            await API.register({ name, email, phone, password });
            window.location.href = 'dashboard.html';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = 'block';
            shakeElement(errorEl);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });
}

function initPasswordStrength() {
    const input = document.getElementById('regPassword');
    const indicator = document.getElementById('passwordStrength');
    if (!input || !indicator) return;

    input.addEventListener('input', () => {
        const val = input.value;
        const fill = indicator.querySelector('.strength-fill');
        const text = indicator.querySelector('.strength-text');
        let score = 0;

        if (val.length >= 6) score++;
        if (val.length >= 10) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { width: '0%', color: '#555', label: 'Password strength' },
            { width: '20%', color: '#e17055', label: 'Very weak' },
            { width: '40%', color: '#fdcb6e', label: 'Weak' },
            { width: '60%', color: '#ffeaa7', label: 'Fair' },
            { width: '80%', color: '#00cec9', label: 'Strong' },
            { width: '100%', color: '#00b894', label: 'Very strong' },
        ];

        const level = levels[score];
        fill.style.width = level.width;
        fill.style.background = level.color;
        text.textContent = level.label;
        text.style.color = level.color;
    });
}

function shakeElement(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
}
