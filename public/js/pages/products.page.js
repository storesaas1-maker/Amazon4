import { request, fetchAllProducts } from '../api.js';
import { productCard } from '../components/product-card.js';
import { mountSiteShell } from '../components/site-shell.js';
import { initSite, state } from './common.js';
import { onEvent } from '../socket-client.js';

mountSiteShell({ active: 'shop' });

const list = document.querySelector('#products');
const form = document.querySelector('#filters');
const sentinel = document.querySelector('#scroll-sentinel');
const resultsSummary = document.querySelector('#results-count-summary');
const chipsBar = document.querySelector('#active-filter-chips');
const sortSelect = document.querySelector('#catalog-sort-select');

let products = [];
let sections = [];
let productsLoading = false;

function extractArray(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.products)) return res.products;
  if (Array.isArray(res?.sections)) return res.sections;
  if (Array.isArray(res?.data?.products)) return res.data.products;
  if (Array.isArray(res?.data?.sections)) return res.data.sections;
  return [];
}

const urlParams = new URLSearchParams(window.location.search);
const initialQuery = urlParams.get('q') || '';
const initialSection = urlParams.get('section') || '';
const initialSort = urlParams.get('sort') || '';
const initialDeal = urlParams.get('deal') || '';

if (initialQuery && document.querySelector('#filter-q-input')) {
  document.querySelector('#filter-q-input').value = initialQuery;
}
if (initialSort && document.querySelector('#filter-sort-input')) {
  document.querySelector('#filter-sort-input').value = initialSort;
  if (sortSelect) sortSelect.value = initialSort;
}
if (initialDeal && document.querySelector('#filter-discount-input')) {
  document.querySelector('#filter-discount-input').value = '10';
  const dealRadio = form?.querySelector('input[name="discount_radio"][value="10"]');
  if (dealRadio) dealRadio.checked = true;
}

function render() {
  if (!form || !list) return;

  const query = new FormData(form);
  const q = String(query.get('q') || '').toLowerCase().trim();
  const section = query.get('section') || '';
  const min = Number(query.get('min') || 0);
  const max = Number(query.get('max') || Infinity);
  const sort = query.get('sort') || (sortSelect ? sortSelect.value : '');
  const ratingFilterVal = query.get('min_rating') || '';
  const minDiscount = Number(query.get('discount_min') || 0);
  const inStockOnly = form.querySelector('input[name="in_stock"]')?.checked ?? false;

  let filtered = products.filter((p) => {
    const matchesSearch =
      !q ||
      `${p.name || ''} ${p.description || ''}`.toLowerCase().includes(q);

    let matchesSection = true;
    if (section) {
      const pSec = p.section;
      if (typeof pSec === 'object' && pSec !== null) {
        matchesSection = String(pSec._id || pSec.id) === section || String(pSec.name) === section;
      } else {
        matchesSection = String(pSec) === section;
      }
    }

    const price = Number(p.final_price ?? p.price);
    const matchesMinPrice = price >= min;
    const matchesMaxPrice = price <= max;

    const discount = Number(p.discount || 0);
    const matchesDiscount = discount >= minDiscount;

    const inStock = Number(p.quantity) > 0;
    const matchesStock = !inStockOnly || inStock;

    const prodReviewsCount = Number(p.reviews_count || (Array.isArray(p.reviews) ? p.reviews.length : 0));
    const prodRating = Number(p.rating || 0);
    let matchesRating = true;

    if (ratingFilterVal === 'has-reviews') {
      matchesRating = prodReviewsCount > 0;
    } else if (ratingFilterVal) {
      const minRating = Number(ratingFilterVal);
      matchesRating = prodReviewsCount > 0 && prodRating >= minRating;
    }

    return (
      matchesSearch &&
      matchesSection &&
      matchesMinPrice &&
      matchesMaxPrice &&
      matchesDiscount &&
      matchesStock &&
      matchesRating
    );
  });

  if (sort === 'price-asc') {
    filtered.sort((a, b) => Number(a.final_price ?? a.price) - Number(b.final_price ?? b.price));
  } else if (sort === 'price-desc') {
    filtered.sort((a, b) => Number(b.final_price ?? b.price) - Number(a.final_price ?? a.price));
  } else if (sort === 'discount') {
    filtered.sort((a, b) => Number(b.discount || 0) - Number(a.discount || 0));
  } else if (sort === 'rating' || sort === 'top-rated') {
    filtered.sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(b.reviews_count || 0) - Number(a.reviews_count || 0)));
  } else if (sort === 'most-reviews') {
    filtered.sort((a, b) => (Number(b.reviews_count || 0) - Number(a.reviews_count || 0)) || (Number(b.rating || 0) - Number(a.rating || 0)));
  } else if (sort === 'bestseller') {
    filtered.sort((a, b) => Number(b.sales_count || 0) - Number(a.sales_count || 0));
  }

  if (resultsSummary) {
    const activeSecObj = sections.find((s) => String(s._id || s.id) === section || String(s.name) === section);
    const title = activeSecObj ? activeSecObj.name : q ? `"${q}"` : 'All Products';
    resultsSummary.innerHTML = `Showing <strong>${filtered.length}</strong> results for <strong>${title}</strong>`;
  }

  renderChips({ q, section, min, max, ratingFilterVal, minDiscount });

  list.replaceChildren();

  if (filtered.length === 0) {
    state(list, 'No products match your current filters. Try removing some filters.', 'empty');
    if (sentinel) sentinel.textContent = '';
  } else {
    filtered.forEach((item) => {
      try {
        const cardEl = productCard(item);
        if (cardEl) list.appendChild(cardEl);
      } catch (err) {
        console.error('Error creating product card:', err);
      }
    });

    if (sentinel) sentinel.textContent = `All matching products loaded (${filtered.length}).`;
  }
}

function renderChips({ q, section, min, max, ratingFilterVal, minDiscount }) {
  if (!chipsBar) return;
  const chips = [];

  if (q) {
    chips.push({
      label: `Search: ${q}`,
      clear: () => {
        const input = document.querySelector('#filter-q-input');
        if (input) input.value = '';
      },
    });
  }

  if (section) {
    const sObj = sections.find((s) => String(s._id || s.id) === section || String(s.name) === section);
    chips.push({
      label: `Category: ${sObj?.name || section}`,
      clear: () => {
        const rad = form.querySelector('input[name="section"][value=""]');
        if (rad) rad.checked = true;
      },
    });
  }

  if (min > 0 || max < Infinity) {
    chips.push({
      label: `Price: ${min.toLocaleString('en-US')} - ${max === Infinity ? 'All' : max.toLocaleString('en-US')} EGP`,
      clear: () => {
        const minIn = document.querySelector('#price-min');
        const maxIn = document.querySelector('#price-max');
        if (minIn) minIn.value = '';
        if (maxIn) maxIn.value = '';
        const allPreset = form.querySelector('input[name="price_preset"][value="all"]');
        if (allPreset) allPreset.checked = true;
      },
    });
  }

  if (ratingFilterVal === 'has-reviews') {
    chips.push({
      label: 'Rated products only',
      clear: () => {
        const rIn = document.querySelector('#filter-rating-input');
        if (rIn) rIn.value = '';
        form.querySelectorAll('input[name="rating_radio"]').forEach((r) => (r.checked = r.value === ''));
      },
    });
  } else if (ratingFilterVal) {
    chips.push({
      label: `${ratingFilterVal} stars & up`,
      clear: () => {
        const rIn = document.querySelector('#filter-rating-input');
        if (rIn) rIn.value = '';
        form.querySelectorAll('input[name="rating_radio"]').forEach((r) => (r.checked = r.value === ''));
      },
    });
  }

  if (minDiscount > 0) {
    chips.push({
      label: `${minDiscount}% off or more`,
      clear: () => {
        const dIn = document.querySelector('#filter-discount-input');
        if (dIn) dIn.value = '';
        form.querySelectorAll('input[name="discount_radio"]').forEach((r) => (r.checked = false));
      },
    });
  }

  if (chips.length === 0) {
    chipsBar.hidden = true;
    chipsBar.innerHTML = '';
    return;
  }

  chipsBar.hidden = false;
  chipsBar.innerHTML = chips
    .map(
      (c, idx) => `
    <span class="filter-chip" data-chip-idx="${idx}">
      <span>${c.label}</span>
      <i class="fa-solid fa-xmark filter-chip-remove" role="button" aria-label="Remove filter"></i>
    </span>`
    )
    .join('');

  chipsBar.querySelectorAll('.filter-chip').forEach((chipEl, idx) => {
    const removeBtn = chipEl.querySelector('.filter-chip-remove');
    if (removeBtn) {
      removeBtn.onclick = () => {
        chips[idx].clear();
        render();
      };
    }
  });
}

async function loadSections() {
  try {
    const res = await request('/api/get_all_sections');
    sections = extractArray(res);
  } catch {
    sections = [];
  }

  const container = document.querySelector('#sidebar-categories-list');
  if (container) {
    const selectedSec = initialSection;
    const items = [
      `
      <label class="filter-item-label">
        <input type="radio" name="section" value="" ${!selectedSec ? 'checked' : ''} />
        <span>All Categories</span>
      </label>
    `,
      ...sections.map(
        (s) => `
      <label class="filter-item-label">
        <input type="radio" name="section" value="${s._id || s.id}" ${selectedSec === String(s._id || s.id) ? 'checked' : ''} />
        <span>${s.name}</span>
      </label>
    `
      ),
    ];
    container.innerHTML = items.join('');
  }
}

function enrichWithRating(product) {
  const reviewsArray = Array.isArray(product.reviews) ? product.reviews : [];
  const reviewsCount = reviewsArray.length;

  let avgRating = 0;
  if (reviewsCount > 0) {
    const withScore = reviewsArray.filter((r) => r && Number(r.rating) > 0);
    if (withScore.length > 0) {
      const sum = withScore.reduce((acc, r) => acc + Number(r.rating), 0);
      avgRating = Number((sum / withScore.length).toFixed(1));
    } else {
      avgRating = 5.0;
    }
  }

  return { ...product, rating: avgRating, reviews_count: reviewsCount };
}

async function loadProducts() {
  if (productsLoading) return;
  productsLoading = true;
  state(list, 'Loading products...', 'loading');

  try {
    const rawData = await fetchAllProducts();
    const listArray = extractArray(rawData);
    products = listArray.map(enrichWithRating);
    render();
  } catch (err) {
    console.error('Error loading products:', err);
    state(list, 'Could not load products from server.', 'error');
  } finally {
    productsLoading = false;
  }
}

function setupEvents() {
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      const sIn = document.querySelector('#filter-sort-input');
      if (sIn) sIn.value = e.target.value;
      render();
    };
  }

  if (form) {
    form.onchange = (e) => {
      if (e.target.name === 'price_preset') {
        const val = e.target.value;
        const minInput = document.querySelector('#price-min');
        const maxInput = document.querySelector('#price-max');
        if (val === 'all') {
          if (minInput) minInput.value = '';
          if (maxInput) maxInput.value = '';
        } else {
          const [pMin, pMax] = val.split('-');
          if (minInput) minInput.value = pMin || '';
          if (maxInput) maxInput.value = pMax === '999999' ? '' : pMax || '';
        }
      }

      if (e.target.name === 'rating_radio') {
        const rIn = document.querySelector('#filter-rating-input');
        if (rIn) rIn.value = e.target.value;
      }

      if (e.target.name === 'discount_radio') {
        const dIn = document.querySelector('#filter-discount-input');
        if (dIn) dIn.value = e.target.value;
      }

      render();
    };
  }

  const applyPriceBtn = document.querySelector('#apply-price-btn');
  if (applyPriceBtn) {
    applyPriceBtn.onclick = () => {
      const allRadio = form.querySelector('input[name="price_preset"][value="all"]');
      if (allRadio) allRadio.checked = false;
      render();
    };
  }

  const clearBtn = document.querySelector('#clear-filters-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      form.reset();
      const qIn = document.querySelector('#filter-q-input');
      const sIn = document.querySelector('#filter-sort-input');
      const rIn = document.querySelector('#filter-rating-input');
      const dIn = document.querySelector('#filter-discount-input');
      if (qIn) qIn.value = '';
      if (sIn) sIn.value = '';
      if (rIn) rIn.value = '';
      if (dIn) dIn.value = '';
      if (sortSelect) sortSelect.value = '';
      render();
    };
  }

  const openMobileBtn = document.querySelector('#open-mobile-filters-btn');
  const closeMobileBtn = document.querySelector('#close-mobile-filters-btn');
  const sidebar = document.querySelector('#catalog-sidebar');

  if (openMobileBtn && sidebar) {
    openMobileBtn.onclick = () => {
      sidebar.classList.add('is-open');
      if (closeMobileBtn) closeMobileBtn.style.display = 'block';
    };
  }
  if (closeMobileBtn && sidebar) {
    closeMobileBtn.onclick = () => {
      sidebar.classList.remove('is-open');
      closeMobileBtn.style.display = 'none';
    };
  }
}

initSite().then(async () => {
  await loadSections();
  await loadProducts();
  setupEvents();

  onEvent('new_review', loadProducts);
  onEvent('new_product', loadProducts);
  onEvent('update_product', loadProducts);
  onEvent('deleted_product', loadProducts);
});
