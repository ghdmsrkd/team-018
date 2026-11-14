import type { ApiError, GeocodeRequest } from '@haru/schema';
import { getApiUrl } from './chatClient';

/** One region from the relay's Kakao coord2regioncode response (B = 법정동, H = 행정동). */
export type Region = {
  type: 'B' | 'H' | string;
  name: string;
};

export type GeocodeResult =
  | { state: 'ok'; regions: Region[] }
  | { state: 'unconfigured' }
  | { state: 'notConfigured' }
  | { state: 'invalid' }
  | { state: 'error'; detail: string };

/** Only lat/lng are sent (GeocodeRequest); no visit id, times, tags or accuracy. */
export function geocodeRequestFor(v: {
  latitude: number;
  longitude: number;
}): GeocodeRequest | null {
  const { latitude: lat, longitude: lng } = v;
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

/**
 * POST /geocode (Kakao administrative region, relayed by Lambda). Call only from an explicit
 * tap; it sends the visit's coordinates. Independent of /places/nearby.
 */
export async function geocodeVisit(
  visit: { latitude: number; longitude: number },
  url?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult> {
  const req = geocodeRequestFor(visit);
  if (!req) {
    return { state: 'invalid' };
  }
  const base = url === undefined ? await getApiUrl() : url;
  if (!base) {
    return { state: 'unconfigured' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetchImpl(`${base.replace(/\/+$/, '')}/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    const body: any = await res.json().catch(() => ({}));
    if (res.status === 501) {
      return { state: 'notConfigured' };
    }
    if (!res.ok) {
      const err = body as ApiError;
      return {
        state: 'error',
        detail: err.detail ?? err.error ?? `HTTP ${res.status}`,
      };
    }
    const docs: any[] = Array.isArray(body?.documents) ? body.documents : [];
    const regions = docs
      .filter(d => d && typeof d.address_name === 'string' && d.address_name)
      .map(d => ({
        type: String(d.region_type ?? ''),
        name: d.address_name as string,
      }));
    return { state: 'ok', regions };
  } catch (e: any) {
    return {
      state: 'error',
      detail: e?.name === 'AbortError' ? '시간 초과' : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}
