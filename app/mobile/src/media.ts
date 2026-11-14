import { NativeModules, Platform } from 'react-native';
import { distanceMeters, Stay } from './summary';

export type PhotoAuth =
  | 'notDetermined'
  | 'restricted'
  | 'denied'
  | 'authorized'
  | 'limited'
  | 'unknown';

export type MediaAsset = {
  id: string;
  mediaType: 'photo' | 'video';
  createdAt: number;
  /** Seconds; 0 for photos. */
  duration: number;
  width: number;
  height: number;
  latitude?: number;
  longitude?: number;
};

type Native = {
  getAuthorization(): Promise<PhotoAuth>;
  requestAuthorization(): Promise<PhotoAuth>;
  getAssets(fromMs: number, toMs: number): Promise<MediaAsset[]>;
  getThumbnail(id: string, size: number): Promise<string>;
};

const native: Native | undefined =
  Platform.OS === 'ios' ? NativeModules.PhotoLibraryModule : undefined;

export const photos = {
  isSupported: native != null,
  getAuthorization: () => native!.getAuthorization(),
  /** Explicit user action only. */
  requestAuthorization: () => native!.requestAuthorization(),
  getAssets: (fromMs: number, toMs: number) => native!.getAssets(fromMs, toMs),
  getThumbnail: (id: string, size: number) => native!.getThumbnail(id, size),
};

export const canReadPhotos = (a: PhotoAuth | null) =>
  a === 'authorized' || a === 'limited';

/** A photo with a location farther than this from the stay is not attached to it. */
const MAX_PHOTO_DISTANCE_M = 300;

/**
 * Attaches each asset to the stay it was taken during: capture time inside the stay's
 * arrival–departure (or arrival–now while ongoing). If both the asset and the stay have a
 * location, they must also be within 300 m. Stays without a usable time get nothing.
 */
export function attachMedia(
  stays: Stay[],
  assets: MediaAsset[],
): Map<number, MediaAsset[]> {
  const out = new Map<number, MediaAsset[]>();
  const timed = stays.filter(
    s =>
      (s.status === 'complete' || s.status === 'ongoing') &&
      s.start != null &&
      s.end != null,
  );
  for (const a of assets) {
    const stay = timed.find(s => {
      if (a.createdAt < s.start! || a.createdAt > s.end!) {
        return false;
      }
      if (a.latitude == null || a.longitude == null) {
        return true;
      }
      return (
        distanceMeters(
          { latitude: a.latitude, longitude: a.longitude },
          s.visit,
        ) <= MAX_PHOTO_DISTANCE_M
      );
    });
    if (stay) {
      const list = out.get(stay.visit.id) ?? [];
      list.push(a);
      out.set(stay.visit.id, list);
    }
  }
  return out;
}

export function formatVideoDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
