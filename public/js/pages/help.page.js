import { request } from '../api.js';
import { toast } from '../toast.js';
import { mountSiteShell } from '../components/site-shell.js';
import { initSite } from './common.js';
import { currentUser } from '../auth-guard.js';

// Mount site shell
mountSiteShell({ active: 'help' });

// ======================================================
// Cloudinary Configuration
// ======================================================
let cloudinaryConfig = {
  cloudName: 'de95jndw0',
  uploadPreset: 'youtube mvp',
  uploadUrl: 'https://api.cloudinary.com/v1_1/de95jndw0/image/upload'
};

async function loadCloudinaryConfig() {
  try {
    const res = await request('/api/get_cloudinary_config', { silent: true });
    if (res && res.data) {
      if (res.data.cloudName) cloudinaryConfig.cloudName = res.data.cloudName;
      if (res.data.uploadPreset) cloudinaryConfig.uploadPreset = res.data.uploadPreset;
      if (res.data.uploadUrl) {
        cloudinaryConfig.uploadUrl = res.data.uploadUrl;
      } else if (res.data.cloudName) {
        cloudinaryConfig.uploadUrl = `https://api.cloudinary.com/v1_1/${res.data.cloudName}/image/upload`;
      }
    }
  } catch (e) {}
}

function uploadFileToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    xhr.open('POST', cloudinaryConfig.uploadUrl, true);

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
        } catch (e) {
          reject(new Error('Could not parse upload response'));
        }
      } else {
        reject(new Error('Failed to upload image to Cloudinary'));
      }
    };

    xhr.onerror = () => reject(new Error('Unable to connect to image upload service'));
    xhr.send(formData);
  });
}

// ======================================================
// Self-help FAQ Items
// ======================================================
const SELF_HELP_ITEMS = [
  {
    id: 'confirm-order-not-working',
    icon: 'fa-solid fa-cart-shopping',
    question: '"Confirm Order" button is not working or unresponsive when clicked',
    tips: [
      'You must be signed in first for your order to be accepted',
      'Make sure all products in your cart are currently in stock',
      'Ensure all required details are entered accurately (name, phone number, delivery address)',
      'Confirm you selected a payment method before clicking Confirm Order',
      'Check your internet connection, refresh the page, and try again',
      'If the issue persists, try removing items from the cart and adding them again'
    ]
  },
  {
    id: 'coupon-not-working',
    icon: 'fa-solid fa-ticket',
    question: 'Discount code or coupon is not working when entered',
    tips: [
      'Ensure the code is entered accurately with no extra spaces',
      'Verify that the coupon has not expired yet',
      'Some codes require a minimum order value to activate',
      'Each coupon can only be used once per customer'
    ]
  },
  {
    id: 'login-issue',
    icon: 'fa-solid fa-right-to-bracket',
    question: 'I cannot sign in or forgot my password',
    tips: [
      'Use the "Forgot your password?" link on the sign in page',
      'Make sure you enter the correct registered email address or phone number',
      'Check your spam or junk folder for the password reset email'
    ]
  },
  {
    id: 'otp-not-arriving',
    icon: 'fa-solid fa-key',
    question: 'I did not receive the verification code (OTP) via phone or email',
    tips: [
      'Wait at least one full minute before requesting a new code',
      'Verify the accuracy of the phone number or email you entered',
      'Check your cellular network reception and internet connection'
    ]
  },
  {
    id: 'display-glitch',
    icon: 'fa-solid fa-image',
    question: 'Prices or product photos are not displaying correctly',
    tips: [
      'Clear your browser cache',
      'Try doing a hard refresh (Ctrl + F5 or Cmd + Shift + R)',
      'Try opening the website from another browser to confirm it is not a device issue'
    ]
  },
  {
    id: 'quantity-limit',
    icon: 'fa-solid fa-layer-group',
    question: 'I cannot increase the item quantity in the cart past a certain number',
    tips: [
      'This means the available stock for this product is currently limited',
      'Certain products have purchase limits per customer to ensure fair availability'
    ]
  }
];

// ======================================================
// Customer Support Ticket Categories
// ======================================================
const SUPPORT_ISSUES = [
  {
    id: 'damaged-product',
    icon: 'fa-solid fa-box-open',
    title: 'Received a damaged product or different from description',
    description: 'If the product arrived broken, defective, or not matching what was ordered',
    requiresImage: true,
    urgent: false
  },
  {
    id: 'delivery-delay',
    icon: 'fa-solid fa-truck-fast',
    title: 'Order is delayed past expected delivery date',
    description: 'Your order has exceeded the expected delivery date and has not arrived',
    requiresImage: false,
    urgent: false
  },
  {
    id: 'payment-charged-order-failed',
    icon: 'fa-solid fa-credit-card',
    title: 'Charged for order but order was not confirmed',
    description: 'Payment issue requiring immediate review by our finance team',
    requiresImage: false,
    urgent: true
  },
  {
    id: 'return-exchange',
    icon: 'fa-solid fa-rotate-left',
    title: 'I want to return or exchange a product',
    description: 'Changed your mind or need a different size/color for an item received',
    requiresImage: true,
    urgent: false
  },
  {
    id: 'missing-items',
    icon: 'fa-solid fa-triangle-exclamation',
    title: 'Received an incomplete order (missing item)',
    description: 'A quantity or item is missing compared to the order invoice',
    requiresImage: true,
    urgent: false
  },
  {
    id: 'other-issue',
    icon: 'fa-solid fa-circle-question',
    title: 'Other issue not listed above',
    description: 'Describe your issue in detail and we will review it as soon as possible',
    requiresImage: false,
    urgent: false
  }
];

// ======================================================
// DOM Elements
// ======================================================
const selfHelpList = document.querySelector('#self-help-list');
const selfHelpEmpty = document.querySelector('#self-help-empty');
const supportGrid = document.querySelector('#support-issues-grid');
const supportEmpty = document.querySelector('#support-issues-empty');
const searchInput = document.querySelector('#help-search-input');
const searchClearBtn = document.querySelector('#help-search-clear-btn');

const categorySelect = document.querySelector('#report-category');
const reportForm = document.querySelector('#report-form');
const reportFormWrap = document.querySelector('#report-form-wrap');
const reportSuccessBox = document.querySelector('#report-success-box');
const reportRefNumber = document.querySelector('#report-ref-number');
const newTicketBtn = document.querySelector('#report-new-ticket-btn');
const submitBtn = document.querySelector('#report-submit-btn');
const imageRequiredNote = document.querySelector('#image-required-note');
const descriptionInput = document.querySelector('#report-description');
const reportAuthGate = document.querySelector('#report-auth-gate');

// ======================================================
// Render Self-help FAQ Items (Accordion)
// ======================================================
function renderSelfHelp(filterText = '') {
  if (!selfHelpList) return;
  selfHelpList.innerHTML = '';

  const filtered = SELF_HELP_ITEMS.filter((item) =>
    !filterText || item.question.toLowerCase().includes(filterText.toLowerCase()) || item.tips.some((t) => t.toLowerCase().includes(filterText.toLowerCase()))
  );

  if (selfHelpEmpty) selfHelpEmpty.style.display = filtered.length === 0 ? 'block' : 'none';

  filtered.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'accordion-item';
    el.innerHTML = `
      <button type="button" class="accordion-trigger">
        <span class="q-text"><i class="${item.icon} q-icon"></i> ${item.question}</span>
        <i class="fa-solid fa-chevron-down chev"></i>
      </button>
      <div class="accordion-body">
        <ul class="fix-list">
          ${item.tips.map((t) => `<li><i class="fa-solid fa-circle-check"></i><span>${t}</span></li>`).join('')}
        </ul>
        <div class="accordion-still-stuck">
          <span>Still experiencing this issue?</span>
          <button type="button" class="button btn-secondary btn-sm still-stuck-btn" data-question="${item.question}">
            <i class="fa-solid fa-headset"></i> Contact Customer Support
          </button>
        </div>
      </div>
    `;

    el.querySelector('.accordion-trigger').onclick = () => {
      el.classList.toggle('is-open');
    };

    el.querySelector('.still-stuck-btn').onclick = () => {
      openReportForm('other-issue', item.question);
    };

    selfHelpList.appendChild(el);
  });
}

// ======================================================
// Render Customer Support Issue Cards
// ======================================================
function renderSupportIssues(filterText = '') {
  if (!supportGrid) return;
  supportGrid.innerHTML = '';

  const filtered = SUPPORT_ISSUES.filter((item) =>
    !filterText || item.title.toLowerCase().includes(filterText.toLowerCase()) || item.description.toLowerCase().includes(filterText.toLowerCase())
  );

  if (supportEmpty) supportEmpty.style.display = filtered.length === 0 ? 'block' : 'none';

  filtered.forEach((item) => {
    const card = document.createElement('div');
    card.className = `issue-card${item.urgent ? ' is-urgent' : ''}`;
    card.innerHTML = `
      <div class="issue-card-icon"><i class="${item.icon}"></i></div>
      <h3>${item.title}</h3>
      <p>${item.description}</p>
      <div class="tag-row">
        ${item.urgent ? '<span class="badge" style="background: var(--error-bg); color: var(--error);">Urgent</span>' : ''}
        ${item.requiresImage ? '<span class="badge badge-neutral"><i class="fa-solid fa-camera"></i> Photo Required</span>' : ''}
      </div>
      <button type="button" class="button btn-accent btn-block report-issue-btn">
        <i class="fa-solid fa-paper-plane"></i> Report This Issue
      </button>
    `;

    card.querySelector('.report-issue-btn').onclick = () => openReportForm(item.id, item.title);
    supportGrid.appendChild(card);
  });
}

// ======================================================
// Populate Issue Category Select Options
// ======================================================
function populateCategorySelect() {
  if (!categorySelect) return;
  SUPPORT_ISSUES.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.title;
    opt.dataset.requiresImage = item.requiresImage ? '1' : '0';
    categorySelect.appendChild(opt);
  });
}

// ======================================================
// Open Support Form with Prefilled Category
// ======================================================
function openReportForm(categoryId, prefillNote) {
  if (categorySelect) categorySelect.value = categoryId;
  updateImageRequirement();

  if (descriptionInput && prefillNote) {
    descriptionInput.placeholder = `Regarding: ${prefillNote} — Please explain the details...`;
  }

  document.querySelector('#report-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => descriptionInput?.focus(), 400);
}

function updateImageRequirement() {
  const selected = SUPPORT_ISSUES.find((i) => i.id === categorySelect?.value);
  const requiresImage = !!selected?.requiresImage;
  if (imageRequiredNote) imageRequiredNote.classList.toggle('is-visible', requiresImage);
  reportForm.dataset.imageRequired = requiresImage ? '1' : '0';
}

// ======================================================
// Search Across Both Sections
// ======================================================
function setupSearch() {
  if (!searchInput) return;
  searchInput.oninput = () => {
    const val = searchInput.value.trim();
    renderSelfHelp(val);
    renderSupportIssues(val);
  };
  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      searchInput.value = '';
      renderSelfHelp('');
      renderSupportIssues('');
      searchInput.focus();
    };
  }
}

// ======================================================
// Authentication Gate for Support Form
// ======================================================
async function setupAuthGate() {
  const user = await currentUser();

  if (!user) {
    if (reportAuthGate) reportAuthGate.style.display = '';
    if (reportForm) reportForm.style.display = 'none';
    return false;
  }

  if (reportAuthGate) reportAuthGate.style.display = 'none';
  if (reportForm) reportForm.style.display = '';
  return true;
}

// ======================================================
// Geolocation Detection
// ======================================================
function setupLocationDetect() {
  const detectBtn = document.querySelector('#detect-location-btn');
  const gpsInput = document.querySelector('#report-gps');
  if (!detectBtn || !gpsInput) return;

  if (!navigator.geolocation) {
    detectBtn.disabled = true;
    detectBtn.title = 'Browser does not support geolocation';
    return;
  }

  detectBtn.onclick = () => {
    detectBtn.disabled = true;
    const icon = detectBtn.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-spinner fa-spin';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        gpsInput.value = `https://www.google.com/maps?q=${latitude},${longitude}`;
        toast('Your location has been detected successfully', 'success');
        detectBtn.disabled = false;
        if (icon) icon.className = 'fa-solid fa-location-crosshairs';
      },
      () => {
        toast('Could not detect your location, please enter link manually', 'error');
        detectBtn.disabled = false;
        if (icon) icon.className = 'fa-solid fa-location-crosshairs';
      }
    );
  };
}

// ======================================================
// Image Upload via Cloudinary
// ======================================================
function setupImageUpload() {
  const dropZone = document.querySelector('#report-drop-zone');
  const fileInput = document.querySelector('#report-image-file');
  const urlInput = document.querySelector('#report-image-url');
  const progressTrack = document.querySelector('#report-progress-track');
  const progressFill = document.querySelector('#report-progress-fill');
  const previewWrap = document.querySelector('#report-preview-wrap');
  const previewImg = document.querySelector('#report-preview-img');
  const uploadStatus = document.querySelector('#report-upload-status');
  const removeBtn = document.querySelector('#report-remove-image-btn');

  if (!dropZone || !fileInput) return;

  dropZone.onclick = () => fileInput.click();

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  };
  ['dragleave', 'dragend'].forEach((type) => {
    dropZone.addEventListener(type, () => dropZone.classList.remove('drag-over'));
  });
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]);
  };

  fileInput.onchange = (e) => {
    if (e.target.files?.length) handleFile(e.target.files[0]);
  };

  removeBtn.onclick = () => {
    urlInput.value = '';
    fileInput.value = '';
    previewWrap.classList.remove('is-visible');
    dropZone.style.display = '';
  };

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      toast('Please select a valid image file (JPG, PNG, WebP)', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Image file is too large. Maximum size is 10 MB', 'error');
      return;
    }

    previewImg.src = URL.createObjectURL(file);
    previewWrap.classList.add('is-visible');
    uploadStatus.textContent = 'Uploading...';
    progressTrack.classList.add('is-visible');
    progressFill.style.width = '0%';
    urlInput.value = '';

    try {
      const secureUrl = await uploadFileToCloudinary(file, (percent) => {
        progressFill.style.width = `${percent}%`;
      });
      urlInput.value = secureUrl;
      uploadStatus.textContent = 'Image uploaded successfully ✓';
      toast('Image uploaded successfully', 'success');
    } catch (err) {
      console.error('Upload error:', err);
      uploadStatus.textContent = 'Upload failed, please try again';
      toast(err.message || 'Image upload failed', 'error');
    } finally {
      setTimeout(() => progressTrack.classList.remove('is-visible'), 1000);
    }
  }
}

// ======================================================
// Submit Support Ticket Form
// ======================================================
function setupFormSubmit() {
  if (!reportForm) return;

  categorySelect.onchange = updateImageRequirement;

  reportForm.onsubmit = async (e) => {
    e.preventDefault();

    const category = categorySelect.value;
    if (!category) {
      toast('Please select an issue type', 'error');
      return;
    }

    const imageUrl = document.querySelector('#report-image-url').value.trim();
    const requiresImage = reportForm.dataset.imageRequired === '1';
    if (requiresImage && !imageUrl) {
      toast('Please attach a photo explaining the issue first', 'error');
      return;
    }

    const whatsAppNumber = document.querySelector('#report-whatsapp').value.trim();
    const gpsUrl = document.querySelector('#report-gps').value.trim();
    const phoneNumber = document.querySelector('#report-phone').value.trim();
    const description = descriptionInput.value.trim();

    if (!phoneNumber || !whatsAppNumber || !gpsUrl || !description) {
      toast('Please fill in all required fields', 'error');
      return;
    }

    const payload = {
      problem: `[${SUPPORT_ISSUES.find((i) => i.id === category)?.title || category}] ${description}`,
      phone_number: phoneNumber,
      whatsApp_number: whatsAppNumber,
      GPS_URL: gpsUrl,
      order_number: document.querySelector('#report-order-number').value.trim(),
      image: imageUrl
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

    try {
      const res = await request('/api/admin/add_problem', {
        method: 'POST',
        body: payload
      });

      reportFormWrap.style.display = 'none';
      reportSuccessBox.classList.add('is-visible');
      reportRefNumber.textContent = res?.data?._id ? `Ticket #: ${res.data._id}` : '';

      toast('Your ticket has been submitted successfully', 'success');
    } catch (err) {
      console.error('Submit report error:', err);
      if (err?.status === 401) {
        toast('Your session has expired. Please sign in again', 'error');
        setupAuthGate();
      } else {
        toast(err?.message || 'Could not submit ticket, please try again', 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Ticket to Customer Support';
    }
  };

  if (newTicketBtn) {
    newTicketBtn.onclick = () => {
      reportForm.reset();
      document.querySelector('#report-image-url').value = '';
      document.querySelector('#report-preview-wrap').classList.remove('is-visible');
      updateImageRequirement();
      reportSuccessBox.classList.remove('is-visible');
      reportFormWrap.style.display = '';
      document.querySelector('#report-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }
}

// ======================================================
// Initialization
// ======================================================
initSite().then(() => {
  populateCategorySelect();
  renderSelfHelp();
  renderSupportIssues();
  setupSearch();
  setupImageUpload();
  setupLocationDetect();
  setupFormSubmit();
  setupAuthGate();
  loadCloudinaryConfig();
});
