import { getCart } from '../cart-store.js';
import { currentUser } from '../auth-guard.js';
import { initTheme } from '../theme-engine.js';
import { joinRooms } from '../socket-client.js';
import { toast } from '../toast.js';

export async function performLogout() {
  try {
    const res = await fetch('/api/auth/log_out', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json().catch(() => ({}));
    const message = data?.message || 'Logged out successfully';
    toast(message, 'success');
  } catch (_) {
    toast('Signed out', 'info');
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 500);
  }
}

export async function initSite() {
  await initTheme();

  // Cart counter sync
  const updateCartCount = () => {
    const total = getCart().reduce((sum, item) => sum + (item.quantity || 1), 0);
    document.querySelectorAll('[data-cart-count]').forEach((node) => {
      node.textContent = String(total);
    });
  };
  updateCartCount();
  window.addEventListener('cartchange', updateCartCount);

  // User auth state sync
  const user = await currentUser();
  if (user) joinRooms(user.role);

  // Sync account links & greetings
  document.querySelectorAll('[data-account]').forEach((n) => {
    n.textContent = user ? user.name : 'Account & Lists';
  });

  document.querySelectorAll('[data-account-sub]').forEach((n) => {
    n.textContent = user ? `Hello, ${user.name}` : 'Hello, Sign in';
  });

  // When user is logged in, clicking their name in the header toggles the account dropdown
  document.querySelectorAll('[data-account-link]').forEach((n) => {
    if (user) {
      n.setAttribute('href', 'javascript:void(0)');
      n.setAttribute('role', 'button');
      n.setAttribute('aria-haspopup', 'true');
      n.onclick = (e) => {
        e.preventDefault();
        const flyout = document.getElementById('account-flyout');
        const wrap = document.getElementById('header-account-wrapper');
        const isOpen = flyout?.classList.toggle('is-open');
        wrap?.classList.toggle('is-open', Boolean(isOpen));
        n.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      };
    } else {
      n.setAttribute('href', '/login.html');
      n.removeAttribute('role');
      n.removeAttribute('aria-haspopup');
      n.onclick = null;
    }
  });

  document.querySelectorAll('[data-drawer-greeting]').forEach((n) => {
    n.textContent = user ? `Hello, ${user.name}` : 'Hello, Sign in';
  });

  document.querySelectorAll('[data-drawer-account-text]').forEach((n) => {
    n.textContent = user ? 'Sign Out' : 'Sign In';
  });

  document.querySelectorAll('[data-drawer-account-link]').forEach((n) => {
    if (user) {
      n.href = '#';
      n.onclick = async (e) => {
        e.preventDefault();
        await performLogout();
      };
    } else {
      n.href = '/login.html';
      n.onclick = null;
    }
  });

  // Account Flyout guest header vs logged in
  document.querySelectorAll('[data-flyout-guest]').forEach((n) => {
    n.style.display = user ? 'none' : 'block';
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.hidden = !user;
    if (user) {
      logoutBtn.onclick = async (e) => {
        e.preventDefault();
        logoutBtn.disabled = true;
        logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Signing out...';
        await performLogout();
      };
    }
  }

  // Staff / Admin dashboard links
  const staff = user?.role === 'admin' || user?.role === 'super_admin';
  const staffTarget = user?.role === 'super_admin' ? '/super-admin.html' : '/admin.html';

  document.querySelectorAll('[data-staff-links]').forEach((container) => {
    if (staff) {
      container.innerHTML = `
        <a href="${staffTarget}" style="color: var(--accent-hover); font-weight: 700;">
          <i class="fa-solid fa-gauge-high" aria-hidden="true"></i> Admin Dashboard
        </a>`;
    } else {
      container.innerHTML = '';
    }
  });

  return user;
}

export const state = (target, text, kind = 'loading') => {
  if (!target) return;
  target.replaceChildren();
  const node = document.createElement('div');
  if (kind === 'loading') {
    node.className = 'empty-state-box';
    node.innerHTML = `
      <div class="empty-state-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
      <p style="font-size: 15px; font-weight: 600;">${text}</p>
    `;
  } else if (kind === 'empty') {
    node.className = 'empty-state-box';
    node.innerHTML = `
      <div class="empty-state-icon"><i class="fa-solid fa-box-open"></i></div>
      <h2>No items found</h2>
      <p>${text}</p>
    `;
  } else {
    node.className = 'empty-state-box';
    node.innerHTML = `
      <div class="empty-state-icon" style="color: var(--error);"><i class="fa-solid fa-circle-exclamation"></i></div>
      <h2>An error occurred</h2>
      <p>${text}</p>
    `;
  }
  target.append(node);
};

export const money = (value) => {
  const num = Number(value || 0);
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} EGP`;
};
