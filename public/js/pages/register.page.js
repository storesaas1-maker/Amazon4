import { request } from '../api.js';
import { currentUser, destinations } from '../auth-guard.js';
import { initTheme } from '../theme-engine.js';
import { toast } from '../toast.js';

initTheme();

const form = document.querySelector('#register-form');
const submitBtn = form?.querySelector('button[type="submit"]');

if (form) {
  form.onsubmit = async (e) => {
    e.preventDefault();

    const f = new FormData(form);
    const body = Object.fromEntries(f);

    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const password = body.password || '';

    const phone_number = (body.phone_number || '').trim();
    const whatsApp_number = (body.whatsApp_number || '').trim();
    const GPS_URL = (body.GPS_URL || '').trim();

    // Field-level checks
    if (!name) {
      toast('Please enter your full name.', 'error', {
        title: 'Name Required'
      });
      form.name?.focus();
      return;
    }

    if (!email) {
      toast('Please enter your email address.', 'error', {
        title: 'Email Required'
      });
      form.email?.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast(
        'Please enter a valid email address (e.g. name@example.com).',
        'error',
        {
          title: 'Invalid Email Format'
        }
      );
      form.email?.focus();
      return;
    }

    if (!password) {
      toast('Please enter a password for your account.', 'error', {
        title: 'Password Required'
      });
      form.password?.focus();
      return;
    }

    if (password.length < 8) {
      toast(
        'Password must be at least 8 characters long for account security.',
        'error',
        {
          title: 'Password Too Short'
        }
      );
      form.password?.focus();
      return;
    }

    if (!phone_number) {
      toast('Please enter your delivery phone number.', 'error', {
        title: 'Phone Number Required'
      });
      form.phone_number?.focus();
      return;
    }

    if (!whatsApp_number) {
      toast('Please enter your WhatsApp number.', 'error', {
        title: 'WhatsApp Number Required'
      });
      form.whatsApp_number?.focus();
      return;
    }

    if (!GPS_URL) {
      toast('Please enter your delivery location or detailed address.', 'error', {
        title: 'Delivery Location Required'
      });
      form.GPS_URL?.focus();
      return;
    }

    // Active progress
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> <span>Creating Account...</span>';
    }

    try {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          name,
          email,
          password,
          phone_number,
          whatsApp_number,
          GPS_URL
        },
        silent: true
      });

      const user = res?.user || (await currentUser());
      const displayName = user?.name || name;

      toast(
        `Account created successfully! Welcome to Matgari, ${displayName}.`,
        'success',
        {
          title: 'Registration Successful',
          duration: 3500
        }
      );

      setTimeout(() => {
        location.replace(
          destinations[user?.role] || '/index.html'
        );
      }, 750);
    } catch (err) {
      let cause = err.message || 'Unable to create account.';

      if (cause.toLowerCase().includes('already registered')) {
        cause =
          'This email address is already registered. Please sign in or use a different email.';
      }

      toast(cause, 'error', {
        title: 'Registration Failed'
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create your Matgari account';
      }
    }
  };
}