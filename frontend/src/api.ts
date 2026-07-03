import { storage } from './utils/storage';

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const TOKEN_KEY = 'azvio_token';

export const getToken = () => storage.secureGet<string | null>(TOKEN_KEY, null);
export const setToken = (t: string) => storage.secureSet(TOKEN_KEY, t);
export const clearToken = () => storage.secureRemove(TOKEN_KEY);

async function handle(res: Response) {
  if (!res.ok) {
    let detail = 'حدث خطأ غير متوقع';
    try {
      const e = await res.json();
      if (e?.detail) detail = typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail);
    } catch {}
    const err: Error & { status?: number } = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function api(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handle(res);
}

export async function apiUpload(path: string, formData: FormData) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return handle(res);
}
