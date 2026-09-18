import { request } from '../api.js';
import { currentUser, destinations } from '../auth-guard.js';
import { initTheme } from '../theme-engine.js';
import { toast } from '../toast.js';

initTheme();

const form = document.querySelector('#login-form');
const submitBtn = document.querySelector('#login-submit-btn');

if (form) {
  form.onsubmit = async (e) => {
    e.preventDefault();

    const email = (form.email?.value || '').trim();
    const password = form.password?.value || '';

    // Field-level validation with clear guidance
    if (!email) {
      toast('Please enter your email address.', 'error', { title: 'Email Required' });
      form.email?.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Please enter a valid email address (e.g. name@example.com).', 'error', { title: 'Invalid Email Format' });
      form.email?.focus();
      return;
    }

    if (!password) {
      toast('Please enter your password.', 'error', { title: 'Password Required' });
      form.password?.focus();
      return;
    }

    if (password.length < 8) {
      toast('Password must be at least 8 characters long.', 'error', { title: 'Password Too Short' });
      form.password?.focus();
      return;
    }

    // Indicate active progress
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Signing In...</span>';
    }

    try {
      const res = await request('/api/auth/log_in', {
        method: 'POST',
        body: { email, password },
        silent: true
      });

      const user = res?.user || (await currentUser());
      const displayName = user?.name || email.split('@')[0];

      toast(`Welcome back, ${displayName}! You have signed in successfully.`, 'success', {
        title: 'Sign In Successful',
        duration: 3500
      });

      setTimeout(() => {
        location.replace(destinations[user?.role] || '/index.html');
      }, 700);
    } catch (err) {
      let cause = err.message || 'Unable to sign in.';
      if (err.status === 401 || cause.toLowerCase().includes('invalid')) {
        cause = 'Incorrect email or password. Please verify your credentials and try again.';
      }

      toast(cause, 'error', { title: 'Sign In Failed' });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In';
      }
    }
  };
}
