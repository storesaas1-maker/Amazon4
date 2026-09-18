import {
  getCart,
  setQuantity,
  removeItem,
  clearCart,
  total,
  reconcileCart,
} from '../cart-store.js';
import { request, fetchAllProducts } from '../api.js';
import { initSite, money, state } from './common.js';
import { toast } from '../toast.js';
import { onEvent } from '../socket-client.js';
import { mountSiteShell } from '../components/site-shell.js';
import { resolveProductImage, setupImgFallback } from '../image-helper.js';

mountSiteShell({ active: 'cart' });

const root = document.querySelector('#cart-items');
const summary = document.querySelector('#cart-total');
const summaryCount = document.querySelector('#summary-items-count');
const subtotalVal = document.querySelector('#summary-subtotal-val');
const finalTotal = document.querySelector('#summary-final-total');
const bottomTotal = document.querySelector('#cart-bottom-total');
const bottomCount = document.querySelector('#cart-items-count-label');
const checkoutBtn = document.querySelector('#checkout-submit-btn');

function render() {
  const items = getCart();
  const totalCount = items.reduce((sum, x) => sum + Number(x.quantity || 1), 0);
  const totalAmount = total();

  if (summaryCount) summaryCount.textContent = String(totalCount);
  if (bottomCount) bottomCount.textContent = String(totalCount);
  if (summary) summary.textContent = money(totalAmount);
  if (subtotalVal) subtotalVal.textContent = money(totalAmount);
  if (finalTotal) finalTotal.textContent = money(totalAmount);
  if (bottomTotal) bottomTotal.textContent = money(totalAmount);

  if (checkoutBtn) {
    checkoutBtn.disabled = items.length === 0;
  }

  if (!items.length) {
    root.replaceChildren();
    root.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon"><i class="fa-solid fa-cart-shopping"></i></div>
        <h2>Your Matgari Shopping Cart is empty</h2>
        <p>You have not added any items to your cart yet. Browse today's deals and featured products.</p>
        <div style="margin-top: 20px;">
          <a class="button btn-accent" href="/products.html">Explore Available Products Now</a>
        </div>
      </div>
    `;
    return;
  }

  root.replaceChildren(
    ...items.map((x) => {
      const row = document.createElement('article');
      row.className = 'cart-item-row';

      const lineTotal = Number(x.price || 0) * Number(x.quantity || 1);
      const itemImage = resolveProductImage(x);

      row.innerHTML = `
        <div class="cart-item-thumb cart-item-img-wrap">
          <img src="${itemImage}" alt="${x.name}" loading="lazy" />
        </div>

        <div class="cart-item-details">
          <a class="cart-item-name" href="/product.html?id=${encodeURIComponent(x.id)}">${x.name}</a>
          <div class="cart-item-stock"><i class="fa-solid fa-check"></i> In Stock • Certified Inspection</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            Eligible for FREE shipping & 90-day warranty included
          </div>

          <div class="cart-item-actions">
            <div class="cart-qty-pill">
              <label for="qty-${x.id}">Qty:</label>
              <select id="qty-${x.id}" class="cart-qty-select" aria-label="Change quantity for ${x.name}">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                  .map(
                    (q) =>
                      `<option value="${q}" ${Number(x.quantity) === q ? 'selected' : ''}>${q}</option>`
                  )
                  .join('')}
              </select>
            </div>
            <button class="cart-action-btn delete-btn" type="button"><i class="fa-solid fa-trash-can"></i> Delete</button>
            <button class="cart-action-btn save-btn" type="button"><i class="fa-regular fa-bookmark"></i> Save for later</button>
            <a class="cart-action-btn" href="/product.html?id=${encodeURIComponent(x.id)}"><i class="fa-regular fa-eye"></i> View product details</a>
          </div>
        </div>

        <div class="cart-item-price-col">
          <div class="cart-item-price">${money(lineTotal)}</div>
          ${Number(x.quantity) > 1 ? `<div class="cart-item-unit-price">(${money(x.price)} each)</div>` : ''}
        </div>
      `;

      // Set fallback error handler for thumbnail
      const imgEl = row.querySelector('img');
      setupImgFallback(imgEl, x.name);

      // Event handlers
      const select = row.querySelector('.cart-qty-select');
      select.onchange = (e) => {
        const newQty = Number(e.target.value);
        setQuantity(x.id, newQty);
        render();
        toast(`Updated quantity for "${x.name || 'Item'}" to ${newQty}`, 'info', {
          title: 'Cart Updated'
        });
      };

      const deleteBtn = row.querySelector('.delete-btn');
      deleteBtn.onclick = () => {
        removeItem(x.id);
        render();
        toast(`Removed "${x.name || 'Item'}" from your cart`, 'info', {
          title: 'Item Removed'
        });
      };

      const saveBtn = row.querySelector('.save-btn');
      saveBtn.onclick = () => {
        removeItem(x.id);
        render();
        toast(`Saved "${x.name || 'Item'}" for later`, 'success', {
          title: 'Saved for Later'
        });
      };

      return row;
    })
  );
}

async function refreshCartPrices() {
  try {
    reconcileCart(await fetchAllProducts());
    render();
  } catch {
    render();
  }
}

initSite().then(async (user) => {
  await refreshCartPrices();
  onEvent('update_product', refreshCartPrices);
  onEvent('deleted_product', refreshCartPrices);

  // Coupon apply button with real verification
  const applyCouponBtn = document.querySelector('#apply-coupon-btn');
  const couponInput = document.querySelector('#coupon-input');
  if (applyCouponBtn && couponInput) {
    applyCouponBtn.onclick = async () => {
      const code = couponInput.value.trim();
      if (!code) {
        toast('Please enter a coupon code before clicking Apply.', 'error', {
          title: 'Coupon Required'
        });
        couponInput.focus();
        return;
      }

      applyCouponBtn.disabled = true;
      const origText = applyCouponBtn.innerHTML;
      applyCouponBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

      try {
        const res = await request('/api/validate_coupon', {
          method: 'POST',
          body: { code },
          silent: true
        });

        toast(res.message || `Promo code "${code.toUpperCase()}" applied successfully!`, 'success', {
          title: 'Coupon Applied'
        });
      } catch (err) {
        toast(err.message || `Coupon code "${code}" is invalid or has expired.`, 'error', {
          title: 'Invalid Coupon'
        });
      } finally {
        applyCouponBtn.disabled = false;
        applyCouponBtn.innerHTML = origText;
      }
    };
  }

  // Checkout submission
  const checkoutForm = document.querySelector('#checkout');
  if (checkoutForm) {
    checkoutForm.onsubmit = async (e) => {
      e.preventDefault();

      if (!user) {
        toast('Please sign in to your account first to complete your checkout.', 'warning', {
          title: 'Sign In Required'
        });
        setTimeout(() => {
          location.href = '/login.html';
        }, 900);
        return;
      }

      const products = getCart()
        .map((item) => ({
          id: item.id || item._id,
          name: item.name,
          price: item.price,
          image: resolveProductImage(item),
          quantity: item.quantity
        }))
        .filter(
          (item) =>
            item.id &&
            Number.isInteger(Number(item.quantity)) &&
            Number(item.quantity) > 0
        );

      if (!products.length) {
        toast('Your shopping cart is empty. Please add items to your cart before proceeding to checkout.', 'error', {
          title: 'Cart is Empty'
        });
        return;
      }

      const submitBtn = checkoutForm.querySelector('button[type="submit"]');
      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Processing Your Order...</span>';
      }

      try {
        const couponVal = e.target.coupon ? e.target.coupon.value.trim() : '';
        const data = await request('/api/order', {
          method: 'POST',
          body: { products, coupon: couponVal || undefined },
          silent: true
        });

        clearCart();
        render();

        const orderNum = data.data?.orderNumber || data.orderNumber || 'Confirmed';
        toast(`Order confirmed successfully! Order reference: #${orderNum}. Redirecting to your orders...`, 'success', {
          title: 'Order Placed',
          duration: 4000
        });

        setTimeout(() => (location.href = '/orders.html'), 1300);
      } catch (err) {
        let reason = err.message || 'An unexpected error occurred while confirming your order.';
        toast(`Could not place order: ${reason}`, 'error', {
          title: 'Checkout Failed'
        });

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    };
  }
});
