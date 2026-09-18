import { initSite } from './common.js';
import { mountSiteShell } from '../components/site-shell.js';
import { toast } from '../toast.js';
import { addItem } from '../cart-store.js';

mountSiteShell({ active: 'ai' });

const messagesEl = document.querySelector('#chat-messages');
const formEl = document.querySelector('#chat-form');
const inputEl = document.querySelector('#chat-input');
const sendBtn = document.querySelector('#chat-send-btn');
const suggestionsEl = document.querySelector('#chat-suggestions');
const clearBtn = document.querySelector('#chat-clear');

let history = [];

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
       <rect width="120" height="120" fill="#F1F3F5"/>
       <path d="M30 78l20-24 14 17 10-12 16 19z" fill="#C9CFD6"/>
       <circle cx="44" cy="42" r="7" fill="#C9CFD6"/>
     </svg>`
  );

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function cleanReplyText(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} EGP`;
}

function resolveImage(src) {
  if (!src) return PLACEHOLDER_IMAGE;
  const value = String(src).trim();
  if (/^(https?:|data:)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return `/uploads/${value}`;
}

function productUrl(product) {
  return product.id ? `/product.html?id=${encodeURIComponent(product.id)}` : '#';
}

async function handleAddToCart(product, btn) {
  if (!product) return;

  btn.disabled = true;
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';

  try {
    addItem(product, 1);
    toast(`Added "${product.name || 'Product'}" to your cart!`, 'success', {
      title: 'Cart Updated'
    });
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Added!';
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }, 1200);
  } catch (err) {
    toast(`Could not add "${product.name || 'item'}" to cart: ${err.message || 'Unknown error'}`, 'error', {
      title: 'Add to Cart Failed'
    });
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'ai-product-card';

  const price = Number(product.final_price ?? product.price);
  const oldPrice = Number(product.price);
  const hasDiscount =
    Number(product.discount) > 0 && Number.isFinite(oldPrice) && oldPrice > price;

  card.innerHTML = `
    <a class="ai-product-media" href="${escapeHtml(productUrl(product))}">
      <img src="${escapeHtml(resolveImage(product.image))}"
           alt="${escapeHtml(product.name)}" loading="lazy" />
    </a>
    <button type="button" class="ai-product-add"
            aria-label="Add ${escapeHtml(product.name)} to cart">
      <i class="fa-solid fa-plus" aria-hidden="true"></i>
    </button>
    <div class="ai-product-body">
      <a class="ai-product-name" href="${escapeHtml(productUrl(product))}">${escapeHtml(product.name)}</a>
      ${product.section ? `<span class="ai-product-section">${escapeHtml(product.section)}</span>` : ''}
      <div class="ai-product-price-row">
        <span class="ai-product-price">${escapeHtml(formatPrice(price))}</span>
        ${hasDiscount ? `<span class="ai-product-old-price">${escapeHtml(formatPrice(oldPrice))}</span>` : ''}
        ${hasDiscount ? `<span class="ai-product-discount">- ${Math.round(Number(product.discount))}%</span>` : ''}
      </div>
      ${product.in_stock === false ? '<span class="ai-product-out">Currently Unavailable</span>' : ''}
    </div>
  `;

  const addBtn = card.querySelector('.ai-product-add');
  if (product.in_stock === false) {
    addBtn.disabled = true;
  } else {
    addBtn.addEventListener('click', () => handleAddToCart(product, addBtn));
  }

  return card;
}

function buildProductsCarousel(products) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-products';

  const track = document.createElement('div');
  track.className = 'ai-products-track';
  products.forEach((p) => track.appendChild(buildProductCard(p)));

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'ai-products-nav prev';
  prev.setAttribute('aria-label', 'Previous products');
  prev.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'ai-products-nav next';
  next.setAttribute('aria-label', 'Next products');
  next.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';

  prev.addEventListener('click', () => track.scrollBy({ left: -240, behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: 240, behavior: 'smooth' }));

  wrap.append(prev, track, next);

  requestAnimationFrame(() => {
    const scrollable = track.scrollWidth > track.clientWidth + 8;
    prev.hidden = !scrollable;
    next.hidden = !scrollable;
  });

  return wrap;
}

function appendUserMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-user';
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  scrollToBottom();
}

function appendAssistantMessage(text, products = []) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-msg-assistant-wrap';

  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-assistant-avatar';
  avatar.innerHTML = '<i class="fa-solid fa-robot" aria-hidden="true"></i>';

  const body = document.createElement('div');
  body.className = 'ai-msg-assistant-body';

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-assistant';
  bubble.textContent = cleanReplyText(text);
  body.appendChild(bubble);

  if (Array.isArray(products) && products.length > 0) {
    body.appendChild(buildProductsCarousel(products));
  }

  wrapper.append(avatar, body);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function appendTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.id = 'typing-indicator';
  wrapper.className = 'ai-msg-assistant-wrap';
  wrapper.innerHTML = `
    <div class="ai-msg-assistant-avatar"><i class="fa-solid fa-robot" aria-hidden="true"></i></div>
    <div class="ai-msg-assistant-body">
      <div class="ai-msg-assistant" style="display: flex; align-items: center; gap: 6px; width: fit-content;">
        <span class="ai-typing-dot"></span>
        <span class="ai-typing-dot"></span>
        <span class="ai-typing-dot"></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function removeTypingIndicator() {
  document.querySelector('#typing-indicator')?.remove();
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || sendBtn.disabled) return;

  appendUserMessage(trimmed);
  inputEl.value = '';
  inputEl.style.height = 'auto';

  sendBtn.disabled = true;
  inputEl.disabled = true;
  appendTypingIndicator();

  try {
    const res = await fetch('/api/ai_assistant', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed, history })
    });

    removeTypingIndicator();

    if (res.status === 429) {
      appendAssistantMessage('Too many requests right now — please wait a moment and try again.');
      return;
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      appendAssistantMessage('Sorry, I could not process your request right now. Please try again in a moment.');
      toast(data.message || 'An error occurred in AI Assistant', 'error');
      return;
    }

    const reply = data.data?.reply || 'Sorry, I do not have an answer for that right now.';
    const productList = Array.isArray(data.data?.products) ? data.data.products : [];

    appendAssistantMessage(reply, productList);

    history.push({ role: 'user', content: trimmed });
    history.push({ role: 'assistant', content: reply });

    history = history.slice(-10);
  } catch (err) {
    removeTypingIndicator();
    appendAssistantMessage('Sorry, a connection problem occurred with AI Assistant.');
    toast('Network connection error occurred', 'error');
  } finally {
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${inputEl.scrollHeight}px`;
});

suggestionsEl.querySelectorAll('.ai-suggestion-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    sendMessage(chip.textContent.trim());
  });
});

clearBtn?.addEventListener('click', () => {
  history = [];
  messagesEl.innerHTML = '';
  appendAssistantMessage(
    'Start fresh — tell me what product or category you are looking for and I will show them to you with prices.'
  );
  inputEl.focus();
});

initSite().then(() => {
  inputEl.focus();
});
