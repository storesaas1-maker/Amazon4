import { request } from '../api.js';
import { checkAuth } from '../auth-guard.js';
import { statusBadge } from '../components/status-badge.js';
import { onEvent, joinRooms } from '../socket-client.js';
import { initSite, state, money } from './common.js';
import { mountSiteShell } from '../components/site-shell.js';
import { addItem } from '../cart-store.js';
import { toast } from '../toast.js';
import { resolveProductImage, setupImgFallback } from '../image-helper.js';

mountSiteShell({ active: 'orders' });

const root = document.querySelector('#orders');
let allOrders = [];
let activeTab = 'all';

function getStatusStep(status) {
  switch (status) {
    case 'new':
    case 'pending':
    case 'pending_payment':
      return 1;
    case 'confirmed':
    case 'processing':
      return 2;
    case 'shipped':
    case 'out_for_delivery':
      return 3;
    case 'delivered':
    case 'completed':
      return 4;
    default:
      return 1;
  }
}

function getStatusTitle(status) {
  switch (status) {
    case 'new':
    case 'pending':
      return 'Your order has been received and is under review';
    case 'confirmed':
    case 'processing':
      return 'Your order has been confirmed and is being prepared and packed at the warehouse';
    case 'shipped':
    case 'out_for_delivery':
      return 'Out for shipment and delivery with Matgari Express courier';
    case 'delivered':
    case 'completed':
      return 'Shipment delivered successfully';
    case 'cancelled':
      return 'Order cancelled';
    default:
      return 'Your order is being tracked';
  }
}

function showInvoiceModal(order) {
  const existing = document.querySelector('#invoice-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'invoice-modal';
  modal.className = 'invoice-modal-backdrop';

  const dateStr = order.created_at || order.createdAt
    ? new Date(order.created_at || order.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Today';

  const items = Array.isArray(order.products) ? order.products : [];

  modal.innerHTML = `
    <div class="invoice-modal-dialog">
      <div class="invoice-modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <i class="fa-solid fa-file-invoice-dollar" style="color: #FF9900; font-size: 20px;"></i>
          <h3 style="margin: 0; font-size: 16px; font-weight: 800;">Official Tax Invoice • #${order.orderNumber || order._id}</h3>
        </div>
        <button type="button" class="btn-close-modal" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #64748B;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="invoice-modal-body">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 14px; margin-bottom: 14px;">
          <div>
            <strong style="font-size: 15px; color: #0F172A;">Matgari — Comprehensive Shopping Platform</strong>
            <p style="margin: 4px 0 0; color: #64748B;">Tax ID: 300984729100003</p>
            <p style="margin: 2px 0 0; color: #64748B;">Invoice Date: ${dateStr}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-weight: 700; color: #0F172A;">Customer: ${order.user_name || order.user?.name || 'Valued Customer'}</p>
            <p style="margin: 2px 0 0; color: #64748B;">${order.user_email || ''}</p>
            <p style="margin: 2px 0 0; color: #067D62; font-weight: 700;">Payment Status: Completed Successfully</p>
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Product</th>
              <th style="text-align: center;">Quantity</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((it) => {
                const itemImages = Array.isArray(it.images) && it.images.length
                  ? it.images
                  : (it.product && Array.isArray(it.product.images) ? it.product.images : []);
                const img = resolveProductImage({ ...it, images: itemImages });
                const price = Number(it.price) || 0;
                const qty = Number(it.quantity) || 1;
                return `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <img src="${img}" alt="" style="width: 40px; height: 40px; object-fit: contain; border-radius: 4px; border: 1px solid #E2E8F0;" />
                      <span style="font-weight: 600;">${it.name || 'Original Product'}</span>
                    </div>
                  </td>
                  <td style="text-align: center; font-weight: 700;">${qty}</td>
                  <td style="text-align: right;">${money(price)}</td>
                  <td style="text-align: right; font-weight: 700;">${money(price * qty)}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>

        <div style="margin-left: auto; width: 240px; border-top: 1px solid #CBD5E1; padding-top: 10px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748B;">Subtotal:</span>
            <span>${money(order.total_price)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748B;">Shipping Fee:</span>
            <span style="color: #067D62; font-weight: 700;">FREE</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #0F172A; border-top: 1px solid #E2E8F0; padding-top: 6px;">
            <span>Total Amount:</span>
            <span style="color: #B12704;">${money(order.total_price)}</span>
          </div>
        </div>
      </div>
      <div style="padding: 12px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; color: #64748B;">Thank you for shopping with us at Matgari</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="button btn-secondary btn-sm btn-print">
            <i class="fa-solid fa-print"></i> Print Invoice
          </button>
          <button type="button" class="button btn-accent btn-sm btn-close">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('.btn-close-modal').onclick = closeModal;
  modal.querySelector('.btn-close').onclick = closeModal;
  modal.querySelector('.btn-print').onclick = () => window.print();
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
}

function renderOrders() {
  let filtered = allOrders;
  if (activeTab === 'in-progress') {
    filtered = allOrders.filter(
      (o) => o.status !== 'delivered' && o.status !== 'completed' && o.status !== 'cancelled'
    );
  } else if (activeTab === 'delivered') {
    filtered = allOrders.filter(
      (o) => o.status === 'delivered' || o.status === 'completed'
    );
  }

  if (!filtered.length) {
    root.replaceChildren();
    root.innerHTML = `
      <div class="empty-state-box" style="padding: 48px 24px; text-align: center; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px;">
        <div class="empty-state-icon" style="font-size: 48px; color: #CBD5E1; margin-bottom: 16px;">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h2 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">
          ${activeTab === 'all' ? 'You have no orders yet' : 'No orders found in this section'}
        </h2>
        <p style="font-size: 14px; color: #64748B; max-width: 480px; margin: 0 auto 20px;">
          ${activeTab === 'all' ? 'When you order items on Matgari, you will be able to track shipping progress step-by-step and view invoices here.' : 'You can view all your orders under the "All Orders" tab.'}
        </p>
        <div>
          <a class="button btn-accent" href="/products.html">Browse Products & Shop Now</a>
        </div>
      </div>
    `;
    return;
  }

  root.replaceChildren(
    ...filtered.map((o) => {
      const card = document.createElement('article');
      card.className = 'order-card';

      const dateRaw = o.created_at || o.createdAt;
      const dateStr = dateRaw
        ? new Date(dateRaw).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Recently';

      const step = getStatusStep(o.status);
      const statusTitle = getStatusTitle(o.status);
      const isDelivered = o.status === 'delivered' || o.status === 'completed';
      const isCancelled = o.status === 'cancelled';

      const items = Array.isArray(o.products) ? o.products : [];

      card.innerHTML = `
        <!-- Order Card Header -->
        <div class="order-card-header">
          <div class="order-header-meta">
            <div class="order-meta-col">
              <span class="order-meta-label">ORDER PLACED</span>
              <span class="order-meta-val">${dateStr}</span>
            </div>
            <div class="order-meta-col">
              <span class="order-meta-label">TOTAL</span>
              <span class="order-meta-val" style="color: #B12704;">${money(o.total_price)}</span>
            </div>
            <div class="order-meta-col">
              <span class="order-meta-label">SHIP TO</span>
              <span class="order-meta-val">${o.user_name || o.user?.name || 'Valued Customer'}</span>
            </div>
          </div>
          <div class="order-header-right">
            <div class="order-meta-col" style="text-align: right;">
              <span class="order-meta-label">ORDER #</span>
              <span class="order-meta-val" style="font-family: monospace;">
                #${o.orderNumber || o._id}
              </span>
            </div>
          </div>
        </div>

        <!-- Order Card Body -->
        <div class="order-card-body">
          <!-- Status Banner -->
          <div class="order-status-banner ${isDelivered ? 'is-delivered' : ''} ${isCancelled ? 'is-cancelled' : ''}">
            <div>
              <div class="order-status-title">
                <i class="fa-solid ${isDelivered ? 'fa-circle-check' : isCancelled ? 'fa-circle-xmark' : 'fa-truck-fast'}" style="color: ${isDelivered ? '#067D62' : isCancelled ? '#EF4444' : '#FF9900'};"></i>
                <span>${statusTitle}</span>
              </div>
              <div class="order-status-desc" style="margin-top: 4px;">
                ${isDelivered ? 'Order delivered to your doorstep with quality guarantee and easy returns.' : 'Fast and free shipping with SMS notifications and live updates.'}
              </div>
            </div>
            <div class="status-badge-slot"></div>
          </div>

          <!-- Progress Tracker (only if not cancelled) -->
          ${
            !isCancelled
              ? `
            <div class="order-tracker">
              <div class="tracker-steps">
                <div class="tracker-step ${step >= 1 ? 'is-active' : ''} ${step === 1 ? 'is-current' : ''}">
                  <div class="tracker-bullet"><i class="fa-solid fa-file-invoice"></i></div>
                  <span class="tracker-label">Order Placed</span>
                </div>
                <div class="tracker-line ${step >= 2 ? 'is-active' : ''}"></div>
                <div class="tracker-step ${step >= 2 ? 'is-active' : ''} ${step === 2 ? 'is-current' : ''}">
                  <div class="tracker-bullet"><i class="fa-solid fa-boxes-packing"></i></div>
                  <span class="tracker-label">Processing & Packing</span>
                </div>
                <div class="tracker-line ${step >= 3 ? 'is-active' : ''}"></div>
                <div class="tracker-step ${step >= 3 ? 'is-active' : ''} ${step === 3 ? 'is-current' : ''}">
                  <div class="tracker-bullet"><i class="fa-solid fa-truck"></i></div>
                  <span class="tracker-label">Out for Delivery</span>
                </div>
                <div class="tracker-line ${step >= 4 ? 'is-active' : ''}"></div>
                <div class="tracker-step ${step >= 4 ? 'is-active' : ''} ${step === 4 ? 'is-current' : ''}">
                  <div class="tracker-bullet"><i class="fa-solid fa-house-circle-check"></i></div>
                  <span class="tracker-label">Delivered</span>
                </div>
              </div>
            </div>
          `
              : ''
          }

          <!-- Order Items List -->
          <div class="order-items-list">
            ${items
              .map((item) => {
                const populatedProduct =
                  item.product && typeof item.product === 'object' ? item.product : null;

                const itemImages = Array.isArray(item.images) && item.images.length
                  ? item.images
                  : (populatedProduct && Array.isArray(populatedProduct.images) ? populatedProduct.images : []);

                const realImg = resolveProductImage({ images: itemImages });
                const pName = item.name || (populatedProduct && populatedProduct.name) || 'Original Product';
                const pId = (populatedProduct && (populatedProduct._id || populatedProduct.id)) || item.product || item.id || '';
                const pPrice = item.price || (populatedProduct && populatedProduct.price) || 0;
                const pQty = item.quantity || 1;

                return `
                <div class="order-product-row">
                  <div class="order-product-main">
                    <div class="order-product-thumb">
                      <img src="${realImg}" alt="${pName}" loading="lazy" />
                    </div>
                    <div class="order-product-info">
                      <a href="/product.html?id=${encodeURIComponent(pId)}" class="order-product-name">
                        ${pName}
                      </a>
                      <div class="order-product-meta">
                        <span>Quantity: <strong>${pQty}</strong></span>
                        <span>•</span>
                        <span>Unit Price: <span class="order-product-price-badge">${money(pPrice)}</span></span>
                        <span>•</span>
                        <span>Total: <strong style="color: #0F172A;">${money(pPrice * pQty)}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

        <!-- Order Card Footer Strip -->
        <div class="order-card-footer">
          <div style="font-size: 13px; color: #64748B; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-shield-halved" style="color: #067D62;"></i>
            <span>Your purchase is covered by our quality guarantee and free 14-day return policy</span>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <a href="/ai-assistant.html" class="button btn-secondary btn-sm">
              <i class="fa-solid fa-headset"></i> Help with shipment
            </a>
            <button type="button" class="button btn-secondary btn-sm print-invoice-btn">
              <i class="fa-solid fa-file-invoice"></i> View Invoice
            </button>
          </div>
        </div>
      `;

      // Status badge
      const badgeSlot = card.querySelector('.status-badge-slot');
      if (badgeSlot) {
        badgeSlot.appendChild(statusBadge(o.status));
      }

      // View invoice modal
      const invoiceBtn = card.querySelector('.print-invoice-btn');
      if (invoiceBtn) {
        invoiceBtn.onclick = () => {
          showInvoiceModal(o);
        };
      }

      return card;
    })
  );
}

function setupTabs() {
  const tabAll = document.querySelector('#tab-all');
  const tabInProgress = document.querySelector('#tab-in-progress');
  const tabDelivered = document.querySelector('#tab-delivered');

  const updateTabUI = (activeBtn) => {
    [tabAll, tabInProgress, tabDelivered].forEach((btn) => {
      if (!btn) return;
      btn.style.fontWeight = 'normal';
      btn.style.color = 'var(--text-secondary)';
      btn.style.borderBottom = 'none';
    });
    if (activeBtn) {
      activeBtn.style.fontWeight = '700';
      activeBtn.style.color = 'var(--text-primary)';
      activeBtn.style.borderBottom = '3px solid var(--accent-hover)';
    }
  };

  if (tabAll) {
    tabAll.onclick = () => {
      activeTab = 'all';
      updateTabUI(tabAll);
      renderOrders();
    };
  }
  if (tabInProgress) {
    tabInProgress.onclick = () => {
      activeTab = 'in-progress';
      updateTabUI(tabInProgress);
      renderOrders();
    };
  }
  if (tabDelivered) {
    tabDelivered.onclick = () => {
      activeTab = 'delivered';
      updateTabUI(tabDelivered);
      renderOrders();
    };
  }
}

async function load() {
  state(root, 'Loading your order and purchase history...', 'loading');
  try {
    const res = await request('/api/get_user_orders');
    allOrders = res.data || [];
    renderOrders();
  } catch {
    state(root, 'Could not load your order history right now. Please try again later.', 'error');
  }
}

initSite().then(async () => {
  const user = await checkAuth(['user', 'admin', 'super_admin']);
  if (user) {
    joinRooms(user.role);
    setupTabs();
    await load();
    onEvent('update_status', load);
    onEvent('new_order', load);
  }
});
