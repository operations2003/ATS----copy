/**
 * Backend URL resolution utility for Next.js Server & Client components.
 */

/**
 * Resolves the backend base URL for server-side Next.js route handlers.
 * Prefers BACKEND_API_URL, then NEXT_PUBLIC_API_URL, then live fallback or localhost in dev.
 */
export function getBackendBaseUrl(): string {
  const envUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://127.0.0.1:5000/api';
  }
  return 'https://ats-d4tv.onrender.com/api';
}

/**
 * Resolves the API base URL for client-side components.
 * If running on localhost, defaults to 'http://localhost:5000/api'.
 * On live deployment (e.g. Vercel), uses '/api' so requests are handled by Next.js route handlers.
 */
export function getResolvedBackendUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return '/api';
    }
  }
  return envUrl ? envUrl.trim().replace(/\/+$/, '') : 'http://localhost:5000/api';
}

