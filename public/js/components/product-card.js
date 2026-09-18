import { money } from '../pages/common.js';
import { addItem } from '../cart-store.js';
import { toast } from '../toast.js';
import { resolveProductImage, setupImgFallback, isValidProductImage } from '../image-helper.js';

function renderCardStars(score) {
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

export function productCard(p) {
  const card = document.createElement('article');
  card.className = 'product-card';

  const productId = p._id || p.id;
  const price = Number(p.final_price ?? p.price);
  const originalPrice = Number(p.price);
  const hasDiscount = Number(p.discount || 0) > 0;
  const inStock = Number(p.quantity) > 0;
  const sectionName = p.section?.name || 'General';

  // Extract primary product image or smart fallback based on category
  const rawImages = Array.isArray(p.images) && p.images.length > 0 
    ? p.images.filter(img => isValidProductImage(img)) 
    : (isValidProductImage(p.image) ? [p.image.trim()] : []);

  const imgSrc = rawImages[0] || resolveProductImage(p);

  // Compute rating and review counts
  const reviewsCount = Number(p.reviews_count || (Array.isArray(p.reviews) ? p.reviews.length : 0));
  const rating = Number(p.rating || 0);

  card.innerHTML = `
    <!-- Card top badges -->
    <div class="card-top-badges">
      ${hasDiscount ? `<span class="badge badge-discount">${p.discount}% OFF</span>` : '<span></span>'}
      ${!inStock ? `<span class="badge" style="background:#B12704; color:#FFF;">Out of Stock</span>` : '<span></span>'}
    </div>

    <!-- Image wrapper -->
    <a href="/product.html?id=${productId}" class="product-image-wrap" aria-label="${p.name}" style="position: relative;">
      <img 
        class="product-image"
        src="${imgSrc}" 
        alt="${p.name || 'Product Image'}" 
        loading="lazy"
      />

      <!-- Image counter badge -->
      ${rawImages.length > 1 ? `
        <span class="product-card-images-count" style="position: absolute; bottom: 8px; right: 8px; background: rgba(15, 17, 17, 0.75); color: #FFF; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(2px);">
          <i class="fa-solid fa-images" style="color: #FF9900;"></i> ${rawImages.length}
        </span>
      ` : ''}
    </a>

    <!-- Category and title -->
    <span class="product-card-category">${sectionName}</span>

    <h3>
      <a href="/product.html?id=${productId}" title="${p.name}">${p.name || 'Untitled Product'}</a>
    </h3>

    <!-- Star rating & review count -->
    <div class="card-rating">
      <div class="rating-stars">
        ${renderCardStars(rating)}
      </div>
      <span class="rating-count">(${reviewsCount})</span>
    </div>

    <!-- Pricing -->
    <div class="card-price-box">
      <strong class="price-main">${money(price)}</strong>
      ${hasDiscount ? `<del class="price-old">${money(originalPrice)}</del>` : ''}
    </div>

    <!-- Quick Add to Cart button -->
    <button 
      type="button" 
      class="button btn-accent btn-sm btn-block product-card-btn" 
      ${inStock ? '' : 'disabled style="opacity: 0.6; cursor: not-allowed;"'}
    >
      <i class="fa-solid fa-cart-plus"></i>
      <span>${inStock ? 'Add to Cart' : 'Out of Stock'}</span>
    </button>
  `;

  // Fallback image handling
  setupImgFallback(card.querySelector('img'), p.name);

  // Add to cart event handler
  const addBtn = card.querySelector('.product-card-btn');
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!inStock) {
        toast(`Cannot add "${p.name || 'Product'}": This item is currently out of stock.`, 'error', {
          title: 'Out of Stock'
        });
        return;
      }

      addItem(p, 1);
      toast(`Added "${p.name || 'Product'}" to your cart!`, 'success', {
        title: 'Cart Updated'
      });

      // Visual button feedback
      const originalHtml = addBtn.innerHTML;
      addBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Added!</span>';
      addBtn.classList.add('btn-success');
      setTimeout(() => {
        addBtn.innerHTML = originalHtml;
        addBtn.classList.remove('btn-success');
      }, 1200);
    };
  }

  return card;
}
