import { request } from '../api.js';
import { onEvent } from '../socket-client.js';
import { productCard } from '../components/product-card.js';
import { mountSiteShell } from '../components/site-shell.js';
import { initSite, state } from './common.js';

// Mount header and footer shell
mountSiteShell({ active: 'home' });

// Homepage grid containers
const featuredGrid = document.querySelector('#featured');
const topRatedGrid = document.querySelector('#top-rated-grid');

// Render skeleton loaders
function renderSkeletons(container, count = 4) {
  if (!container) return;
  container.innerHTML = Array(count)
    .fill(0)
    .map(
      () => `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text short"></div>
        <div class="skeleton-text price"></div>
      </div>`
    )
    .join('');
}

// Safely extract arrays from response objects
function extractArray(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.products)) return res.products;
  if (Array.isArray(res?.data?.products)) return res.data.products;
  return [];
}

// Fetch and render products with computed ratings
async function loadProducts() {
  renderSkeletons(topRatedGrid, 4);
  renderSkeletons(featuredGrid, 4);

  try {
    // Fetch products and reviews in parallel
    const [productsRes, reviewsRes] = await Promise.allSettled([
      request('/api/get_products'),
      request('/api/get_product_reviews')
    ]);

    const rawProducts = productsRes.status === 'fulfilled' ? extractArray(productsRes.value) : [];
    const rawReviews = reviewsRes.status === 'fulfilled' ? extractArray(reviewsRes.value) : [];

    if (!rawProducts.length) {
      if (topRatedGrid) state(topRatedGrid, 'No products currently available in the store.', 'empty');
      if (featuredGrid) state(featuredGrid, 'No products currently available.', 'empty');
      return;
    }

    // Merge review calculations for each product
    const enrichedProducts = rawProducts.map((prod) => {
      const pid = String(prod._id || prod.id || '');
      const prodReviews = rawReviews.filter((r) => String(r.product_id) === pid);
      
      const reviewsCount = Number(prod.reviews_count ?? prodReviews.length);
      
      let avgRating = Number(prod.rating || 0);
      if (avgRating <= 0 && prodReviews.length > 0) {
        const sum = prodReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
        avgRating = Number((sum / prodReviews.length).toFixed(1));
      }

      return {
        ...prod,
        rating: avgRating,
        reviews_count: reviewsCount
      };
    });

    // 1. Top rated products
    if (topRatedGrid) {
      const reviewedOnly = enrichedProducts
        .filter((p) => Number(p.reviews_count || 0) > 0 && Number(p.rating || 0) > 0)
        .sort((a, b) => {
          const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return Number(b.reviews_count || 0) - Number(a.reviews_count || 0);
        });

      if (reviewedOnly.length > 0) {
        topRatedGrid.replaceChildren(...reviewedOnly.slice(0, 8).map(productCard));
      } else {
        state(topRatedGrid, 'No customer reviews or ratings yet.', 'empty');
      }
    }

    // 2. Featured / New arrivals
    if (featuredGrid) {
      const latest = [...enrichedProducts].reverse().slice(0, 8);
      if (latest.length > 0) {
        featuredGrid.replaceChildren(...latest.map(productCard));
      } else {
        state(featuredGrid, 'No recently added products found.', 'empty');
      }
    }
  } catch (err) {
    console.error('Failed to load products:', err);
    if (topRatedGrid) state(topRatedGrid, 'Failed to load products. Please try again later.', 'error');
    if (featuredGrid) state(featuredGrid, 'Failed to load products. Please try again later.', 'error');
  }
}

// Initialize page and listen for live updates
initSite().then(() => {
  loadProducts();

  // Real-time event updates
  onEvent('new_product', loadProducts);
  onEvent('update_product', loadProducts);
  onEvent('deleted_product', loadProducts);
  onEvent('new_review', loadProducts);
});
