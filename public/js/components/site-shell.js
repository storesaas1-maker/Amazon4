import { request, fetchAllProducts } from '../api.js';
import { toast } from '../toast.js';

let cachedProducts = null;
let cachedSections = null;

async function getSearchData() {
  if (!cachedProducts) {
    try {
      cachedProducts = await fetchAllProducts();
    } catch {
      cachedProducts = [];
    }
  }
  if (!cachedSections) {
    try {
      const res = await request('/api/get_all_sections', { silent: true });
      cachedSections = res.data || [];
    } catch {
      cachedSections = [];
    }
  }
  return { products: cachedProducts, sections: cachedSections };
}

export function mountSiteShell({ active = 'home' } = {}) {
  const header = document.querySelector('[data-site-header]');
  const footer = document.querySelector('[data-site-footer]');

  if (header) {
    header.className = 'site-header';
    header.innerHTML = `
      <!-- Desktop Top Header -->
      <div class="header-top">
        <div class="container">
          <!-- Brand Logo -->
          <a class="header-brand" href="/index.html" id="site-logo">
            <i class="fa-solid fa-bag-shopping brand-badge" aria-hidden="true"></i>
            <span data-store-name>Matgari</span>
            <span class="brand-tld">.com</span>
          </a>

          <!-- Deliver To Location -->
          <div class="header-deliver-to" id="header-deliver-info" title="Delivery Location">
            <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
            <div>
              <span class="sub-text">Deliver to</span>
              <span class="main-text">Egypt • Fast & Free</span>
            </div>
          </div>

          <!-- Large Central Search Bar -->
          <div class="header-search">
            <form class="header-search-form" action="/products.html" method="GET" role="search" id="desktop-search-form">
              <div class="search-category-select">
                <select name="section" id="header-category-select" aria-label="Search Categories">
                  <option value="">All Departments</option>
                </select>
              </div>
              <div class="search-input-wrap">
                <input 
                  type="search" 
                  name="q" 
                  id="header-search-input" 
                  placeholder="Search thousands of products and devices..." 
                  autocomplete="off"
                  aria-label="Search products"
                />
                <div class="search-suggestions" id="header-search-suggestions" hidden></div>
              </div>
              <button type="submit" class="search-submit-btn" aria-label="Submit search" id="desktop-search-btn">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              </button>
            </form>
          </div>

          <!-- Right Action Items -->
          <div class="header-actions">
            <!-- Account & Lists Menu -->
            <div class="header-account-wrap" id="header-account-wrapper">
              <a class="header-nav-item" href="/login.html" data-account-link id="header-account-nav">
                <span class="sub-label" data-account-sub>Hello, Sign in</span>
                <span class="main-label" data-account-main>
                  <span data-account>Account & Lists</span>
                  <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
                </span>
              </a>

              <div class="account-flyout" id="account-flyout">
                <div class="flyout-auth-header" data-flyout-guest>
                  <a href="/login.html" class="button btn-accent btn-sm">Sign In</a>
                  <p class="flyout-signup-prompt">New customer? <a href="/register.html">Start here</a></p>
                </div>

                <div class="flyout-col">
                  <h4>Your Lists & Browsing</h4>
                  <a href="/cart.html"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> Shopping Cart</a>
                  <a href="/products.html"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i> All Categories & Products</a>
                  <a href="/products.html?deal=1"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Today's Deals & Savings</a>
                </div>

                <div class="flyout-col" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                  <h4>Your Account & Settings</h4>
                  <a href="/orders.html"><i class="fa-solid fa-box-open" aria-hidden="true"></i> Your Orders & Purchases</a>
                  <a href="/ai-assistant.html"><i class="fa-solid fa-robot" aria-hidden="true"></i> AI Shopping Assistant</a>
                  <div data-staff-links></div>
                  <button type="button" class="flyout-logout-btn" id="logout-btn" hidden>
                    <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Sign Out
                  </button>
                </div>
              </div>
            </div>

            <!-- Returns & Orders -->
            <a class="header-nav-item" href="/orders.html" id="header-orders-nav">
              <span class="sub-label">Returns</span>
              <span class="main-label">& Orders</span>
            </a>

            <!-- Cart Pill / Icon with Counter -->
            <a class="header-nav-item header-cart-link" href="/cart.html" id="header-cart-nav" aria-label="View shopping cart">
              <div class="cart-icon-wrap">
                <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
                <span class="cart-count-badge" data-cart-count>0</span>
              </div>
              <span class="main-label cart-label">Cart</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Mobile Top Bar -->
      <div class="mobile-header-top">
        <button class="subnav-all-btn" type="button" id="mobile-drawer-toggle" aria-label="Open main menu">
          <i class="fa-solid fa-bars" aria-hidden="true"></i>
        </button>

        <a class="header-brand" href="/index.html">
          <i class="fa-solid fa-bag-shopping brand-badge" aria-hidden="true"></i>
          <span data-store-name>Matgari</span>
        </a>

        <div style="display:flex; align-items:center; gap: 8px;">
          <a class="header-nav-item" href="/orders.html" aria-label="Orders">
            <i class="fa-solid fa-box-open" style="font-size: 18px;" aria-hidden="true"></i>
          </a>
          <a class="header-nav-item header-cart-link" href="/cart.html" aria-label="Cart">
            <div class="cart-icon-wrap">
              <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
              <span class="cart-count-badge" data-cart-count>0</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Mobile Search Form -->
      <div class="mobile-header-search">
        <form class="header-search-form" action="/products.html" method="GET" role="search">
          <div class="search-input-wrap">
            <input 
              type="search" 
              name="q" 
              placeholder="Search thousands of products and devices..." 
              autocomplete="off"
              aria-label="Search products"
            />
          </div>
          <button type="submit" class="search-submit-btn" aria-label="Submit search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          </button>
        </form>
      </div>

      <!-- Second Navigation Bar -->
      <nav class="header-subnav" aria-label="Site Navigation">
        <div class="container">
          <!-- All Categories Hamburger Button -->
          <button class="subnav-all-btn" type="button" id="subnav-drawer-toggle" aria-label="Open all departments">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span>All Departments</span>
          </button>

          <!-- Navigation Links -->
          <div class="subnav-links" id="subnav-links-bar">
            <a class="subnav-link ${active === 'deals' ? 'is-active' : ''}" href="/products.html?deal=1">
              <i class="fa-solid fa-bolt" style="color: var(--accent); margin-inline-end: 4px;" aria-hidden="true"></i>
              Today's Deals
            </a>
            <a class="subnav-link ${active === 'shop' ? 'is-active' : ''}" href="/products.html">All Products</a>
            <span id="subnav-dynamic-categories"></span>
            <a class="subnav-link" href="/products.html?sort=top-rated">Top Rated</a>
            <a class="subnav-link" href="/products.html?sort=price-desc">Best Sellers</a>
            <a class="subnav-link ${active === 'ai' ? 'is-active' : ''}" href="/ai-assistant.html">AI Assistant</a>
          </div>

          <div class="subnav-promo">
            <i class="fa-solid fa-truck-fast" aria-hidden="true"></i>
            <span data-banner>Free express shipping and certified warranty across all regions</span>
          </div>
        </div>
      </nav>

      <!-- Off-Canvas Sidebar Drawer for Categories & Navigation -->
      <div class="drawer-backdrop" id="sidebar-drawer-backdrop" aria-hidden="true">
        <div class="sidebar-drawer" role="dialog" aria-modal="true" aria-label="Departments & Navigation">
          <div class="drawer-header">
            <div class="drawer-user-info">
              <i class="fa-solid fa-circle-user" aria-hidden="true"></i>
              <span data-drawer-greeting>Hello, Sign in</span>
            </div>
            <button class="drawer-close-btn" id="drawer-close-btn" type="button" aria-label="Close menu">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          <div class="drawer-body">
            <div class="drawer-section">
              <h3 class="drawer-section-title">Shop by Department</h3>
              <div id="drawer-categories-list">
                <a class="drawer-link-item" href="/products.html">
                  <span>All Available Products</span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </div>
            </div>

            <div class="drawer-section">
              <h3 class="drawer-section-title">Programs & Features</h3>
              <a class="drawer-link-item" href="/products.html?deal=1">
                <span>Today's Deals & Savings</span>
                <i class="fa-solid fa-bolt" style="color: var(--accent);" aria-hidden="true"></i>
              </a>
              <a class="drawer-link-item" href="/products.html?sort=top-rated">
                <span>Top Rated Products</span>
                <i class="fa-solid fa-star" style="color: #FF9900;" aria-hidden="true"></i>
              </a>
              <a class="drawer-link-item" href="/products.html?sort=price-desc">
                <span>Best Selling Products</span>
                <i class="fa-solid fa-fire" style="color: #E67A00;" aria-hidden="true"></i>
              </a>
              <a class="drawer-link-item" href="/ai-assistant.html">
                <span>Consult AI Assistant</span>
                <i class="fa-solid fa-robot" style="color: var(--link);" aria-hidden="true"></i>
              </a>
            </div>

            <div class="drawer-section">
              <h3 class="drawer-section-title">Help & Settings</h3>
              <a class="drawer-link-item" href="/orders.html">
                <span>Your Orders & Shipments</span>
                <i class="fa-solid fa-box-open" aria-hidden="true"></i>
              </a>
              <a class="drawer-link-item" href="/cart.html">
                <span>Shopping Cart</span>
                <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
              </a>
              <a class="drawer-link-item" href="/login.html" data-drawer-account-link>
                <span data-drawer-account-text>Sign In</span>
                <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize Drawer toggling
    const backdrop = header.querySelector('#sidebar-drawer-backdrop');
    const openBtns = header.querySelectorAll('#subnav-drawer-toggle, #mobile-drawer-toggle');
    const closeBtn = header.querySelector('#drawer-close-btn');

    const openDrawer = () => {
      backdrop?.classList.add('is-open');
      backdrop?.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };

    const closeDrawer = () => {
      backdrop?.classList.remove('is-open');
      backdrop?.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    openBtns.forEach((btn) => btn.addEventListener('click', openDrawer));
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDrawer();
    });

    // Populate category dropdown, subnav shortcuts, and drawer
    getSearchData().then(({ sections }) => {
      const select = header.querySelector('#header-category-select');
      const drawerCats = header.querySelector('#drawer-categories-list');
      const subnavDynamic = header.querySelector('#subnav-dynamic-categories');

      if (select && sections.length) {
        sections.forEach((sec) => {
          const opt = document.createElement('option');
          opt.value = sec._id || sec.name;
          opt.textContent = sec.name;
          select.appendChild(opt);
        });
      }

      if (subnavDynamic && sections.length) {
        subnavDynamic.innerHTML = sections
          .slice(0, 5)
          .map(
            (sec) => `
          <a class="subnav-link" href="/products.html?section=${encodeURIComponent(sec._id || sec.name)}">${sec.name}</a>`
          )
          .join('');
      }

      if (drawerCats && sections.length) {
        drawerCats.innerHTML = sections
          .slice(0, 15)
          .map(
            (sec) => `
          <a class="drawer-link-item" href="/products.html?section=${encodeURIComponent(sec._id || sec.name)}">
            <span>${sec.name}</span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </a>`
          )
          .join('');
      }
    });

    // Live search autocomplete suggestions
    const searchInput = header.querySelector('#header-search-input');
    const suggestionsBox = header.querySelector('#header-search-suggestions');

    if (searchInput && suggestionsBox) {
      searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (query.length < 2) {
          suggestionsBox.hidden = true;
          suggestionsBox.innerHTML = '';
          return;
        }

        const { products } = await getSearchData();
        const matches = products.filter(
          (p) =>
            (p.name || '').toLowerCase().includes(query) ||
            (p.section?.name && p.section.name.toLowerCase().includes(query)) ||
            (p.description && p.description.toLowerCase().includes(query))
        ).slice(0, 6);

        if (!matches.length) {
          suggestionsBox.hidden = true;
          return;
        }

        suggestionsBox.innerHTML = matches
          .map(
            (p) => `
          <a class="search-suggestion-item" href="/product.html?id=${encodeURIComponent(p._id)}">
            <div class="suggestion-query">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <span>${p.name}</span>
            </div>
            ${p.section?.name ? `<span class="suggestion-category">${p.section.name}</span>` : ''}
          </a>`
          )
          .join('');
        suggestionsBox.hidden = false;
      });

      // Close suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
          suggestionsBox.hidden = true;
        }
      });
    }

    // Toggle flyout when clicking on user name / account nav in the header
    const accountNav = header.querySelector('#header-account-nav');
    const accountFlyout = header.querySelector('#account-flyout');
    const accountWrap = header.querySelector('#header-account-wrapper');

    if (accountNav && accountFlyout) {
      accountNav.addEventListener('click', (e) => {
        const isGuest = accountFlyout.querySelector('[data-flyout-guest]')?.style.display !== 'none';
        if (!isGuest) {
          e.preventDefault();
          const isOpen = accountFlyout.classList.toggle('is-open');
          accountWrap?.classList.toggle('is-open', isOpen);
          accountNav.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      });

      // Close flyout when clicking outside
      document.addEventListener('click', (e) => {
        if (accountWrap && !accountWrap.contains(e.target)) {
          accountFlyout.classList.remove('is-open');
          accountWrap.classList.remove('is-open');
          accountNav.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Logout button handler in flyout
    const logoutBtn = header.querySelector('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          logoutBtn.disabled = true;
          logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Signing out...';

          const response = await fetch('/api/auth/log_out', {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          });

          const data = await response.json().catch(() => ({}));
          const msg = data?.message || 'You have been signed out successfully.';
          toast(msg, 'success', { title: 'Signed Out' });
        } catch (_) {
          toast('You have been signed out.', 'info', { title: 'Signed Out' });
        } finally {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setTimeout(() => {
            window.location.href = '/login.html';
          }, 650);
        }
      });
    }
  }

  // ------------------------------------------------------------------------
  // Structured Multi-Column Footer
  // ------------------------------------------------------------------------
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML = `
      <!-- Back to top button -->
      <div class="footer-back-to-top" id="footer-back-to-top" role="button" tabindex="0">
        <i class="fa-solid fa-chevron-up" aria-hidden="true" style="margin-inline-end: 6px;"></i>
        Back to top
      </div>

      <!-- Brand and Legal Strip -->
      <div class="footer-brand-strip">
        <div class="container">
          <div class="footer-legal-links">
            <a href="#">Conditions of Use & Sale</a>
            <a href="#">Privacy Notice</a>
            <a href="#">Cookies</a>
            <a href="#">Interest-Based Ads</a>
          </div>
          <div class="footer-copyright">
            © 2026 Matgari.com (Matgari Inc.) — All rights reserved.
          </div>
        </div>
      </div>
    `;

    // Back to top scroll handler
    const backToTop = footer.querySelector('#footer-back-to-top');
    backToTop?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
