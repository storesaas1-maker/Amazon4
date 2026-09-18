import { request, fetchAllProducts } from '../api.js';
import { addItem } from '../cart-store.js';
import { toast } from '../toast.js';
import { mountSiteShell } from '../components/site-shell.js';
import { initSite, money, state } from './common.js';
import { onEvent } from '../socket-client.js';
import { resolveProductImage, setupImgFallback, isValidProductImage } from '../image-helper.js';

mountSiteShell({ active: 'shop' });

const id = new URLSearchParams(location.search).get('id');
const root = document.querySelector('#product-detail-container');
const reviewsList = document.querySelector('#reviews-list');
const breadcrumbName = document.querySelector('#breadcrumb-product-name');

// Header review elements
const overviewScoreEl = document.querySelector('#overview-rating-score');
const overviewStarsEl = document.querySelector('#overview-stars');
const overviewCountEl = document.querySelector('#overview-review-count');
const overviewBarsEl = document.querySelector('#overview-rating-bars');

let loggedInUser = null;

function renderStarsHtml(score) {
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.3 && score - full < 0.8;
  const roundedFull = score - full >= 0.8 ? full + 1 : full;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= (hasHalf ? full : roundedFull)) {
      html += '<i class="fa-solid fa-star"></i>';
    } else if (hasHalf && i === full + 1) {
      html += '<i class="fa-solid fa-star-half-stroke"></i>';
    } else {
      html += '<i class="fa-regular fa-star" style="color: #d1d5db;"></i>';
    }
  }
  return html;
}

function updateReviewSummary(items) {
  const total = items ? items.length : 0;
  let avgScore = 0;

  if (total > 0) {
    const sum = items.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    avgScore = Number((sum / total).toFixed(1));
  }

  if (overviewScoreEl) overviewScoreEl.textContent = total > 0 ? avgScore.toFixed(1) : '0.0';
  if (overviewStarsEl) overviewStarsEl.innerHTML = renderStarsHtml(avgScore);
  if (overviewCountEl) {
    overviewCountEl.textContent = total > 0 ? `Based on ${total} verified customer ratings` : 'No reviews yet';
  }

  if (overviewBarsEl) {
    const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (total > 0) {
      items.forEach((r) => {
        const star = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
        starCounts[star] = (starCounts[star] || 0) + 1;
      });
    }

    const labels = { 5: '5 stars', 4: '4 stars', 3: '3 stars', 2: '2 stars', 1: '1 star' };
    overviewBarsEl.innerHTML = [5, 4, 3, 2, 1]
      .map((num) => {
        const count = starCounts[num] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
          <div class="rating-bar-row">
            <span>${labels[num]}</span>
            <div class="rating-bar-track"><div class="rating-bar-fill" style="width: ${pct}%;"></div></div>
            <span>${pct}%</span>
          </div>
        `;
      })
      .join('');
  }

  const centerStars = document.querySelector('#center-rating-stars');
  const centerScore = document.querySelector('#center-rating-score');
  const centerCount = document.querySelector('#center-rating-count');

  if (centerStars) centerStars.innerHTML = renderStarsHtml(avgScore);
  if (centerScore) centerScore.textContent = total > 0 ? avgScore.toFixed(1) : 'New';
  if (centerCount) {
    centerCount.textContent = total > 0 ? `(${total} ratings)` : '(Be the first to review)';
  }
}

function reviewList(items) {
  if (!reviewsList) return;
  if (!items || !items.length) {
    reviewsList.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--text-secondary); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);">
        <i class="fa-regular fa-comment-dots" style="font-size: 32px; margin-bottom: 10px; display: block; color: var(--text-muted);"></i>
        <strong>No reviews or comments for this product yet.</strong>
      </div>`;
    return;
  }

  reviewsList.replaceChildren(
    ...items.map((r) => {
      const d = document.createElement('article');
      d.className = 'review-item';
      const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
      const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US') : 'Recently';

      d.innerHTML = `
        <div class="review-author" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-user" style="font-size: 24px; color: var(--primary);"></i>
            <span style="font-weight: 700; color: var(--text-primary); font-size: 14px;">${r.user_name || 'Verified Customer'}</span>
          </div>
          <span style="font-size: 12px; color: var(--text-muted);">${dateStr}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div class="rating-stars" style="font-size: 13px;">${renderStarsHtml(rating)}</div>
          <span style="font-size: 12px; font-weight: 700;">${rating} out of 5</span>
          <div class="review-badge-verified" style="margin-left: 6px; font-size: 11px; color: #067D62; font-weight: bold;">
            <i class="fa-solid fa-check"></i> Verified Purchase
          </div>
        </div>
        <p class="review-content" style="font-size: 14px; line-height: 1.6;">${r.content || ''}</p>
      `;
      return d;
    })
  );
}

async function load() {
  if (!id) {
    if (root) {
      root.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; background: #FFF; border: 1px solid #D5D9D9; border-radius: 8px; margin: 20px 0;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 42px; color: #B12704; margin-bottom: 12px;"></i>
          <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">Product ID not found in link</h2>
          <p style="font-size: 13px; color: #565959; margin-bottom: 16px;">Please browse products and select an item to view its details.</p>
          <a href="/products.html" class="button btn-accent" style="display: inline-flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-boxes-stacked"></i> Go to Products Page
          </a>
        </div>
      `;
    }
    return;
  }

  state(root, 'Loading product details...', 'loading');

  try {
    const products = await fetchAllProducts();
    const p = products.find((x) => String(x._id) === String(id) || String(x.id) === String(id));
    if (!p) throw new Error('Product not found');

    if (breadcrumbName) breadcrumbName.textContent = p.name;
    document.title = `${p.name} — Matgari`;

    const price = p.final_price ?? p.price;
    const hasDiscount = Number(p.discount || 0) > 0;
    const sectionName = p.section?.name || 'General Products';
    const sectionId = p.section?._id || '';

    let galleryImages = [];
    if (Array.isArray(p.images) && p.images.length > 0) {
      galleryImages = p.images.filter((img) => isValidProductImage(img));
    } else if (isValidProductImage(p.image)) {
      galleryImages = [p.image.trim()];
    }

    if (galleryImages.length === 0) {
      galleryImages = [resolveProductImage(p)];
    }

    const mainImg = galleryImages[0];

    root.replaceChildren();
    root.innerHTML = `
      <div class="product-detail-layout">
        <!-- Gallery -->
        <div class="product-gallery">
          <div class="gallery-primary-box" id="gallery-main-container" style="background:#FFF; border:1px solid #D5D9D9; border-radius:8px; padding:16px; display:flex; align-items:center; justify-content:center; min-height:360px;">
            <img id="primary-gallery-img" src="${mainImg}" alt="${p.name}" style="max-height:330px; width:auto; max-width:100%; object-fit:contain;" />
          </div>
          
          ${
            galleryImages.length > 1
              ? `
              <div class="gallery-thumbs-row" id="gallery-thumbs" style="display:flex; gap:8px; margin-top:12px; overflow-x:auto; padding-bottom:4px;">
                ${galleryImages
                  .map(
                    (src, idx) => `
                  <div class="gallery-thumb ${idx === 0 ? 'is-active' : ''}" data-src="${src}" style="cursor:pointer; width:64px; height:64px; border:2px solid ${idx === 0 ? '#FF9900' : '#D5D9D9'}; border-radius:6px; padding:2px; background:#FFF; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    <img src="${src}" alt="Image ${idx + 1}" style="width:100%; height:100%; object-fit:contain;" />
                  </div>`
                  )
                  .join('')}
              </div>`
              : ''
          }
          
          <div style="margin-top: 14px; text-align: center;">
            <span class="badge badge-certified" style="padding: 6px 12px; font-size: 13px;">
              <i class="fa-solid fa-shield-halved"></i> 100% Certified Original Product
            </span>
          </div>
        </div>

        <!-- Product info -->
        <div class="product-info-col">
          <h1 class="product-detail-title">${p.name}</h1>
          <div class="product-brand-line">
            Category: <a href="/products.html?section=${encodeURIComponent(sectionId)}">${sectionName}</a>
            • Quality Guarantee: <strong>100% Certified Authentic</strong>
          </div>

          <div class="product-detail-rating">
            <div class="rating-stars" id="center-rating-stars">${renderStarsHtml(Number(p.rating || 0))}</div>
            <span class="rating-score" id="center-rating-score">${Number(p.rating || 0) > 0 ? Number(p.rating).toFixed(1) : 'New'}</span>
            <a href="#reviews-section" id="center-rating-count" style="font-size: 13px; color: var(--link); margin-left: 6px;">
              ${Number(p.reviews_count || 0) > 0 ? `(${p.reviews_count} ratings)` : '(Be the first to review)'}
            </a>
          </div>

          <div class="product-detail-price-box">
            <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
              <span class="detail-price-big">${money(price)}</span>
              ${hasDiscount ? `<del class="detail-price-old">${money(p.price)}</del><span class="badge badge-discount">Save ${p.discount}%</span>` : ''}
            </div>
            <div class="detail-vat-note">All prices include VAT and free shipping.</div>
          </div>

          <div class="inspection-box">
            <h4><i class="fa-solid fa-clipboard-check"></i> Features & Quality Guarantees:</h4>
            <ul class="inspection-grid">
              <li><i class="fa-solid fa-check"></i> 100% Certified original product matching specifications</li>
              <li><i class="fa-solid fa-check"></i> Fast and safe doorstep delivery within 24–48 hours</li>
              <li><i class="fa-solid fa-check"></i> Free 14-day exchange and return guarantee</li>
              <li><i class="fa-solid fa-check"></i> Official tax invoice and dedicated customer support</li>
            </ul>
          </div>

          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Specifications:</h3>
          <table class="specs-table">
            <tbody>
              <tr><th>Category</th><td>${sectionName}</td></tr>
              <tr><th>Product Code</th><td><code>${p._id}</code></td></tr>
              <tr><th>Stock</th><td>${Number(p.quantity) > 0 ? `In Stock (${p.quantity} units)` : 'Out of Stock'}</td></tr>
            </tbody>
          </table>

          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Description:</h3>
          <div style="font-size: 14px; line-height: 1.7; color: var(--text-primary); margin-bottom: 16px;">
            ${p.description || 'No description provided.'}
          </div>
        </div>

        <!-- Buy box -->
        <div class="product-buy-box">
          <div class="buy-box-price">${money(price)}</div>
          <div class="buy-box-delivery">
            <i class="fa-solid fa-truck-fast" style="color: var(--success); margin-right: 4px;"></i>
            <strong>FREE Delivery</strong> to all locations.
          </div>
          <div class="buy-box-stock">
            ${Number(p.quantity) > 0 ? '<i class="fa-solid fa-circle-check"></i> In Stock' : '<i class="fa-solid fa-circle-xmark" style="color: #dc2626;"></i> Out of Stock'}
          </div>
          <div class="buy-box-actions">
            <button class="button btn-accent btn-block" id="detail-add-cart-btn" type="button" ${Number(p.quantity) > 0 ? '' : 'disabled'}>
              <i class="fa-solid fa-cart-shopping"></i> Add to Cart
            </button>
            <button class="button btn-buynow btn-block" id="detail-buy-now-btn" type="button" ${Number(p.quantity) > 0 ? '' : 'disabled'}>
              <i class="fa-solid fa-bolt"></i> Buy Now
            </button>
          </div>
        </div>
      </div>
    `;

    // Image switcher
    const mainImgEl = root.querySelector('#primary-gallery-img');
    setupImgFallback(mainImgEl, p.name);
    const thumbEls = root.querySelectorAll('.gallery-thumb');

    const switchImage = (thumb) => {
      thumbEls.forEach((t) => {
        t.style.borderColor = '#D5D9D9';
        t.classList.remove('is-active');
      });
      thumb.style.borderColor = '#FF9900';
      thumb.classList.add('is-active');
      const newSrc = thumb.getAttribute('data-src');
      if (mainImgEl && newSrc && mainImgEl.getAttribute('src') !== newSrc) {
        mainImgEl.style.opacity = '0';
        window.setTimeout(() => {
          mainImgEl.src = newSrc;
          mainImgEl.style.opacity = '1';
        }, 150);
      }
    };

    thumbEls.forEach((thumb) => {
      thumb.addEventListener('mouseenter', () => switchImage(thumb));
      thumb.addEventListener('click', () => switchImage(thumb));
    });

    const addCartBtn = root.querySelector('#detail-add-cart-btn');
    if (addCartBtn) {
      addCartBtn.onclick = () => {
        if (Number(p.quantity) <= 0) {
          toast(`Cannot add "${p.name}": This item is currently out of stock.`, 'error', {
            title: 'Out of Stock'
          });
          return;
        }

        addItem(p, 1);
        toast(`Added "${p.name}" to your shopping cart!`, 'success', {
          title: 'Added to Cart'
        });

        const origHtml = addCartBtn.innerHTML;
        addCartBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Added to Cart!</span>';
        addCartBtn.classList.add('btn-success');
        setTimeout(() => {
          addCartBtn.innerHTML = origHtml;
          addCartBtn.classList.remove('btn-success');
        }, 1300);
      };
    }

    const buyNowBtn = root.querySelector('#detail-buy-now-btn');
    if (buyNowBtn) {
      buyNowBtn.onclick = () => {
        if (Number(p.quantity) <= 0) {
          toast(`Cannot proceed: "${p.name}" is currently out of stock.`, 'error', {
            title: 'Out of Stock'
          });
          return;
        }

        addItem(p, 1);
        toast(`Proceeding to checkout with "${p.name}"...`, 'info', {
          title: 'Direct Checkout'
        });
        window.location.href = '/cart.html';
      };
    }

    await fetchAndRenderReviews();
  } catch (err) {
    state(root, 'Could not load product details.', 'error');
  }
}

async function fetchAndRenderReviews() {
  if (!id) return;
  try {
    const res = await request(`/api/get_product_reviews?product_id=${encodeURIComponent(id)}`);
    const reviews = res.data || [];
    reviewList(reviews);
    updateReviewSummary(reviews);
  } catch (err) {
    reviewList([]);
    updateReviewSummary([]);
  }
}

async function setupReviewForm() {
  try {
    const authRes = await request('/api/auth/me', { silent: true });
    if (authRes && authRes.authenticated && authRes.user) {
      loggedInUser = authRes.user;
    }
  } catch (e) {
    loggedInUser = null;
  }

  const form = document.querySelector('#review-form');
  const starBtns = document.querySelectorAll('.star-option');
  const ratingInput = document.querySelector('#review-rating-value');
  const ratingLabel = document.querySelector('#star-picker-label');
  const nameField = document.querySelector('#review-name-field');

  const ratingDescriptions = {
    1: '1 star (Poor)',
    2: '2 stars (Fair)',
    3: '3 stars (Good)',
    4: '4 stars (Very Good)',
    5: '5 stars (Excellent)'
  };

  if (loggedInUser && nameField) {
    nameField.innerHTML = `
      <div style="font-size: 13px; color: #0F1111; margin-bottom: 10px; background: #E7F4EE; border: 1px solid #C6F6D5; border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid fa-circle-check" style="color: #067D62; font-size: 15px;"></i>
        <span>Review will be published under your account: <strong style="color: #067D62;">${loggedInUser.name || loggedInUser.email}</strong></span>
      </div>
    `;
  }

  function setStarRating(rating) {
    if (ratingInput) ratingInput.value = rating;
    if (ratingLabel) ratingLabel.textContent = ratingDescriptions[rating] || `${rating} stars`;

    starBtns.forEach((btn) => {
      const val = Number(btn.getAttribute('data-val'));
      if (val <= rating) {
        btn.classList.remove('fa-regular');
        btn.classList.add('fa-solid');
        btn.style.color = '#f59e0b';
      } else {
        btn.classList.remove('fa-solid');
        btn.classList.add('fa-regular');
        btn.style.color = '#d1d5db';
      }
    });
  }

  starBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-val')) || 5;
      setStarRating(val);
    });
  });

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#submit-review-btn');
      const reviewText = form.review_text?.value?.trim();
      const rating = Number(ratingInput?.value) || 5;

      const userName = loggedInUser?.name || form.user_name?.value?.trim() || 'Verified Customer';

      if (!id) {
        toast('Invalid product ID', 'error');
        return;
      }

      if (!reviewText) {
        toast('Please enter your review comments before submitting.', 'error', {
          title: 'Review Text Required'
        });
        form.review_text?.focus();
        return;
      }

      if (rating < 1 || rating > 5) {
        toast('Please select a star rating between 1 and 5 stars.', 'error', {
          title: 'Rating Required'
        });
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        }

        const res = await request('/api/post_review', {
          method: 'POST',
          body: {
            product_id: id,
            review_text: reviewText,
            rating,
            user_name: userName
          },
          silent: true
        });

        if (res && res.success) {
          toast('Your review and rating have been submitted successfully!', 'success', {
            title: 'Review Published'
          });
          form.review_text.value = '';
          setStarRating(5);
          await fetchAndRenderReviews();
        } else {
          toast(res?.message || 'Could not publish your review. Please try again.', 'error', {
            title: 'Submission Failed'
          });
        }
      } catch (err) {
        toast(err.message || 'An error occurred while submitting your review. Please try again.', 'error', {
          title: 'Review Submission Error'
        });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Review & Rating';
        }
      }
    };
  }

  onEvent('new_review', (e) => {
    if (String(e.product_id) === String(id)) {
      fetchAndRenderReviews();
    }
  });
}

initSite().then(async () => {
  await load();
  await setupReviewForm();
});
