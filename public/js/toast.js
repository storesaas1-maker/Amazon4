const getHost = () => {
  let node = document.querySelector('#toast-region');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast-region';
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    document.body.appendChild(node);
  }
  return node;
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function toast(message, type = 'info', options = {}) {
  const host = getHost();
  const item = document.createElement('div');

  const normalizedType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  item.className = `toast ${normalizedType} toast-${normalizedType}`;
  item.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');

  const icons = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-exclamation',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  const defaultTitles = {
    success: 'Success',
    error: 'Action Failed',
    warning: 'Notice',
    info: 'Information'
  };

  const titleText = options.title !== undefined ? options.title : (normalizedType === 'error' ? defaultTitles.error : (normalizedType === 'success' && options.withTitle ? defaultTitles.success : ''));
  const msgText = typeof message === 'string' ? message : (message?.message || 'An unexpected error occurred');

  item.innerHTML = `
    <div class="toast-icon-wrap">
      <i class="${icons[normalizedType]}"></i>
    </div>
    <div class="toast-content">
      ${titleText ? `<div class="toast-title">${escapeHtml(titleText)}</div>` : ''}
      <div class="toast-message">${escapeHtml(msgText)}</div>
    </div>
    <button type="button" class="toast-close-btn" aria-label="Dismiss notification">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  let isDismissed = false;
  function dismiss() {
    if (isDismissed) return;
    isDismissed = true;
    item.classList.remove('show');
    item.classList.add('removing');
    setTimeout(() => {
      if (item.parentNode) item.remove();
    }, 240);
  }

  const closeBtn = item.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
  }

  host.appendChild(item);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    item.classList.add('show');
  });

  const duration = options.duration || (normalizedType === 'error' ? 5200 : 3800);
  let timer = setTimeout(dismiss, duration);

  item.addEventListener('mouseenter', () => clearTimeout(timer));
  item.addEventListener('mouseleave', () => {
    if (!isDismissed) timer = setTimeout(dismiss, 1800);
  });

  return item;
}

toast.success = (msg, opts) => toast(msg, 'success', opts);
toast.error = (msg, opts) => toast(msg, 'error', opts);
toast.warning = (msg, opts) => toast(msg, 'warning', opts);
toast.info = (msg, opts) => toast(msg, 'info', opts);

// Expose globally as well
if (typeof window !== 'undefined') {
  window.toast = toast;
}
