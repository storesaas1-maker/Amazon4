import { toast } from './toast.js';
export async function request(path, { method = 'GET', body, silent = false } = {}) {
  const options = { method, credentials: 'include', headers: { Accept: 'application/json' } };
  if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  let response, data;
  try {
    response = await fetch(path, options);
    data = await response.json().catch(() => ({}));
  } catch (netErr) {
    const errorMsg = 'Unable to connect to server. Please check your internet connection and try again.';
    if (!silent) toast(errorMsg, 'error', { title: 'Network Connection Error' });
    throw new Error(errorMsg);
  }

  if (!response.ok || data.success === false || data.authenticated === false) {
    let errorMsg = data?.message;
    if (!errorMsg) {
      if (response.status === 401) errorMsg = 'Authentication required. Please sign in to your account.';
      else if (response.status === 403) errorMsg = 'Access denied. You do not have permission to perform this action.';
      else if (response.status === 404) errorMsg = 'The requested item or page was not found.';
      else if (response.status === 429) errorMsg = 'Too many requests. Please wait a moment and try again.';
      else if (response.status >= 500) errorMsg = 'Server encountered an unexpected error. Please try again later.';
      else errorMsg = 'Unable to complete your request. Please try again.';
    }

    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    if (!silent) {
      toast(errorMsg, 'error', {
        title: response.status >= 500 ? 'Server Error' : (response.status === 401 ? 'Sign In Required' : 'Notice')
      });
    }
    throw error;
  }
  return data;
}

// /api/get_products is paginated (up to 50 items per page), not returned all at once.
// This helper collects all pages into a single array, with a safety page cap
// to prevent infinite loops in case of unexpected pagination data anomalies.
export async function fetchAllProducts({ maxPages = 200 } = {}) {
  const limit = 50;
  let page = 1;
  let all = [];

  while (page <= maxPages) {
    const res = await request(`/api/get_products?page=${page}&limit=${limit}`);
    const batch = Array.isArray(res?.data) ? res.data : [];
    all = all.concat(batch);

    const pagination = res?.pagination;
    if (!pagination || !pagination.hasNextPage) break;
    page += 1;
  }

  return all;
}

// /api/admin/get_all_orders is also paginated (the server caps limit at 50 even
// if limit=10000 was requested). This helper aggregates all pages for accurate
// dashboard metrics (revenue, orders count by status, etc.).
export async function fetchAllOrders({ maxPages = 500, silent = true } = {}) {
  const limit = 50;
  let page = 1;
  let all = [];

  while (page <= maxPages) {
    const res = await request(`/api/admin/get_all_orders?page=${page}&limit=${limit}`, { silent });
    const batch = Array.isArray(res?.data) ? res.data : [];
    all = all.concat(batch);

    const pagination = res?.pagination;
    if (!pagination || !pagination.hasNextPage) break;
    page += 1;
  }

  return all;
}
