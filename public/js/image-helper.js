/**
 * ==============================================================================
 * MATGARI — Unified Smart Product Image Helper
 * Resolves accurate, category-aware images and provides seamless fallback handling
 * across Product Listings, Product Detail, Cart, and Order Management.
 * ==============================================================================
 */

// Legacy generic placeholder that caused mismatched images across the store
const GENERIC_PHONE_PLACEHOLDER_SUBSTRING = 'photo-1592750475338-74b7b21085ab';

// Curated high-resolution image repository by category
export const CATEGORY_IMAGE_MAP = {
  // 1. Cameras and content creator gear
  camera: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&auto=format&fit=crop&q=80',
  // 2. Over-ear headphones and earbuds
  headphones: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
  earbuds: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80',
  // 3. Smartphones and mobile devices
  phone: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80',
  // 4. Smart TVs and 4K OLED displays
  tv: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=600&auto=format&fit=crop&q=80',
  // 5. Refrigerators and major appliances
  fridge: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=600&auto=format&fit=crop&q=80',
  // 6. Digital air fryers
  airfryer: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600&auto=format&fit=crop&q=80',
  // 7. Espresso and coffee machines
  coffee: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&auto=format&fit=crop&q=80',
  // 8. Smart robot vacuums
  vacuum: 'https://images.unsplash.com/photo-1610492461128-4bc2794c4897?w=600&auto=format&fit=crop&q=80',
  // 9. Laptops and computing
  laptop: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop&q=80',
  // 10. Smartwatches
  watch: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
  // 11. Athletic shoes and sneakers
  shoes: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
  // 12. Luxury perfumes and fragrances
  perfume: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600&auto=format&fit=crop&q=80',
  // 13. Blenders and food processors
  blender: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=600&auto=format&fit=crop&q=80',
  // 14. Washing machines
  washer: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&auto=format&fit=crop&q=80',
  // 15. Microwaves and ovens
  oven: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=600&auto=format&fit=crop&q=80',
  // 16. Tablets and iPads
  tablet: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&auto=format&fit=crop&q=80',
  // 17. Tech accessories and adapters
  accessories: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80',
  // Default professional appliance/product fallback
  default: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80'
};

// Global in-memory catalog cache to reconcile orders and cart items
const _catalogById = new Map();
let _cachedCatalog = [];

export function setCatalogCache(products) {
  if (!Array.isArray(products) || products.length === 0) return;
  products.forEach((prod) => {
    const key = String(prod?._id || prod?.id || '');
    if (key) _catalogById.set(key, prod);
  });
  _cachedCatalog = Array.from(_catalogById.values());
}

export function getCatalogCache() {
  return _cachedCatalog;
}

/**
 * Checks if a given image URL string is valid, non-empty, and not the unwanted placeholder
 */
export function isValidProductImage(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return false;
  const trimmed = imgUrl.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;
  if (trimmed.includes(GENERIC_PHONE_PLACEHOLDER_SUBSTRING)) return false;
  return true;
}

/**
 * Resolves a fallback category image from a product's name or title
 */
export function getCategoryFallbackByName(name = '') {
  const title = String(name || '').toLowerCase();

  // 1. Cameras and content creation
  if (
    title.includes('creatorcam') ||
    title.includes('camera') ||
    title.includes('photography') ||
    title.includes('dslr') ||
    title.includes('gopro') ||
    title.includes('lens')
  ) {
    return CATEGORY_IMAGE_MAP.camera;
  }

  // 2. Earbuds and AirPods
  if (
    title.includes('airpods') ||
    title.includes('airpod') ||
    title.includes('earbuds') ||
    title.includes('earphone')
  ) {
    return CATEGORY_IMAGE_MAP.earbuds;
  }

  // 3. Headphones and headsets
  if (
    title.includes('headphone') ||
    title.includes('headset')
  ) {
    return CATEGORY_IMAGE_MAP.headphones;
  }

  // 4. Phones and mobile devices
  if (
    title.includes('iphone') ||
    title.includes('phone') ||
    title.includes('smartphone') ||
    title.includes('mobile') ||
    title.includes('galaxy') ||
    title.includes('xiaomi')
  ) {
    return CATEGORY_IMAGE_MAP.phone;
  }

  // 5. TVs and displays
  if (
    title.includes('tv') ||
    title.includes('television') ||
    title.includes('oled') ||
    title.includes('display') ||
    title.includes('screen')
  ) {
    return CATEGORY_IMAGE_MAP.tv;
  }

  // 6. Refrigerators
  if (
    title.includes('refrigerator') ||
    title.includes('fridge')
  ) {
    return CATEGORY_IMAGE_MAP.fridge;
  }

  // 7. Air fryers
  if (
    title.includes('fryer') ||
    title.includes('airfryer')
  ) {
    return CATEGORY_IMAGE_MAP.airfryer;
  }

  // 8. Coffee and espresso
  if (
    title.includes('coffee') ||
    title.includes('espresso') ||
    title.includes('cappuccino')
  ) {
    return CATEGORY_IMAGE_MAP.coffee;
  }

  // 9. Robot vacuums
  if (
    title.includes('vacuum') ||
    title.includes('robot')
  ) {
    return CATEGORY_IMAGE_MAP.vacuum;
  }

  // 10. Laptops and computers
  if (
    title.includes('laptop') ||
    title.includes('macbook') ||
    title.includes('notebook') ||
    title.includes('computer') ||
    title.includes('ultrabook')
  ) {
    return CATEGORY_IMAGE_MAP.laptop;
  }

  // 11. Watches
  if (
    title.includes('watch') ||
    title.includes('smartwatch')
  ) {
    return CATEGORY_IMAGE_MAP.watch;
  }

  // 12. Shoes and sneakers
  if (
    title.includes('shoes') ||
    title.includes('sneakers') ||
    title.includes('running')
  ) {
    return CATEGORY_IMAGE_MAP.shoes;
  }

  // 13. Perfumes and fragrances
  if (
    title.includes('perfume') ||
    title.includes('fragrance') ||
    title.includes('parfum') ||
    title.includes('cologne')
  ) {
    return CATEGORY_IMAGE_MAP.perfume;
  }

  // 14. Blenders and food processors
  if (
    title.includes('blender') ||
    title.includes('juicer') ||
    title.includes('processor')
  ) {
    return CATEGORY_IMAGE_MAP.blender;
  }

  // 15. Washing machines
  if (
    title.includes('washer') ||
    title.includes('washing')
  ) {
    return CATEGORY_IMAGE_MAP.washer;
  }

  // 16. Microwaves and ovens
  if (
    title.includes('oven') ||
    title.includes('microwave')
  ) {
    return CATEGORY_IMAGE_MAP.oven;
  }

  // 17. Tablets and iPads
  if (
    title.includes('tablet') ||
    title.includes('ipad')
  ) {
    return CATEGORY_IMAGE_MAP.tablet;
  }

  return CATEGORY_IMAGE_MAP.default;
}

/**
 * Universal product image resolver.
 * Handles products from catalog, cart items, order items, and admin models.
 */
export function resolveProductImage(itemOrProduct, catalog = null) {
  if (!itemOrProduct) return CATEGORY_IMAGE_MAP.default;

  // If passed a plain string that is a valid URL
  if (typeof itemOrProduct === 'string') {
    if (isValidProductImage(itemOrProduct)) return itemOrProduct.trim();
    return getCategoryFallbackByName(itemOrProduct);
  }

  const p = itemOrProduct;
  const productName = p.name || p.product_name || p.product?.name || p.title || '';

  const productId = String(
    p.productId ||
    p.product_id ||
    (typeof p.product === 'string' ? p.product : (p.product?._id || p.product?.id)) ||
    p._id ||
    p.id ||
    ''
  );

  // 1. If catalog is provided or cached, try to cross-reference
  const activeCatalog = Array.isArray(catalog) && catalog.length > 0 ? catalog : _cachedCatalog;
  if (activeCatalog && activeCatalog.length > 0) {
    const matched = activeCatalog.find((prod) => {
      const matchId = String(prod._id || prod.id || '');
      if (productId && matchId && matchId === productId) return true;
      if (productName && prod.name && prod.name.trim().toLowerCase() === productName.trim().toLowerCase()) return true;
      return false;
    });

    if (matched) {
      const matchedImg =
        (Array.isArray(matched.images) && matched.images.find((img) => isValidProductImage(img))) ||
        (isValidProductImage(matched.image) ? matched.image : null);
      if (matchedImg) return matchedImg;
    }
  }

  // 2. Direct check on product/item image fields
  const imagesArr = Array.isArray(p.images) ? p.images : Array.isArray(p.product?.images) ? p.product.images : null;
  if (imagesArr && imagesArr.length > 0) {
    const validInArr = imagesArr.find((img) => isValidProductImage(img));
    if (validInArr) return validInArr;
  }

  // Check single image property
  const candidate = p.image || p.img || p.thumbnail || p.photo || p.picture || p.product?.image;
  if (isValidProductImage(candidate)) {
    return candidate.trim();
  }

  // 3. Fallback based on name analysis
  return getCategoryFallbackByName(productName);
}

/**
 * Attaches a bulletproof error handler to an <img> element
 * so it never breaks, never enters an infinite loop, and smoothly displays
 * the accurate category image.
 */
export function setupImgFallback(imgElement, productName = '', customFallback = null) {
  if (!imgElement) return;

  const fallback = customFallback || getCategoryFallbackByName(productName);

  imgElement.onerror = function () {
    this.onerror = null;
    this.src = fallback;
  };

  imgElement.style.transition = 'opacity 0.25s ease-in-out';
  if (imgElement.complete && imgElement.naturalHeight !== 0) {
    imgElement.style.opacity = '1';
  } else {
    imgElement.style.opacity = '0.7';
    imgElement.onload = function () {
      this.style.opacity = '1';
    };
  }
}
