import { api } from './api';
import { storage } from './utils/storage';

const PREFIX = 'azvio_cache:';

/**
 * Read-only offline support: call this instead of api() for GET requests
 * you want available when there's no connection. On success, the response
 * is cached and returned. On failure, the last cached response (if any) is
 * returned instead, with `fromCache: true` so screens can show a banner.
 */
export async function apiCached<T = any>(
  path: string,
  cacheKey: string
): Promise<{ data: T; fromCache: boolean }> {
  const key = PREFIX + cacheKey;
  try {
    const data = await api(path);
    await storage.setItem(key, JSON.stringify(data));
    return { data, fromCache: false };
  } catch (e) {
    const cached = await storage.getItem<string | null>(key, null);
    if (cached) {
      try {
        return { data: JSON.parse(cached), fromCache: true };
      } catch {
        // fall through to rethrow below
      }
    }
    throw e;
  }
}
