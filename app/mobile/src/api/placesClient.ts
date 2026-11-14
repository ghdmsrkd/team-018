import type {
  ApiError,
  PlaceCandidate,
  PlacesNearbyRequest,
  PlacesNearbyResponse,
  PlacesProvider,
} from '@haru/schema';
import { getApiUrl } from './chatClient';

export type NearbyResult =
  | { state: 'ok'; response: PlacesNearbyResponse }
  | { state: 'unconfigured' } // no relay URL in this build
  | { state: 'notConfigured' } // relay has no Google key (501)
  | { state: 'invalid' } // visit location not usable for search
  | { state: 'error'; detail: string };

export const PROVIDER_LABEL: Record<PlacesProvider, string> = {
  google: 'Google',
  kakao: '카카오',
};

/** Attribution text shown with provider results (no map is displayed). */
export const PROVIDER_ATTRIBUTION: Record<PlacesProvider, string> = {
  google: 'Google Maps',
  kakao: '© Kakao',
};

/**
 * ID stored in SQLite. Google IDs stay as-is so previously saved IDs keep working; Kakao
 * ids get a "kakao:" prefix so the provider is known when the ID is looked up later.
 */
export function storedPlaceId(
  c: Pick<PlaceCandidate, 'id' | 'provider'>,
): string {
  return c.provider === 'kakao' ? `kakao:${c.id}` : c.id;
}

export function parseStoredPlaceId(stored: string): {
  provider: PlacesProvider;
  id: string;
} {
  return stored.startsWith('kakao:')
    ? { provider: 'kakao', id: stored.slice('kakao:'.length) }
    : { provider: 'google', id: stored };
}

/** Same bounds the relay enforces, checked before anything leaves the device. */
export function nearbyRequestFor(v: {
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
}): PlacesNearbyRequest | null {
  const { latitude: lat, longitude: lng, horizontalAccuracy } = v;
  const ok =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Number.isFinite(horizontalAccuracy) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    horizontalAccuracy >= 0 &&
    horizontalAccuracy <= 5000;
  // Only these three fields are sent: no visit id, times, tags or other visits.
  return ok ? { lat, lng, horizontalAccuracy } : null;
}

/**
 * POST /places/nearby. Call only from an explicit user tap: this sends the visit's
 * coordinates and accuracy to the relay (AWS Lambda), which forwards them to exactly one
 * provider (Google if configured there, otherwise Kakao).
 */
export async function searchNearby(
  visit: { latitude: number; longitude: number; horizontalAccuracy: number },
  url?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<NearbyResult> {
  const req = nearbyRequestFor(visit);
  if (!req) {
    return { state: 'invalid' };
  }
  const base = url === undefined ? await getApiUrl() : url;
  if (!base) {
    return { state: 'unconfigured' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetchImpl(`${base.replace(/\/+$/, '')}/places/nearby`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
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
    const response = body as PlacesNearbyResponse;
    return {
      state: 'ok',
      response: {
        ...response,
        provider: response.provider === 'kakao' ? 'kakao' : 'google',
        places: (Array.isArray(response.places) ? response.places : []).map(
          p => ({
            ...p,
            provider:
              p.provider === 'kakao' || p.provider === 'google'
                ? p.provider
                : response.provider === 'kakao'
                ? 'kakao'
                : 'google',
          }),
        ),
      },
    };
  } catch (e: any) {
    return {
      state: 'error',
      detail: e?.name === 'AbortError' ? '시간 초과' : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}
