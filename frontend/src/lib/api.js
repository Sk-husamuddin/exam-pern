import { supabase } from './supabase.js';
import { API_BASE, AUTH_BASE } from './supabase.js';

// ------------------------------------------------------------------
// Shared API helper: attaches the Supabase faculty access token,
// handles 401 with one refreshSession retry, and signs out on
// persistent auth failure.
// ------------------------------------------------------------------
export async function apiRequest(path, options = {}) {
  const isAuthPath = path.startsWith('/auth/');
  const base = isAuthPath ? AUTH_BASE : API_BASE;
  const url = path.startsWith('http') ? path : `${base}${path}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(url, { ...options, headers });

  // On 401, try refreshing the Supabase session once
  if (res.status === 401 && token) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token && !refreshErr) {
      headers.Authorization = `Bearer ${refreshed.session.access_token}`;
      res = await fetch(url, { ...options, headers });
    } else {
      // Refresh failed — sign out and redirect
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        window.location.href = '/faculty/login';
      }
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch (_) {
      body = { error: `Request failed (${res.status})` };
    }
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// Convenience wrappers
export const apiGet = (path, opts) => apiRequest(path, { ...opts, method: 'GET' });
export const apiPost = (path, body, opts) =>
  apiRequest(path, { ...opts, method: 'POST', body: JSON.stringify(body) });
export const apiPut = (path, body, opts) =>
  apiRequest(path, { ...opts, method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' });
export const apiFormPost = (path, formData, opts) =>
  apiRequest(path, { ...opts, method: 'POST', body: formData });
