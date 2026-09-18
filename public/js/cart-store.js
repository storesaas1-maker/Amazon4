import { resolveProductImage, setCatalogCache, isValidProductImage } from './image-helper.js';

const KEY = 'store-cart';
const productPrice = product => { const price = Number(product?.price), discount = Number(product?.discount || 0); return Number.isFinite(price) ? Math.max(0, price * (1 - (Number.isFinite(discount) ? discount : 0) / 100)) : 0; };
const normalize = item => {
  const id = item?.id || item?._id || item?.product_id;
  if (!id) return null;
  const price = Number(item.price);
  const rawImg = item.image;
  // If image is missing or is the generic phone placeholder, resolve it dynamically
  const resolvedImg = isValidProductImage(rawImg) ? rawImg : resolveProductImage(item);
  return {
    id: String(id),
    name: String(item.name || ''),
    price: Number.isFinite(price) ? price : 0,
    quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
    image: resolvedImg
  };
};
const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value.map(normalize).filter(Boolean) : []; } catch { return []; } };
const write = items => { localStorage.setItem(KEY, JSON.stringify(items)); window.dispatchEvent(new Event('cartchange')); return items; };
export const getCart = () => read();
export const addItem = (product, quantity = 1) => {
  const id = product?._id || product?.id;
  if (!id) return read();
  const qty = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const items = read(), prior = items.find(item => item.id === String(id));
  const resolvedImg = resolveProductImage(product);
  if (prior) {
    prior.quantity += qty;
    if (!isValidProductImage(prior.image)) {
      prior.image = resolvedImg;
    }
  } else {
    items.push({
      id: String(id),
      name: product.name || '',
      price: productPrice(product),
      quantity: qty,
      image: resolvedImg
    });
  }
  return write(items);
};
export const reconcileCart = products => {
  if (Array.isArray(products) && products.length > 0) {
    setCatalogCache(products);
  }
  const catalog = new Map((products || []).map(product => [String(product._id || product.id), product]));
  return write(read().map(item => {
    const product = catalog.get(item.id);
    const resolvedImg = product ? resolveProductImage(product, products) : (isValidProductImage(item.image) ? item.image : resolveProductImage(item, products));
    return product ? {
      ...item,
      name: product.name || item.name,
      image: resolvedImg,
      price: productPrice(product)
    } : {
      ...item,
      image: resolvedImg
    };
  }));
};
export const setQuantity = (id, quantity) => write(read().map(item => item.id === id ? { ...item, quantity: Math.max(1, Number.parseInt(quantity, 10) || 1) } : item));
export const removeItem = id => write(read().filter(item => item.id !== id));
export const clearCart = () => write([]);
export const total = () => read().reduce((sum, item) => sum + (Number.isFinite(Number(item.price)) ? Number(item.price) : 0) * (Number.isInteger(Number(item.quantity)) ? Number(item.quantity) : 0), 0);

