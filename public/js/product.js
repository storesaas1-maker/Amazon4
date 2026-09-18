import { request, fetchAllProducts } from "../api.js";
import { addItem } from "../cart-store.js";
import { toast } from "../toast.js";
import { mountSiteShell } from "../components/site-shell.js";
import { initSite, money, state } from "./common.js";
import { onEvent } from "../socket-client.js";

mountSiteShell({ active: "shop" });

const id = new URLSearchParams(location.search).get("id");
const root = document.querySelector("#product-detail-container");
const reviewsList = document.querySelector("#reviews-list");
const breadcrumbName = document.querySelector("#breadcrumb-product-name");

// Product rating overview elements
const overviewScoreEl = document.querySelector("#overview-rating-score");
const overviewStarsEl = document.querySelector("#overview-stars");
const overviewCountEl = document.querySelector("#overview-review-count");
const overviewBarsEl = document.querySelector("#overview-rating-bars");

function renderStarsHtml(score) {
  const full = Math.floor(score);
  const hasHalf = score - full >= 0.3 && score - full < 0.8;
  const roundedFull = score - full >= 0.8 ? full + 1 : full;
  let html = "";
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

  if (overviewScoreEl) {
    overviewScoreEl.textContent = total > 0 ? avgScore.toFixed(1) : "0.0";
  }
  if (overviewStarsEl) {
    overviewStarsEl.innerHTML = renderStarsHtml(avgScore);
  }
  if (overviewCountEl) {
    overviewCountEl.textContent =
      total > 0
        ? `Based on ${total} verified customer rating${total > 1 ? "s" : ""}`
        : "No reviews or ratings recorded yet";
  }

  if (overviewBarsEl) {
    const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (total > 0) {
      items.forEach((r) => {
        const star = Math.max(
          1,
          Math.min(5, Math.round(Number(r.rating) || 5)),
        );
        starCounts[star] = (starCounts[star] || 0) + 1;
      });
    }

    const labels = {
      5: "5 stars",
      4: "4 stars",
      3: "3 stars",
      2: "2 stars",
      1: "1 star",
    };

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
      .join("");
  }

  const centerStars = document.querySelector("#center-rating-stars");
  const centerScore = document.querySelector("#center-rating-score");
  const centerCount = document.querySelector("#center-rating-count");

  if (centerStars) centerStars.innerHTML = renderStarsHtml(avgScore);
  if (centerScore)
    centerScore.textContent = total > 0 ? avgScore.toFixed(1) : "New";
  if (centerCount) {
    centerCount.textContent =
      total > 0 ? `(${total} verified buyer rating${total > 1 ? "s" : ""})` : "(Be the first to review this product)";
  }
}

function reviewList(items) {
  if (!reviewsList) return;
  if (!items || !items.length) {
    reviewsList.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--text-secondary); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);">
        <i class="fa-regular fa-comment-dots" style="font-size: 32px; margin-bottom: 10px; display: block; color: var(--text-muted);"></i>
        <strong>No customer reviews or comments for this product yet.</strong>
        <p style="font-size: 13px; margin-top: 4px; color: var(--text-muted);">Be the first customer to share your thoughts and experience using the form above!</p>
      </div>`;
    return;
  }

  reviewsList.replaceChildren(
    ...items.map((r) => {
      const d = document.createElement("article");
      d.className = "review-item";
      const rating = Math.max(
        1,
        Math.min(5, Math.round(Number(r.rating) || 5)),
      );
      const dateStr = r.created_at
        ? new Date(r.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Recently";

      d.innerHTML = `
        <div class="review-author" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-user" style="font-size: 24px; color: var(--primary);"></i>
            <span style="font-weight: 700; color: var(--text-primary); font-size: 14px;">${r.user_name || "Verified Customer"}</span>
          </div>
          <span style="font-size: 12px; color: var(--text-muted);">${dateStr}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div class="rating-stars" style="font-size: 13px;">
            ${renderStarsHtml(rating)}
          </div>
          <span style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${rating} of 5</span>
          <div class="review-badge-verified" style="margin-inline-start: 6px;">
            <i class="fa-solid fa-check" style="font-size: 11px;"></i> Verified Purchase
          </div>
        </div>
        <p class="review-content" style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">${r.content || ""}</p>
      `;
      return d;
    }),
  );
}

async function load() {
  if (!id) {
    state(root, "Product ID is missing in the URL.", "error");
    return;
  }

  state(root, "Loading product details and specifications...", "loading");

  try {
    const products = await fetchAllProducts();
    const p = products.find(
      (x) => String(x._id) === String(id) || String(x.id) === String(id),
    );
    if (!p) throw new Error("Product not found");

    if (breadcrumbName) breadcrumbName.textContent = p.name;
    document.title = `${p.name} — Matgari`;

    const price = p.final_price ?? p.price;
    const hasDiscount = Number(p.discount || 0) > 0;
    const sectionName = p.section?.name || "General Products";
    const sectionId = p.section?._id || "";

    // Parse product images
    let rawImages = [];
    if (Array.isArray(p.images) && p.images.length > 0) {
      rawImages = p.images.filter(
        (img) => typeof img === "string" && img.trim() !== "",
      );
    } else if (typeof p.image === "string" && p.image.trim() !== "") {
      rawImages = [p.image.trim()];
    }

    // Default fallback image if none provided
    const fallbackImg =
      "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=600";
    const galleryImages = rawImages.length > 0 ? rawImages : [fallbackImg];
    const mainImg = galleryImages[0];

    root.replaceChildren();
    root.innerHTML = `
      <div class="product-detail-layout">
        <!-- 1. Product Image Gallery -->
        <div class="product-gallery">
          <div class="gallery-primary-box" id="gallery-main-container" style="background:#FFF; border:1px solid #D5D9D9; border-radius:8px; padding:12px; display:flex; align-items:center; justify-content:center; min-height:360px;">
            <img id="primary-gallery-img" src="${mainImg}" alt="${p.name}" style="max-height:340px; width:auto; max-width:100%; object-fit:contain;" />
          </div>
          
          <!-- Thumbnails gallery -->
          ${
            galleryImages.length > 1
              ? `
              <div class="gallery-thumbs-row" id="gallery-thumbs" style="display:flex; gap:8px; margin-top:12px; overflow-x:auto; padding-bottom:4px;">
                ${galleryImages
                  .map(
                    (src, idx) => `
                  <div class="gallery-thumb ${idx === 0 ? "is-active" : ""}" data-src="${src}" style="cursor:pointer; width:64px; height:64px; border:2px solid ${idx === 0 ? "#FF9900" : "#D5D9D9"}; border-radius:6px; padding:2px; background:#FFF; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    <img src="${src}" alt="Image ${idx + 1}" style="width:100%; height:100%; object-fit:contain;" />
                  </div>`,
                  )
                  .join("")}
              </div>`
              : ""
          }
          
          <div style="margin-top: 14px; text-align: center;">
            <span class="badge badge-certified" style="padding: 6px 12px; font-size: 13px;">
              <i class="fa-solid fa-shield-halved"></i> 100% Certified Authentic Product
            </span>
          </div>
        </div>

        <!-- 2. Product Details & Specs -->
        <div class="product-info-col">
          <h1 class="product-detail-title">${p.name}</h1>
          <div class="product-brand-line">
            Category: <a href="/products.html?section=${encodeURIComponent(sectionId)}">${sectionName}</a>
            • Quality & Warranty: <strong>100% Certified Authentic</strong>
          </div>

          <div class="product-detail-rating">
            <div class="rating-stars" id="center-rating-stars">
              ${renderStarsHtml(Number(p.rating || 0))}
            </div>
            <span class="rating-score" id="center-rating-score">${Number(p.rating || 0) > 0 ? Number(p.rating).toFixed(1) : "New"}</span>
            <a href="#reviews-section" id="center-rating-count" style="font-size: 13px; color: var(--link); margin-inline-start: 6px;">
              ${Number(p.reviews_count || 0) > 0 ? `(${p.reviews_count} verified buyer rating${p.reviews_count > 1 ? "s" : ""})` : "(Be the first to review this product)"}
            </a>
          </div>

          <div class="product-detail-price-box">
            <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
              <span class="detail-price-big">${money(price)}</span>
              ${
                hasDiscount
                  ? `<del class="detail-price-old">${money(p.price)}</del>
                     <span class="badge badge-discount">Save ${p.discount}%</span>`
                  : ""
              }
            </div>
            <div class="detail-vat-note">All prices include VAT and free express shipping to all destinations.</div>
          </div>

          <!-- Quality Assurances -->
          <div class="inspection-box">
            <h4><i class="fa-solid fa-clipboard-check"></i> Quality Assurances & Guarantees:</h4>
            <ul class="inspection-grid">
              <li><i class="fa-solid fa-check"></i> 100% authentic certified product matching specifications</li>
              <li><i class="fa-solid fa-check"></i> Secure, tamper-proof packaging inspected prior to dispatch</li>
              <li><i class="fa-solid fa-check"></i> Fast shipping and safe doorstep delivery within 24–48 hours</li>
              <li><i class="fa-solid fa-check"></i> 14-day free return and replacement guarantee</li>
              <li><i class="fa-solid fa-check"></i> Official invoices and dedicated 24/7 customer support</li>
              <li><i class="fa-solid fa-check"></i> Multiple secure payment options including cash on delivery</li>
            </ul>
          </div>

          <!-- Specifications Table -->
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Specifications & Details:</h3>
          <table class="specs-table">
            <tbody>
              <tr>
                <th>Category / Department</th>
                <td>${sectionName}</td>
              </tr>
              <tr>
                <th>Product Code</th>
                <td><code>${p._id}</code></td>
              </tr>
              <tr>
                <th>Condition</th>
                <td>Brand new in original retail packaging, 100% certified</td>
              </tr>
              <tr>
                <th>Stock Availability</th>
                <td>${
                  Number(p.quantity) > 0
                    ? `In Stock (${p.quantity} units ready to ship)`
                    : "Currently Out of Stock"
                }</td>
              </tr>
              <tr>
                <th>Certified Warranty</th>
                <td>Official certified warranty covering replacement and servicing</td>
              </tr>
              <tr>
                <th>Shipping & Delivery</th>
                <td>Free and fast delivery across all locations</td>
              </tr>
            </tbody>
          </table>

          <!-- Description -->
          <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Product Overview & Specs:</h3>
          <div style="font-size: 14px; line-height: 1.7; color: var(--text-primary); margin-bottom: 16px;">
            ${p.description || "High quality authentic product with full warranty."}
          </div>
        </div>

        <!-- 3. Buy Box -->
        <div class="product-buy-box">
          <div class="buy-box-price">${money(price)}</div>

          <div class="buy-box-delivery">
            <i class="fa-solid fa-truck-fast" style="color: var(--success); margin-inline-end: 4px;"></i>
            <strong>Free Delivery</strong> within 24–48 hours.<br />
            Available for direct doorstep delivery.
          </div>

          <div class="buy-box-stock">
            ${
              Number(p.quantity) > 0
                ? '<i class="fa-solid fa-circle-check"></i> In Stock'
                : '<i class="fa-solid fa-circle-xmark" style="color: var(--error, #dc2626);"></i> Currently Out of Stock'
            }
          </div>

          <div class="buy-box-qty">
            <label for="buy-box-qty-select" style="font-size: 13px; font-weight: 700; display: block; margin-bottom: 4px;">Quantity:</label>
            <select id="buy-box-qty-select" aria-label="Select quantity" ${Number(p.quantity) > 0 ? "" : "disabled"}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>

          <div class="buy-box-actions">
            <button class="button btn-accent btn-block" id="detail-add-cart-btn" type="button" ${Number(p.quantity) > 0 ? "" : "disabled"}>
              <i class="fa-solid fa-cart-shopping"></i> ${Number(p.quantity) > 0 ? "Add to Cart" : "Currently Unavailable"}
            </button>
            <button class="button btn-buynow btn-block" id="detail-buy-now-btn" type="button" ${Number(p.quantity) > 0 ? "" : "disabled"}>
              <i class="fa-solid fa-bolt"></i> Buy Now
            </button>
          </div>

          <div class="buy-box-guarantees">
            <span><i class="fa-solid fa-lock"></i> 100% secure and encrypted transaction</span>
            <span><i class="fa-solid fa-box"></i> Ships from: <strong>Matgari Express</strong></span>
            <span><i class="fa-solid fa-shop"></i> Sold by: <strong>Matgari Official</strong></span>
            <span><i class="fa-solid fa-arrow-rotate-left"></i> 14-day return policy with full guarantee</span>
          </div>
        </div>
      </div>
    `;

    // Thumbnails click and hover listeners
    const mainImgEl = root.querySelector("#primary-gallery-img");
    const thumbEls = root.querySelectorAll(".gallery-thumb");

    const switchImage = (thumb) => {
      thumbEls.forEach((t) => {
        t.style.borderColor = "#D5D9D9";
        t.classList.remove("is-active");
      });
      thumb.style.borderColor = "#FF9900";
      thumb.classList.add("is-active");
      const newSrc = thumb.getAttribute("data-src");
      if (mainImgEl && newSrc) {
        mainImgEl.src = newSrc;
      }
    };

    thumbEls.forEach((thumb) => {
      thumb.addEventListener("mouseenter", () => switchImage(thumb));
      thumb.addEventListener("click", () => switchImage(thumb));
    });

    // Add to cart
    const qtySelect = root.querySelector("#buy-box-qty-select");
    root.querySelector("#detail-add-cart-btn").onclick = () => {
      if (Number(p.quantity) <= 0) {
        toast(`Cannot add "${p.name}": This item is currently out of stock.`, "error", { title: "Out of Stock" });
        return;
      }
      const qty = Math.max(1, Number(qtySelect?.value || 1));
      addItem(p, qty);
      toast(`Added "${p.name}" to cart (${qty} item${qty > 1 ? "s" : ""})`, "success", { title: "Added to Cart" });
    };

    // Direct Buy Now
    root.querySelector("#detail-buy-now-btn").onclick = () => {
      if (Number(p.quantity) <= 0) {
        toast(`Cannot proceed: "${p.name}" is currently out of stock.`, "error", { title: "Out of Stock" });
        return;
      }
      const qty = Math.max(1, Number(qtySelect?.value || 1));
      addItem(p, qty);
      toast(`Proceeding to checkout with "${p.name}"...`, "info");
      window.location.href = "/cart.html";
    };

    // Fetch reviews
    await fetchAndRenderReviews();
  } catch (err) {
    state(
      root,
      "Failed to load product details or it is currently unavailable.",
      "error",
    );
  }
}

async function fetchAndRenderReviews() {
  try {
    const res = await request(
      `/api/get_product_reviews?product_id=${encodeURIComponent(id)}`,
    );
    const reviews = res.data || [];
    reviewList(reviews);
    updateReviewSummary(reviews);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    reviewList([]);
    updateReviewSummary([]);
  }
}

initSite().then(async (user) => {
  await load();

  const form = document.querySelector("#review-form");
  const starBtns = document.querySelectorAll(".star-option");
  const ratingInput = document.querySelector("#review-rating-value");
  const ratingLabel = document.querySelector("#star-picker-label");
  const nameField = document.querySelector("#review-name-field");
  const nameInput = document.querySelector('input[name="user_name"]');

  const ratingDescriptions = {
    1: "1 star (Poor)",
    2: "2 stars (Fair)",
    3: "3 stars (Good)",
    4: "4 stars (Very Good)",
    5: "5 stars (Excellent)",
  };

  if (user && nameInput) {
    nameInput.value = user.name || "";
    if (nameField) {
      nameField.innerHTML = `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
          Reviewing as: <strong style="color: var(--text-primary);">${user.name || user.email}</strong>
        </div>
      `;
    }
  }

  function setStarRating(rating) {
    if (ratingInput) ratingInput.value = rating;
    if (ratingLabel)
      ratingLabel.textContent = ratingDescriptions[rating] || `${rating} stars`;

    starBtns.forEach((btn) => {
      const val = Number(btn.getAttribute("data-val"));
      if (val <= rating) {
        btn.classList.remove("fa-regular");
        btn.classList.add("fa-solid");
        btn.style.color = "#f59e0b";
      } else {
        btn.classList.remove("fa-solid");
        btn.classList.add("fa-regular");
        btn.style.color = "#d1d5db";
      }
    });
  }

  starBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = Number(btn.getAttribute("data-val")) || 5;
      setStarRating(val);
    });
  });

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector("#submit-review-btn");
      const reviewText = form.review_text?.value?.trim();
      const rating = Number(ratingInput?.value) || 5;
      const userName =
        user?.name || form.user_name?.value?.trim() || "Verified Customer";

      if (!reviewText) {
        toast("Please write your review comment", "error");
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        }

        const res = await request("/api/post_review", {
          method: "POST",
          body: {
            product_id: id,
            review_text: reviewText,
            rating,
            user_name: userName,
          },
        });

        if (res && res.success) {
          toast("Your review and rating have been published successfully!", "success");
          form.review_text.value = "";
          setStarRating(5);
          await fetchAndRenderReviews();
        } else {
          toast(res?.message || "Failed to submit review", "error");
        }
      } catch (err) {
        toast("An error occurred while submitting your review. Please try again.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML =
            '<i class="fa-solid fa-paper-plane"></i> Submit Review & Rating';
        }
      }
    };
  }

  onEvent("new_review", (e) => {
    if (String(e.product_id) === String(id)) {
      fetchAndRenderReviews();
    }
  });
});
