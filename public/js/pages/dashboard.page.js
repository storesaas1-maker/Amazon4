import { request, fetchAllOrders } from "../api.js";
import { checkAuth } from "../auth-guard.js";
import { joinRooms, onEvent } from "../socket-client.js";
import { confirm, promptDialog } from "../components/modal.js";
import { toast } from "../toast.js";
import { money, state } from "./common.js";
import { resolveProductImage, setupImgFallback, setCatalogCache } from "../image-helper.js";

// ======================================================
// Cloudinary configuration
// ======================================================
let cloudinaryConfig = null;

async function loadCloudinaryConfig() {
  try {
    const res = await request("/api/get_cloudinary_config", { silent: true });
    if (res && res.data && res.data.cloudName && res.data.uploadPreset) {
      cloudinaryConfig = {
        cloudName: res.data.cloudName,
        uploadPreset: res.data.uploadPreset,
        uploadUrl: res.data.uploadUrl || `https://api.cloudinary.com/v1_1/${res.data.cloudName}/image/upload`
      };
    }
  } catch (e) {
    cloudinaryConfig = null;
  }

  if (!cloudinaryConfig) {
    console.error("Could not load Cloudinary configuration from server (.env) — image upload currently disabled");
  }
}

const isSuper = document.body.dataset.dashboard === "super";

let user;
let orders = [];

const statuses = [
  "new",
  "processing",
  "delivered",
  "cancelled"
];

// Current product images arrays
let newProductImages = [];
let editProductImages = [];

// Order pagination variables
let ordersPage = 1;
const ordersPerPage = 10;
let ordersTotalPages = 1;
let ordersTotalCount = 0;
let ordersLoading = false;
let ordersScrollReady = false;

// Product pagination variables
let products = [];
let sections = [];
let productsPage = 1;
const productsPerPage = 20;
let productsTotalPages = 1;
let productsLoading = false;
let productsScrollReady = false;

// General helper functions
function id(x) {
  return x?._id || x?.id;
}

function text(tag, value) {
  const n = document.createElement(tag);
  n.textContent = value ?? "";
  return n;
}

function uploadFileToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfig) {
      reject(new Error("Image upload service is not configured on the server (check Cloudinary settings in .env)"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);
    formData.append("upload_preset", cloudinaryConfig.uploadPreset);

    xhr.open("POST", cloudinaryConfig.uploadUrl, true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url || data.url);
        } catch (err) {
          reject(new Error("Failed to parse Cloudinary response"));
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(new Error(errorData.error?.message || `Upload failed (${xhr.status})`));
        } catch (err) {
          reject(new Error(`Cloudinary server error (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("A network error occurred while uploading the image."));

    xhr.send(formData);
  });
}

// ======================================================
// Full product catalog (for image matching only)
// ======================================================
// FIX: resolveProductImage is fed with the catalog cache so image thumbnails match reliably.
//
// FIX 2: Traverse all pagination pages to populate the complete product image catalog.
async function loadProductImageCatalog() {
  const MAX_CATALOG_PAGES = 50; // Safety cap to prevent infinite loop
  try {
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && page <= MAX_CATALOG_PAGES) {
      const response = await request(
        `/api/get_products?page=${page}&limit=1000`,
        { silent: true }
      );

      const pageProducts = response.data || [];
      if (pageProducts.length) setCatalogCache(pageProducts);

      const pagination = response.pagination;
      if (pagination) {
        hasNextPage = Boolean(pagination.hasNextPage) && page < Number(pagination.totalPages || page);
      } else {
        // No pagination info: stop after first call
        hasNextPage = false;
      }

      page += 1;
    }
  } catch (error) {
    console.error("Load product image catalog error:", error);
  }
}

// ======================================================
// Auth guard & init
// ======================================================
async function guard() {
  user = await checkAuth(
    isSuper
      ? ["super_admin"]
      : ["admin", "super_admin"]
  );

  if (!user) return;

  joinRooms(user.role);

  const userName = document.querySelector("[data-user-name]");
  if (userName) {
    userName.textContent = user.name || "Super Admin";
  }

  const adminLogoutBtn = document.getElementById("admin-logout-btn");
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", async () => {
      try {
        adminLogoutBtn.disabled = true;
        const res = await fetch("/api/auth/log_out", {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" }
        });
        const data = await res.json().catch(() => ({}));
        toast(data?.message || "Logged out successfully", "success");
      } catch (_) {
        toast("Logged out", "info");
      } finally {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setTimeout(() => {
          window.location.href = "/login.html";
        }, 500);
      }
    });
  }

  await loadCloudinaryConfig();
  setupTabs();
  setupInstantImageUpload();
  setupEditModal();
  setupOrderDetailsModal();

  // Load initial data
  // FIX: Load product catalog before orders so images render accurately.
  await loadProductImageCatalog();
  await loadOrders(1, false);
  await loadOverviewStats();

  // Realtime event listeners
  onEvent("new_order", async () => {
    await reloadOrdersKeepCount();
    await loadOverviewStats();
  });

  onEvent("deleted_order", async () => {
    await reloadOrdersKeepCount();
    await loadOverviewStats();
  });

  onEvent("update_status_of_order", async () => {
    await reloadOrdersKeepCount();
    await loadOverviewStats();
  });

  // FIX: Keep product image catalog fresh on updates.
  onEvent("update_product", async () => {
    await loadProducts(1, false);
    await loadProductImageCatalog();
    await loadOverviewStats();
  });

  onEvent("new_product", async () => {
    await loadProducts(1, false);
    await loadProductImageCatalog();
    await loadOverviewStats();
  });

  onEvent("update_section", async () => {
    await loadProducts(1, false);
    await loadSections();
  });

  onEvent("new_problem", async () => {
    await loadProblems();
  });
}

// ======================================================
// Calculate and display overview statistics
// ======================================================
window.loadOverviewStats = async function loadOverviewStats() {
  try {
    const allOrders = await fetchAllOrders();

    const newOrders = allOrders.filter((o) => o.status === "new").length;
    const processingOrders = allOrders.filter((o) => o.status === "processing").length;
    const deliveredOrders = allOrders.filter((o) => o.status === "delivered").length;
    const cancelledOrders = allOrders.filter((o) => o.status === "cancelled").length;

    const totalRevenue = allOrders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

    const elRevenue = document.querySelector("#metric-revenue");
    const elOrdersTotal = document.querySelector("#metric-orders-total");
    const elOrdersNew = document.querySelector("#metric-orders-new");
    const elOrdersProcessing = document.querySelector("#metric-orders-processing");
    const elOrdersDelivered = document.querySelector("#metric-orders-delivered");
    const elOrdersCancelled = document.querySelector("#metric-orders-cancelled");

    if (elRevenue) elRevenue.textContent = money(totalRevenue);
    if (elOrdersTotal) elOrdersTotal.textContent = allOrders.length;
    if (elOrdersNew) elOrdersNew.textContent = newOrders;
    if (elOrdersProcessing) elOrdersProcessing.textContent = processingOrders;
    if (elOrdersDelivered) elOrdersDelivered.textContent = deliveredOrders;
    if (elOrdersCancelled) elOrdersCancelled.textContent = cancelledOrders;

    const usersRes = await request("/api/admin/get_all_users", { silent: true });
    const allUsers = usersRes?.data || [];
    const realCustomers = allUsers.filter((u) => u.role !== "admin" && u.role !== "super_admin").length;

    const elUsersReal = document.querySelector("#metric-users-real");
    const elUsersTotal = document.querySelector("#metric-users-total");
    if (elUsersReal) elUsersReal.textContent = realCustomers;
    if (elUsersTotal) elUsersTotal.textContent = allUsers.length;

    const prodRes = await request("/api/get_products?page=1&limit=1", { silent: true });
    const totalProducts = prodRes?.pagination?.totalProducts || prodRes?.data?.length || 0;
    const elProdTotal = document.querySelector("#metric-products-total");
    if (elProdTotal) elProdTotal.textContent = totalProducts;

  } catch (err) {
    console.error("Load overview stats error:", err);
  }
};

// ======================================================
// Tabs switching
// ======================================================
function setupTabs() {
  const tabButtons = document.querySelectorAll("[data-tab]");
  tabButtons.forEach((button) => {
    button.onclick = () => {
      tabButtons.forEach((b) => {
        b.classList.remove("bg-[#FF9900]", "text-[#0F1111]", "shadow-sm");
        b.classList.add("text-slate-300");
      });

      button.classList.add("bg-[#FF9900]", "text-[#0F1111]", "shadow-sm");
      button.classList.remove("text-slate-300");

      document.querySelectorAll(".tab").forEach((node) => {
        node.classList.remove("active");
      });

      const target = document.querySelector(`#${button.dataset.tab}`);
      if (target) {
        target.classList.add("active");
        if (button.dataset.tab === "overview-tab") {
          loadOverviewStats();
        }
        if (button.dataset.tab === "problems-tab") {
          loadProblems();
        }
        // FIX: Load products when catalog tab is clicked if not loaded yet.
        if (button.dataset.tab === "products-tab" && !products.length) {
          loadProducts(1, false);
        }
      }
    };
  });
}

// ======================================================
// Manage and render new product image gallery
// ======================================================
function renderNewProductImages() {
  const grid = document.querySelector("#product-images-grid");
  const countEl = document.querySelector("#product-images-count");
  const statusEl = document.querySelector("#product-image-status");
  if (!grid) return;

  if (countEl) {
    countEl.textContent = `${newProductImages.length} images selected`;
  }

  if (statusEl) {
    if (newProductImages.length > 0) {
      statusEl.textContent = `${newProductImages.length} images selected`;
      statusEl.className = "text-[10px] text-emerald-600 font-bold";
    } else {
      statusEl.textContent = "No images selected yet";
      statusEl.className = "text-[10px] text-[#565959]";
    }
  }

  grid.innerHTML = "";

  if (newProductImages.length === 0) {
    grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-3 text-slate-400 text-[11px]"><i class="fa-regular fa-image text-xl mb-1 text-slate-300"></i>No uploaded images</div>`;
    return;
  }

  newProductImages.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "relative aspect-square rounded bg-white border border-[#D5D9D9] p-1 shadow-xs group flex items-center justify-center overflow-hidden";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Image ${idx + 1}`;
    img.className = "w-full h-full object-contain";

    if (idx === 0) {
      const mainBadge = document.createElement("span");
      mainBadge.className = "absolute top-1 right-1 bg-[#FF9900] text-[#0F1111] text-[9px] font-black px-1 rounded shadow-xs";
      mainBadge.textContent = "Main";
      card.append(mainBadge);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "absolute top-1 left-1 w-5 h-5 rounded-full bg-[#B12704] hover:bg-rose-700 text-white flex items-center justify-center text-[10px] shadow transition-colors";
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.title = "Delete this image";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      newProductImages.splice(idx, 1);
      renderNewProductImages();
    };

    card.append(img, removeBtn);
    grid.append(card);
  });
}

function setupInstantImageUpload() {
  const dropZone = document.querySelector("#product-drop-zone");
  const fileInput = document.querySelector("#product-image-file");
  const urlInput = document.querySelector("#product-image-url-input");
  const addUrlBtn = document.querySelector("#add-product-url-btn");
  const progressContainer = document.querySelector("#product-progress-container");
  const progressBar = document.querySelector("#product-progress-bar");
  const progressText = document.querySelector("#product-progress-text");
  const progressPercent = document.querySelector("#product-progress-percent");

  renderNewProductImages();

  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    };

    ["dragleave", "dragend"].forEach((type) => {
      dropZone.addEventListener(type, () => dropZone.classList.remove("drag-over"));
    });

    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadMultipleFiles(Array.from(e.dataTransfer.files));
      }
    };

    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadMultipleFiles(Array.from(e.target.files));
        e.target.value = "";
      }
    };
  }

  if (addUrlBtn && urlInput) {
    const addUrl = () => {
      const url = urlInput.value.trim();
      if (!url) {
        toast("Please enter a valid image URL", "error");
        return;
      }
      newProductImages.push(url);
      urlInput.value = "";
      renderNewProductImages();
      toast("Image URL added successfully", "success");
    };

    addUrlBtn.onclick = addUrl;
    urlInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addUrl();
      }
    };
  }

  async function uploadMultipleFiles(files) {
    const validFiles = files.filter((f) => f.type.startsWith("image/"));
    if (validFiles.length === 0) {
      toast("Please select valid image files (JPG, PNG, WebP)", "error");
      return;
    }

    if (progressContainer) progressContainer.classList.remove("hidden");
    let completed = 0;
    const total = validFiles.length;

    for (let i = 0; i < total; i++) {
      const file = validFiles[i];
      if (progressText) progressText.textContent = `Uploading (${i + 1} of ${total}): ${file.name}`;

      try {
        const secureUrl = await uploadFileToCloudinary(file, (percent) => {
          const overallPercent = Math.round(((i + percent / 100) / total) * 100);
          if (progressBar) progressBar.style.width = `${overallPercent}%`;
          if (progressPercent) progressPercent.textContent = `${overallPercent}%`;
        });

        newProductImages.push(secureUrl);
        renderNewProductImages();
        completed++;
      } catch (err) {
        console.error("Upload file error:", err);
        toast(`Failed to upload image: ${file.name}`, "error");
      }
    }

    if (completed > 0) {
      toast(`Uploaded ${completed} images successfully`, "success");
    }

    setTimeout(() => {
      if (progressContainer) progressContainer.classList.add("hidden");
      if (progressBar) progressBar.style.width = "0%";
    }, 1200);
  }
}

// ======================================================
// Order management and display (with purchased product details)
// ======================================================
async function loadOrders(page = 1, append = false) {
  if (ordersLoading) return;

  const root = document.querySelector("#orders-list");
  if (!root) return;

  ordersLoading = true;

  if (!append) {
    orders = [];
    ordersPage = 1;
    ordersTotalPages = 1;
    state(root, "Loading orders…");
  }

  try {
    const response = await request(
      `/api/admin/get_all_orders?page=${page}&limit=${ordersPerPage}`
    );

    const newOrders = response.data || [];
    orders = append ? [...orders, ...newOrders] : newOrders;
    ordersPage = page;

    if (response.pagination) {
      ordersTotalPages = Number(response.pagination.totalPages) || 1;
      ordersTotalCount = Number(response.pagination.totalOrders) || orders.length;
    } else {
      ordersTotalPages = newOrders.length >= ordersPerPage ? page + 1 : page;
      ordersTotalCount = orders.length;
    }

    if (append) {
      root.append(...newOrders.map(orderRow));
    } else {
      root.replaceChildren(...orders.map(orderRow));
    }

    if (!orders.length) {
      state(root, "No orders yet.", "empty");
    }

    updateOrdersPagination();
  } catch (error) {
    console.error("Load orders error:", error);
    if (append) {
      updateOrdersPagination("Could not load more orders.");
    } else {
      state(root, "Could not load orders list.", "error");
    }
  } finally {
    ordersLoading = false;
  }
}

async function reloadOrdersKeepCount() {
  const root = document.querySelector("#orders-list");
  if (!root) return;

  const currentCount = Math.max(orders.length, ordersPerPage);
  const pageSize = 50;

  try {
    let collected = [];
    let page = 1;
    let pagination = null;

    while (collected.length < currentCount) {
      const response = await request(
        `/api/admin/get_all_orders?page=${page}&limit=${pageSize}`
      );
      const batch = response.data || [];
      collected = collected.concat(batch);
      pagination = response.pagination || null;

      if (!pagination || !pagination.hasNextPage) break;
      page += 1;
    }

    orders = collected.slice(0, currentCount);

    if (pagination) {
      ordersTotalCount = Number(pagination.totalOrders) || orders.length;
      ordersTotalPages = Math.ceil(ordersTotalCount / ordersPerPage) || 1;
    } else {
      ordersTotalCount = orders.length;
      ordersTotalPages = 1;
    }

    root.replaceChildren(...orders.map(orderRow));

    if (!orders.length) {
      state(root, "No orders yet.", "empty");
    }

    updateOrdersPagination();
  } catch (err) {
    console.error("Reload orders keep count error:", err);
  }
}

function ensureOrdersSentinel() {
  let pagination = document.querySelector("#orders-pagination");
  if (!pagination) {
    pagination = document.createElement("div");
    pagination.id = "orders-pagination";
    pagination.className = "py-4 text-center text-xs font-bold text-[#565959]";

    const root = document.querySelector("#orders-list");
    const anchor = root?.closest("table") || root;
    if (anchor) anchor.after(pagination);
  }
  return pagination;
}

function updateOrdersPagination(customText) {
  const pagination = ensureOrdersSentinel();
  pagination.replaceChildren();

  const info = document.createElement("span");
  const hasMore = orders.length < ordersTotalCount;

  info.textContent = customText
    ? customText
    : hasMore
    ? `Loaded ${orders.length} of ${ordersTotalCount} orders (scroll to load more...)`
    : orders.length
    ? `All orders loaded successfully (${ordersTotalCount})`
    : "";

  pagination.append(info);
  setupOrdersInfiniteScroll();
}

function setupOrdersInfiniteScroll() {
  if (ordersScrollReady) return;

  const sentinel = ensureOrdersSentinel();
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !ordersLoading && orders.length < ordersTotalCount) {
        const nextPage = Math.floor(orders.length / ordersPerPage) + 1;
        loadOrders(nextPage, true);
      }
    },
    { rootMargin: "400px" }
  );

  observer.observe(sentinel);
  ordersScrollReady = true;
}

// Order row builder and purchased products display
function orderRow(o) {
  const tr = document.createElement("tr");
  tr.className = "hover:bg-[#F7F7F7] transition-colors border-b border-[#E7E7E7] text-xs";

  // 1. Order number and date
  const tdNum = document.createElement("td");
  tdNum.className = "py-3.5 px-4";
  
  const orderNum = document.createElement("span");
  orderNum.className = "font-bold text-[#0F1111] block font-mono";
  orderNum.textContent = o.orderNumber || id(o)?.slice(-6) || "—";

  const orderDate = document.createElement("span");
  orderDate.className = "text-[10px] text-[#565959] block";
  orderDate.textContent = o.createdAt ? new Date(o.createdAt).toLocaleString("en-US") : "";

  tdNum.append(orderNum, orderDate);

  // 2. Customer
  const tdUser = document.createElement("td");
  tdUser.className = "py-3.5 px-4 text-[#0F1111] font-semibold";
  tdUser.textContent = o.user_name || o.user?.name || "Registered Customer";

  // 3. Purchased products (thumbnail & quantities)
  const tdItems = document.createElement("td");
  tdItems.className = "py-3.5 px-4 space-y-1.5 min-w-[190px]";

  const items = o.items || o.products || o.cart || [];
  if (!items.length) {
    tdItems.textContent = "—";
    tdItems.className = "py-3.5 px-4 text-[#565959]";
  } else {
    items.forEach((item) => {
      const itemRow = document.createElement("div");
      itemRow.className = "flex items-center gap-2 bg-white p-1.5 rounded border border-[#E7E7E7] shadow-2xs";

      const img = document.createElement("img");
      const pNameStr = item.name || item.product_name || item.product?.name || "Product";
      const imgSrc = resolveProductImage(item, products);
      img.src = imgSrc;
      img.alt = pNameStr;
      img.className = "w-7 h-7 object-contain rounded bg-[#F7F7F7] border border-[#D5D9D9] p-0.5 flex-shrink-0";
      setupImgFallback(img, pNameStr);

      const info = document.createElement("div");
      info.className = "text-[11px] leading-tight flex-1 min-w-0";

      const nameEl = document.createElement("p");
      nameEl.className = "font-bold text-[#0F1111] truncate";
      nameEl.textContent = item.name || item.product_name || item.product?.name || "Product";

      const qtyEl = document.createElement("span");
      qtyEl.className = "text-[10px] text-[#565959] font-semibold block";
      qtyEl.textContent = `Quantity: ${item.quantity || item.qty || 1}`;

      info.append(nameEl, qtyEl);
      itemRow.append(img, info);
      tdItems.append(itemRow);
    });
  }

  // 4. Contact details
  const tdContact = document.createElement("td");
  tdContact.className = "py-3.5 px-4 space-y-1";

  const phone = o.phone_number || o.user?.phone;
  if (phone) {
    const phoneLink = document.createElement("a");
    phoneLink.href = `tel:${phone}`;
    phoneLink.className = "flex items-center gap-1.5 text-[#007185] hover:text-[#C7511F] font-mono text-[11px] transition-colors";
    // FIX (security): "phone" comes straight from customer-submitted
    // order data with no format validation on the backend. Interpolating
    // it into innerHTML meant a phone number containing HTML/script could
    // execute in the admin's browser session (stored XSS) the moment this
    // orders table renders. Building the icon and text as separate nodes
    // with textContent for the user-supplied value fixes this.
    const phoneIcon = document.createElement("i");
    phoneIcon.className = "fa-solid fa-phone text-[#565959] text-[9px]";
    const phoneText = document.createElement("span");
    phoneText.textContent = phone;
    phoneLink.append(phoneIcon, phoneText);
    tdContact.append(phoneLink);
  }

  const wa = o.whatsApp_number || o.whatsapp_number;
  if (wa) {
    const cleanWa = String(wa).replace(/\D/g, "");
    const waLink = document.createElement("a");
    waLink.href = `https://wa.me/${cleanWa}`;
    waLink.target = "_blank";
    waLink.rel = "noopener noreferrer";
    waLink.className = "inline-flex items-center gap-1 text-[#067D62] hover:text-emerald-800 bg-[#E7F4EE] border border-[#C6F6D5] px-1.5 py-0.5 rounded font-bold text-[10px] transition-colors";
    const waIcon = document.createElement("i");
    waIcon.className = "fa-brands fa-whatsapp text-[#067D62]";
    const waText = document.createElement("span");
    waText.textContent = wa;
    waLink.append(waIcon, waText);
    tdContact.append(waLink);
  }

  if (!phone && !wa) {
    tdContact.textContent = "—";
    tdContact.className = "py-3.5 px-4 text-[#565959]";
  }

  // 5. Location link
  const tdGps = document.createElement("td");
  tdGps.className = "py-3.5 px-4 text-center";

  const gpsUrl = o.GPS_URL || o.gps_url || o.gps;
  if (gpsUrl) {
    const fullGpsUrl = gpsUrl.startsWith("http") ? gpsUrl : `https://${gpsUrl}`;
    const gpsBtn = document.createElement("a");
    gpsBtn.href = fullGpsUrl;
    gpsBtn.target = "_blank";
    gpsBtn.rel = "noopener noreferrer";
    gpsBtn.className = "inline-flex items-center gap-1 bg-[#FFF8E7] hover:bg-[#FFECC2] text-[#B45309] font-bold px-2 py-0.5 rounded border border-[#FEEBC8] text-[11px] transition-colors";
    gpsBtn.innerHTML = '<i class="fa-solid fa-location-dot text-[#B12704]"></i><span>Location</span>';
    tdGps.append(gpsBtn);
  } else {
    tdGps.textContent = "—";
    tdGps.className = "py-3.5 px-4 text-center text-[#565959]";
  }

  // 6. Total
  const tdPrice = document.createElement("td");
  tdPrice.className = "py-3.5 px-4 font-black text-[#067D62] text-sm";
  tdPrice.textContent = money(o.total_price);

  // 7. Order status
  const statusCell = document.createElement("td");
  statusCell.className = "py-3.5 px-4";

  const select = document.createElement("select");
  select.className = "bg-[#F0F2F2] border border-[#D5D9D9] rounded px-2.5 py-1 text-xs font-bold text-[#0F1111] focus:outline-none focus:border-[#E77600] cursor-pointer";

  statuses.forEach((status) => {
    let label = status;
    if (status === "new") label = "New";
    if (status === "processing") label = "Processing";
    if (status === "delivered") label = "Delivered";
    if (status === "cancelled") label = "Cancelled";

    select.add(new Option(label, status, status === o.status, status === o.status));
  });

  select.onchange = async () => {
    const previousStatus = o.status;
    const newStatus = select.value;

    try {
      await request("/api/admin/update_status_of_order", {
        method: "PUT",
        body: {
          order_id: id(o),
          status_order: newStatus
        }
      });
      o.status = newStatus;
      toast("Order status updated successfully", "success");
      loadOverviewStats();
    } catch (error) {
      console.error("Update order status error:", error);
      select.value = previousStatus;
      toast("Could not update order status", "error");
    }
  };

  statusCell.append(select);

  // 8. Actions (view details & delete)
  const actions = document.createElement("td");
  actions.className = "py-3.5 px-4 text-center";

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "inline-flex items-center gap-1.5";

  // View order details button
  const viewBtn = document.createElement("button");
  viewBtn.className = "w-7 h-7 rounded border border-[#D5D9D9] bg-white hover:bg-[#F0F2F2] text-[#007185] inline-flex items-center justify-center text-xs transition-colors shadow-2xs";
  viewBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  viewBtn.title = "View products and details";
  viewBtn.onclick = () => openOrderDetailsModal(o);

  // Delete order button
  const del = document.createElement("button");
  del.className = "w-7 h-7 rounded border border-[#D5D9D9] bg-white hover:bg-[#FCF4F4] text-[#B12704] inline-flex items-center justify-center text-xs transition-colors shadow-2xs";
  del.innerHTML = '<i class="fa-solid fa-trash"></i>';
  del.title = "Delete order";

  del.onclick = async () => {
    if (await confirm("Are you sure you want to permanently delete this order?")) {
      try {
        await request("/api/admin/delete_order", {
          method: "DELETE",
          body: { order_id: id(o) }
        });
        
        tr.remove();
        orders = orders.filter((item) => id(item) !== id(o));
        ordersTotalCount = Math.max(0, ordersTotalCount - 1);

        toast("Order deleted successfully", "success");
        updateOrdersPagination();
        loadOverviewStats();
      } catch (error) {
        console.error("Delete order error:", error);
        toast("Could not delete order", "error");
      }
    }
  };

  actionsWrap.append(viewBtn, del);
  actions.append(actionsWrap);

  tr.append(tdNum, tdUser, tdItems, tdContact, tdGps, tdPrice, statusCell, actions);
  return tr;
}

// ======================================================
// Order Details Modal
// ======================================================
function setupOrderDetailsModal() {
  const modal = document.querySelector("#order-details-modal");
  const closeBtn = document.querySelector("#close-order-modal-btn");
  const closeFooterBtn = document.querySelector("#close-order-modal-footer-btn");

  const closeModal = () => {
    if (modal) modal.classList.add("hidden");
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (closeFooterBtn) closeFooterBtn.onclick = closeModal;
}

function openOrderDetailsModal(order) {
  const modal = document.querySelector("#order-details-modal");
  if (!modal) return;

  const numEl = document.querySelector("#modal-order-number");
  const nameEl = document.querySelector("#modal-customer-name");
  const dateEl = document.querySelector("#modal-order-date");
  const addressEl = document.querySelector("#modal-order-address");
  const totalEl = document.querySelector("#modal-order-total");
  const itemsList = document.querySelector("#modal-items-list");

  if (numEl) numEl.textContent = order.orderNumber || id(order)?.slice(-6) || "—";
  if (nameEl) nameEl.textContent = order.user_name || order.user?.name || "Registered Customer";
  if (dateEl) dateEl.textContent = order.createdAt ? new Date(order.createdAt).toLocaleString("en-US") : "—";
  if (addressEl) addressEl.textContent = order.address || order.notes || "No additional address provided";
  if (totalEl) totalEl.textContent = money(order.total_price);

  if (itemsList) {
    itemsList.innerHTML = "";
    const items = order.items || order.products || order.cart || [];

    if (items.length === 0) {
      itemsList.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">No product details recorded in this order</div>`;
    } else {
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "p-2.5 flex items-center justify-between gap-3 text-xs";

        const left = document.createElement("div");
        left.className = "flex items-center gap-2.5";

        const img = document.createElement("img");
        const pNameStr = item.name || item.product_name || item.product?.name || "Product";
        const imgSrc = resolveProductImage(item, products);
        img.src = imgSrc;
        img.alt = pNameStr;
        img.className = "w-9 h-9 object-contain rounded border border-[#E7E7E7] p-0.5 bg-white";
        setupImgFallback(img, pNameStr);

        const titleBox = document.createElement("div");
        const pName = document.createElement("h5");
        pName.className = "font-bold text-[#0F1111]";
        pName.textContent = item.name || item.product_name || item.product?.name || "Product";

        const pQty = document.createElement("span");
        pQty.className = "text-[11px] text-[#565959] block";
        pQty.textContent = `Quantity: ${item.quantity || item.qty || 1} × ${money(item.price || item.unit_price || 0)}`;

        titleBox.append(pName, pQty);
        left.append(img, titleBox);

        const priceEl = document.createElement("strong");
        priceEl.className = "font-black text-[#0F1111]";
        const itemTotal = (Number(item.price || item.unit_price) || 0) * (Number(item.quantity || item.qty) || 1);
        priceEl.textContent = money(itemTotal || item.total);

        row.append(left, priceEl);
        itemsList.append(row);
      });
    }
  }

  modal.classList.remove("hidden");
}

// ======================================================
// Products Management
// ======================================================
async function loadProducts(page = 1, append = false) {
  if (productsLoading) return;

  const root = document.querySelector("#products-list");
  if (!root) return;

  productsLoading = true;

  if (!append) {
    products = [];
    productsPage = 1;
    productsTotalPages = 1;
    state(root, "Loading products…");
  }

  try {
    const response = await request(
      `/api/get_products?page=${page}&limit=${productsPerPage}`
    );

    const newProducts = response.data || [];
    products = append ? [...products, ...newProducts] : newProducts;
    setCatalogCache(products);
    productsPage = page;

    if (response.pagination) {
      productsTotalPages = Number(response.pagination.totalPages) || 1;
    } else {
      productsTotalPages = newProducts.length >= productsPerPage ? page + 1 : page;
    }

    renderProducts();
    await loadSections();
    updateProductsPagination();
  } catch (error) {
    console.error("Load products error:", error);
    state(root, "Could not load products.", "error");
  } finally {
    productsLoading = false;
  }
}

function renderProducts() {
  const root = document.querySelector("#products-list");
  if (!root) return;

  if (!products.length) {
    state(root, "No products registered currently.", "empty");
    updateProductsPagination();
    return;
  }

  root.replaceChildren(
    ...products.map((p) => {
      const card = document.createElement("article");
      card.className = "bg-white rounded border border-[#D5D9D9] p-4 shadow-sm hover:border-[#A6A6A6] transition-colors flex flex-col justify-between group";

      const imgWrap = document.createElement("div");
      imgWrap.className = "w-full aspect-square bg-[#F7F7F7] rounded overflow-hidden mb-3 border border-[#E7E7E7] flex items-center justify-center relative";

      const mainImg = resolveProductImage(p);

      // FIX: this variable was referenced below (imagesList.length) but
      // never defined anywhere in the file — a ReferenceError that threw
      // on the very first product in every render, which was caught by
      // loadProducts try/catch and silently showed "failed to load products" even though data had
      // already arrived successfully from the server. The whole Products
      // tab was unusable because of this.
      const imagesList = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);

      const img = document.createElement("img");
      img.src = mainImg;
      img.alt = p.name || "Product image";
      img.loading = "lazy";
      img.className = "w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200";
      setupImgFallback(img, p.name);

      imgWrap.append(img);

      if (imagesList.length > 1) {
        const countBadge = document.createElement("span");
        countBadge.className = "absolute top-2 left-2 bg-[#131921]/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow";
        countBadge.innerHTML = `<i class="fa-solid fa-images text-[#FF9900]"></i> ${imagesList.length}`;
        imgWrap.append(countBadge);
      }

      if (p.discount > 0) {
        const discountBadge = document.createElement("span");
        discountBadge.className = "absolute top-2 right-2 bg-[#B12704] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow";
        discountBadge.textContent = `${p.discount}% OFF`;
        imgWrap.append(discountBadge);
      }

      const details = document.createElement("div");
      details.className = "space-y-1.5 flex-1";

      const sectionName = text("span", p.section?.name || "General");
      sectionName.className = "text-[11px] font-bold text-[#FF9900] block";

      const name = text("h4", p.name || "Unnamed Product");
      name.className = "font-extrabold text-[#0F1111] text-sm line-clamp-1";

      const desc = text("p", p.description || "");
      desc.className = "text-xs text-[#565959] line-clamp-2 leading-relaxed";

      const priceBox = document.createElement("div");
      priceBox.className = "pt-2 flex items-baseline justify-between";

      const finalPrice = text("strong", money(p.final_price ?? p.price));
      finalPrice.className = "text-base font-black text-[#0F1111]";

      const stockTag = text(
        "span",
        Number(p.quantity) > 0 ? `In Stock: ${p.quantity}` : "Out of Stock"
      );
      stockTag.className = `text-[11px] font-bold ${
        Number(p.quantity) > 0 ? "text-[#067D62]" : "text-[#B12704]"
      }`;

      priceBox.append(finalPrice, stockTag);
      details.append(sectionName, name, desc, priceBox);

      const actions = document.createElement("div");
      actions.className = "pt-3 border-t border-[#E7E7E7] grid grid-cols-2 gap-2 mt-3";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "bg-[#F0F2F2] hover:bg-[#E3E6E6] border border-[#D5D9D9] text-[#0F1111] font-bold py-1.5 px-3 rounded text-xs flex items-center justify-center gap-1.5 transition-colors";
      editBtn.innerHTML = '<i class="fa-solid fa-pen text-[#565959]"></i><span>Edit</span>';
      editBtn.onclick = () => openEditModal(p);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "bg-white hover:bg-[#FCF4F4] border border-[#D5D9D9] text-[#B12704] font-bold py-1.5 px-3 rounded text-xs flex items-center justify-center gap-1.5 transition-colors";
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Delete</span>';
      delBtn.onclick = () => deleteProduct(p);

      actions.append(editBtn, delBtn);

      card.append(imgWrap, details, actions);
      return card;
    })
  );
}

function ensureProductsSentinel() {
  let pagination = document.querySelector("#products-pagination");
  if (!pagination) {
    pagination = document.createElement("div");
    pagination.id = "products-pagination";
    pagination.className = "py-4 text-center text-xs font-bold text-[#565959] col-span-full";

    const root = document.querySelector("#products-list");
    if (root) root.after(pagination);
  }
  return pagination;
}

function updateProductsPagination() {
  const pagination = ensureProductsSentinel();
  pagination.replaceChildren();

  const info = document.createElement("span");
  const hasMore = productsPage < productsTotalPages;

  info.textContent = hasMore
    ? `Loaded ${products.length} products (scroll to load more...)`
    : products.length
    ? `All products loaded (${products.length})`
    : "";

  pagination.append(info);
  setupProductsInfiniteScroll();
}

function setupProductsInfiniteScroll() {
  if (productsScrollReady) return;

  const sentinel = ensureProductsSentinel();
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !productsLoading && productsPage < productsTotalPages) {
        loadProducts(productsPage + 1, true);
      }
    },
    { rootMargin: "400px" }
  );

  observer.observe(sentinel);
  productsScrollReady = true;
}

// ======================================================
// Edit Product Modal
// ======================================================
function setupEditModal() {
  const modal = document.querySelector("#edit-product-modal");
  const closeBtn = document.querySelector("#close-edit-modal-btn");
  const cancelBtn = document.querySelector("#cancel-edit-btn");
  const editFileInput = document.querySelector("#edit-image-file");
  const editUrlInput = document.querySelector("#edit-image-url-input");
  const addEditUrlBtn = document.querySelector("#add-edit-url-btn");
  const form = document.querySelector("#edit-product-form");
  const editProgressContainer = document.querySelector("#edit-progress-container");
  const editProgressBar = document.querySelector("#edit-progress-bar");
  const editProgressText = document.querySelector("#edit-progress-text");
  const editProgressPercent = document.querySelector("#edit-progress-percent");

  const closeModal = () => {
    if (modal) modal.classList.add("hidden");
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (cancelBtn) cancelBtn.onclick = closeModal;

  if (editFileInput) {
    editFileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;

      if (editProgressContainer) editProgressContainer.classList.remove("hidden");
      let completed = 0;
      const total = files.length;

      for (let i = 0; i < total; i++) {
        const file = files[i];
        if (editProgressText) editProgressText.textContent = `Uploading (${i + 1} of ${total}): ${file.name}`;

        try {
          const secureUrl = await uploadFileToCloudinary(file, (percent) => {
            const overallPercent = Math.round(((i + percent / 100) / total) * 100);
            if (editProgressBar) editProgressBar.style.width = `${overallPercent}%`;
            if (editProgressPercent) editProgressPercent.textContent = `${overallPercent}%`;
          });

          editProductImages.push(secureUrl);
          renderEditProductImages();
          completed++;
        } catch (err) {
          console.error("Edit upload error:", err);
          toast(`Failed to upload image: ${file.name}`, "error");
        }
      }

      if (completed > 0) {
        toast(`Added ${completed} images successfully`, "success");
      }

      setTimeout(() => {
        if (editProgressContainer) editProgressContainer.classList.add("hidden");
        if (editProgressBar) editProgressBar.style.width = "0%";
      }, 1200);

      e.target.value = "";
    };
  }

  if (addEditUrlBtn && editUrlInput) {
    const addUrl = () => {
      const url = editUrlInput.value.trim();
      if (!url) {
        toast("Please enter a valid image URL", "error");
        return;
      }
      editProductImages.push(url);
      editUrlInput.value = "";
      renderEditProductImages();
      toast("Image URL added successfully", "success");
    };

    addEditUrlBtn.onclick = addUrl;
    editUrlInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addUrl();
      }
    };
  }

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();

      const saveBtn = document.querySelector("#save-edit-btn");

      const pId = document.querySelector("#edit-product-id")?.value;
      const name = document.querySelector("#edit-product-name")?.value.trim();
      const section = document.querySelector("#edit-product-section")?.value;
      const price = Number(document.querySelector("#edit-product-price")?.value);
      const discount = Number(document.querySelector("#edit-product-discount")?.value || 0);
      const quantity = Number(document.querySelector("#edit-product-quantity")?.value);
      const description = document.querySelector("#edit-product-description")?.value.trim();

      if (editProductImages.length === 0) {
        toast("Please select or upload at least one image for the product", "error");
        return;
      }

      try {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving...";
        }

        await request("/api/admin/update_product", {
          method: "PUT",
          body: {
            product_id: pId,
            product_name: name,
            product_description: description,
            product_price: price,
            product_discount: discount,
            images: editProductImages,
            quantity: quantity,
            section: section
          }
        });

        toast("Product details and images updated successfully", "success");
        closeModal();
        await loadProducts(1, false);
      } catch (error) {
        console.error("Edit product submit error:", error);
        toast(error.message || "Could not update product", "error");
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Changes";
        }
      }
    };
  }
}

function openEditModal(product) {
  const modal = document.querySelector("#edit-product-modal");
  if (!modal) return;

  document.querySelector("#edit-product-id").value = id(product);
  document.querySelector("#edit-product-name").value = product.name || "";
  document.querySelector("#edit-product-price").value = product.price ?? "";
  document.querySelector("#edit-product-discount").value = product.discount ?? 0;
  document.querySelector("#edit-product-quantity").value = product.quantity ?? 1;
  document.querySelector("#edit-product-description").value = product.description || "";

  if (Array.isArray(product.images) && product.images.length > 0) {
    editProductImages = [...product.images];
  } else if (product.image) {
    editProductImages = [product.image];
  } else {
    editProductImages = [];
  }
  renderEditProductImages();

  const selectSection = document.querySelector("#edit-product-section");
  if (selectSection) {
    selectSection.replaceChildren(
      ...sections.map(
        (s) =>
          new Option(
            s.name,
            s._id,
            s._id === (product.section?._id || product.section),
            s._id === (product.section?._id || product.section)
          )
      )
    );
  }

  modal.classList.remove("hidden");
}

function renderEditProductImages() {
  const grid = document.querySelector("#edit-images-grid");
  const countEl = document.querySelector("#edit-images-count");
  if (!grid) return;

  if (countEl) countEl.textContent = `${editProductImages.length} images`;
  grid.innerHTML = "";

  if (editProductImages.length === 0) {
    grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-3 text-slate-400 text-[11px]">No product images</div>`;
    return;
  }

  editProductImages.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "relative aspect-square rounded bg-white border border-[#D5D9D9] p-1 shadow-xs group flex items-center justify-center overflow-hidden";

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Image ${idx + 1}`;
    img.className = "w-full h-full object-contain";

    if (idx === 0) {
      const mainBadge = document.createElement("span");
      mainBadge.className = "absolute top-1 right-1 bg-[#FF9900] text-[#0F1111] text-[9px] font-black px-1 rounded shadow-xs";
      mainBadge.textContent = "Main";
      card.append(mainBadge);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "absolute top-1 left-1 w-4 h-4 rounded-full bg-[#B12704] hover:bg-rose-700 text-white flex items-center justify-center text-[9px] shadow transition-colors";
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.title = "Delete image";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      editProductImages.splice(idx, 1);
      renderEditProductImages();
    };

    card.append(img, removeBtn);
    grid.append(card);
  });
}

async function deleteProduct(product) {
  const productId = id(product);
  if (!productId) return;

  const accepted = await confirm(`Are you sure you want to delete product "${product.name}"?`);
  if (!accepted) return;

  try {
    await request("/api/admin/delete_product", {
      method: "DELETE",
      body: { product_id: productId }
    });

    toast("Product deleted successfully", "success");
    await loadProducts(1, false);
    loadOverviewStats();
  } catch (error) {
    console.error("Delete product error:", error);
    toast("Could not delete product", "error");
  }
}

// ======================================================
// Category Management
// ======================================================
async function loadSections() {
  try {
    const response = await request("/api/get_all_sections");
    sections = response.data || [];

    const select = document.querySelector("#product-section");
    if (select) {
      select.replaceChildren(
        ...sections.map((s) => new Option(s.name, s._id))
      );
    }

    const sectionsList = document.querySelector("#sections-list");
    if (!sectionsList) return;

    if (!sections.length) {
      sectionsList.innerHTML = `<p class="text-xs text-slate-400 py-2 col-span-full">No categories registered yet.</p>`;
      return;
    }

    sectionsList.replaceChildren(
      ...sections.map((sectionItem) => {
        const card = document.createElement("div");
        card.className = "bg-[#F7F7F7] border border-[#D5D9D9] rounded p-3 flex items-center justify-between shadow-2xs";

        const name = text("span", sectionItem.name);
        name.className = "font-bold text-xs text-[#0F1111]";

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-1.5";

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "w-7 h-7 rounded bg-white border border-[#D5D9D9] text-[#0F1111] hover:bg-[#F0F2F2] flex items-center justify-center text-[11px] transition-colors";
        edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
        edit.onclick = async () => editSection(sectionItem);

        const del = document.createElement("button");
        del.type = "button";
        del.className = "w-7 h-7 rounded bg-white border border-[#D5D9D9] text-[#B12704] hover:bg-[#FCF4F4] flex items-center justify-center text-[11px] transition-colors";
        del.innerHTML = '<i class="fa-solid fa-trash"></i>';
        del.onclick = async () => deleteSection(sectionItem);

        actions.append(edit, del);
        card.append(name, actions);
        return card;
      })
    );
  } catch (error) {
    console.error("Load sections error:", error);
  }
}

async function editSection(sectionItem) {
  const sectionId = id(sectionItem);
  if (!sectionId) return;

  const newName = await promptDialog("Enter new category name:", sectionItem.name || "");
  if (newName === null) return;

  const cleanName = newName.trim();
  if (!cleanName) {
    toast("Category name is required", "error");
    return;
  }

  try {
    await request("/api/admin/update_section", {
      method: "PUT",
      body: {
        section_id: sectionId,
        section_name: cleanName
      }
    });

    toast("Category updated successfully", "success");
    await loadProducts(1, false);
    await loadSections();
  } catch (error) {
    console.error("Edit section error:", error);
    toast("Could not update category", "error");
  }
}

async function deleteSection(sectionItem) {
  const sectionId = id(sectionItem);
  if (!sectionId) return;

  const accepted = await confirm(`Are you sure you want to delete category "${sectionItem.name}"?`);
  if (!accepted) return;

  try {
    await request("/api/admin/delete_section", {
      method: "DELETE",
      body: { section_id: sectionId }
    });

    toast("Category deleted successfully", "success");
    await loadProducts(1, false);
    await loadSections();
  } catch (error) {
    console.error("Delete section error:", error);
    toast("Could not delete category", "error");
  }
}

// ======================================================
// Customer Support Issues
// ======================================================
async function loadProblems() {
  const root = document.querySelector("#problems-list");
  if (!root) return;

  state(root, "Loading customer issues…");

  try {
    const response = await request("/api/get_problems");
    const problems = response.data || [];

    if (!problems.length) {
      state(root, "No reports recorded yet.", "empty");
      return;
    }

    root.replaceChildren(...problems.map(problemRow));
  } catch (error) {
    console.error("Load problems error:", error);
    state(root, "Could not load customer issues.", "error");
  }
}

function problemRow(p) {
  const tr = document.createElement("tr");
  tr.className = "hover:bg-[#F7F7F7] transition-colors border-b border-[#E7E7E7] text-xs align-top";

  const tdProblem = document.createElement("td");
  tdProblem.className = "py-3.5 px-4 text-[#0F1111] whitespace-pre-line max-w-md";
  tdProblem.textContent = p.problem || "—";

  const tdOrder = text("td", p.order_number || "—");
  tdOrder.className = "py-3.5 px-4 font-bold text-[#0F1111] whitespace-nowrap";

  const tdContact = document.createElement("td");
  tdContact.className = "py-3.5 px-4 space-y-1";

  const phone = p.phone_number;
  if (phone) {
    const phoneLink = document.createElement("a");
    phoneLink.href = `tel:${phone}`;
    phoneLink.className = "flex items-center gap-1.5 text-[#007185] hover:text-[#C7511F] font-mono text-[11px] transition-colors";
    const phoneText = document.createElement("span");
    phoneText.textContent = phone;
    const phoneIcon = document.createElement("i");
    phoneIcon.className = "fa-solid fa-phone text-[#565959] text-[9px]";
    phoneLink.append(phoneText, phoneIcon);
    tdContact.append(phoneLink);
  }

  const wa = p.whatsApp_number;
  if (wa) {
    const cleanWa = String(wa).replace(/\D/g, "");
    const waLink = document.createElement("a");
    waLink.href = `https://wa.me/${cleanWa}`;
    waLink.target = "_blank";
    waLink.rel = "noopener noreferrer";
    waLink.className = "inline-flex items-center gap-1 text-[#067D62] hover:text-emerald-800 bg-[#E7F4EE] border border-[#C6F6D5] px-1.5 py-0.5 rounded font-bold text-[10px] transition-colors";
    const waText = document.createElement("span");
    waText.textContent = wa;
    const waIcon = document.createElement("i");
    waIcon.className = "fa-brands fa-whatsapp text-[#067D62]";
    waLink.append(waText, waIcon);
    tdContact.append(waLink);
  }

  if (!phone && !wa) {
    tdContact.textContent = "—";
    tdContact.className = "py-3.5 px-4 text-[#565959]";
  }

  const tdGps = document.createElement("td");
  tdGps.className = "py-3.5 px-4 text-center";

  const gpsUrl = p.GPS_URL;
  if (gpsUrl) {
    const fullGpsUrl = gpsUrl.startsWith("http") ? gpsUrl : `https://${gpsUrl}`;
    const gpsBtn = document.createElement("a");
    gpsBtn.href = fullGpsUrl;
    gpsBtn.target = "_blank";
    gpsBtn.rel = "noopener noreferrer";
    gpsBtn.className = "inline-flex items-center gap-1 bg-[#FFF8E7] hover:bg-[#FFECC2] text-[#B45309] font-bold px-2 py-0.5 rounded border border-[#FEEBC8] text-[11px] transition-colors";
    gpsBtn.innerHTML = '<i class="fa-solid fa-location-dot text-[#B12704]"></i><span>Location</span>';
    tdGps.append(gpsBtn);
  } else {
    tdGps.textContent = "—";
    tdGps.className = "py-3.5 px-4 text-center text-[#565959]";
  }

  const tdImage = document.createElement("td");
  tdImage.className = "py-3.5 px-4 text-center";

  if (p.image) {
    const link = document.createElement("a");
    link.href = p.image;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = p.image;
    img.alt = "Issue image";
    img.className = "w-10 h-10 object-cover rounded border border-[#D5D9D9] mx-auto";

    link.append(img);
    tdImage.append(link);
  } else {
    tdImage.textContent = "—";
    tdImage.className = "py-3.5 px-4 text-center text-[#565959]";
  }

  const tdDate = document.createElement("td");
  tdDate.className = "py-3.5 px-4 text-center text-[#565959] whitespace-nowrap text-[11px]";
  tdDate.textContent = p.createdAt ? new Date(p.createdAt).toLocaleString("en-US") : "—";

  tr.append(tdProblem, tdOrder, tdContact, tdGps, tdImage, tdDate);
  return tr;
}

// ======================================================
// User Management
// ======================================================
async function loadUsers() {
  const root = document.querySelector("#users-list");
  if (!root) return;

  try {
    const users = (await request("/api/admin/get_all_users")).data || [];

    if (!users.length) {
      state(root, "No registered users.", "empty");
      return;
    }

    root.replaceChildren(
      ...users.map((u) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-[#F7F7F7] transition-colors border-b border-[#E7E7E7]";

        const tdName = text("td", u.name || "User");
        tdName.className = "py-3 px-4 font-bold text-[#0F1111]";

        const tdEmail = text("td", u.email || "—");
        tdEmail.className = "py-3 px-4 text-[#565959] text-xs font-mono";

        const tdRole = document.createElement("td");
        tdRole.className = "py-3 px-4";
        const roleBadge = document.createElement("span");

        if (u.role === "super_admin") {
          roleBadge.className = "px-2 py-0.5 rounded text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-200";
          roleBadge.textContent = "Super Admin";
        } else if (u.role === "admin") {
          roleBadge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-[#FFF8E7] text-[#B45309] border border-[#FEEBC8]";
          roleBadge.textContent = "Admin";
        } else {
          roleBadge.className = "px-2 py-0.5 rounded text-[11px] font-medium bg-[#F0F2F2] text-[#565959] border border-[#D5D9D9]";
          roleBadge.textContent = "Customer";
        }
        tdRole.append(roleBadge);

        const tdAction = document.createElement("td");
        tdAction.className = "py-3 px-4 text-center";

        const btn = document.createElement("button");
        const protectedRole = u.role === "super_admin";

        btn.disabled = protectedRole;
        btn.className = protectedRole
          ? "px-3 py-1 rounded text-xs font-bold bg-[#F0F2F2] text-slate-400 cursor-not-allowed border border-[#D5D9D9]"
          : u.role === "admin"
          ? "px-3 py-1 rounded text-xs font-bold bg-white text-[#B12704] border border-[#D5D9D9] hover:bg-[#FCF4F4] transition-colors"
          : "px-3 py-1 rounded text-xs font-bold bg-[#FF9900] text-[#0F1111] hover:bg-[#E68A00] transition-colors";

        btn.textContent = protectedRole
          ? "Protected"
          : u.role === "admin"
          ? "Demote to User"
          : "Promote to Admin";

        btn.onclick = async () => {
          try {
            await request(
              u.role === "admin"
                ? "/api/admin/update_admin_to_user"
                : "/api/admin/upgrade_user_to_admin",
              {
                method: "PUT",
                body: { user_id: id(u) }
              }
            );

            toast("User role updated successfully", "success");
            await loadUsers();
            await loadOverviewStats();
          } catch (error) {
            console.error("Update user error:", error);
            toast("Could not update user role", "error");
          }
        };

        tdAction.append(btn);
        tr.append(tdName, tdEmail, tdRole, tdAction);
        return tr;
      })
    );
  } catch (error) {
    console.error("Load users error:", error);
    state(root, "Could not load users list.", "error");
  }
}

// ======================================================
// Form Submissions
// ======================================================
function forms() {
  const sectionForm = document.querySelector("#section-form");
  if (sectionForm) {
    sectionForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await request("/api/admin/add_section", {
          method: "POST",
          body: {
            section_name: e.target.section_name.value
          }
        });

        e.target.reset();
        toast("Category added successfully", "success");
        await loadSections();
      } catch (error) {
        console.error("Add section error:", error);
        toast("Could not add category", "error");
      }
    };
  }

  const productForm = document.querySelector("#product-form");
  if (productForm) {
    productForm.onsubmit = async (e) => {
      e.preventDefault();

      const submitBtn = document.querySelector("#add-product-submit-btn");
      const body = Object.fromEntries(new FormData(e.target));
      const quantity = Number(body.quantity);

      if (!Number.isInteger(quantity) || quantity < 0) {
        toast("Quantity must be a positive integer", "error");
        return;
      }

      if (newProductImages.length === 0) {
        toast("Please select or upload at least one image for the product", "error");
        return;
      }

      body.quantity = quantity;
      body.product_price = Number(body.product_price);
      body.product_discount = Number(body.product_discount || 0);
      body.images = newProductImages;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving product...</span>';
        }

        await request("/api/admin/add_product", {
          method: "POST",
          body
        });

        e.target.reset();
        newProductImages = [];
        renderNewProductImages();

        toast("Product and all its images added successfully to store", "success");
        await loadProducts(1, false);
        await loadOverviewStats();
      } catch (error) {
        console.error("Add product error:", error);
        toast(error.message || "Could not add product", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-plus-circle"></i> <span>Add Product to Store</span>';
        }
      }
    };
  }

  const couponForm = document.querySelector("#coupon-form");
  if (couponForm) {
    couponForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(e.target));
        body.discount = Number(body.discount);
        body.end_time = new Date(body.end_time).toISOString();

        await request("/api/admin/add_coupon", {
          method: "POST",
          body
        });

        toast("Coupon created and activated successfully", "success");
        e.target.reset();
      } catch (error) {
        console.error("Add coupon error:", error);
        toast("Could not create coupon", "error");
      }
    };
  }

  const settingsForm = document.querySelector("#settings-form");
  if (settingsForm) {
    (async () => {
      try {
        const current = (await request("/api/get_store_settings", { silent: true })).data || {};
        if (current.store_name) settingsForm.store_name.value = current.store_name;
        if (current.store_description) settingsForm.store_description.value = current.store_description;
        if (current.store_phone) settingsForm.store_phone.value = current.store_phone;
        if (current.store_whatsApp_number) settingsForm.store_whatsApp_number.value = current.store_whatsApp_number;
        if (current.store_GPS) settingsForm.store_GPS.value = current.store_GPS;

        const design = current.store_design || {};
        if (design.primary_color) settingsForm.primary_color.value = design.primary_color;
        if (design.secondary_color) settingsForm.secondary_color.value = design.secondary_color;
        if (design.background_color) settingsForm.background_color.value = design.background_color;
        if (design.text_color) settingsForm.text_color.value = design.text_color;
        if (design.font_family) settingsForm.font_family.value = design.font_family;
        if (design.banner_text) settingsForm.banner_text.value = design.banner_text;
      } catch (e) {}
    })();

    settingsForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const raw = Object.fromEntries(new FormData(e.target));

        const store_design = {
          primary_color: raw.primary_color,
          secondary_color: raw.secondary_color,
          background_color: raw.background_color,
          text_color: raw.text_color,
          font_family: raw.font_family,
          banner_text: raw.banner_text
        };

        await request("/api/store", {
          method: "POST",
          body: {
            store_name: raw.store_name,
            store_description: raw.store_description,
            store_phone: raw.store_phone,
            store_whatsApp_number: raw.store_whatsApp_number,
            store_GPS: raw.store_GPS,
            store_design
          }
        });

        toast("Store and branding settings saved successfully", "success");
      } catch (error) {
        console.error("Save settings error:", error);
        toast("Could not save settings", "error");
      }
    };
  }
}

// ======================================================
// Initialize
// ======================================================
guard().then(async () => {
  if (!user) return;

  if (isSuper) {
    forms();
    await loadProducts(1, false);
    await loadUsers();
    await loadProblems();
  } else {
    await loadProducts(1, false);
  }
});