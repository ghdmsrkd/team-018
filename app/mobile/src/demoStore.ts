import type { PlaceCandidate } from '@haru/schema';
import type { NearbyResult } from './api/placesClient';
import {
  SAMPLE_PLACES,
  SAMPLE_TAG_CATALOG,
  SAMPLE_VISITS,
} from './sampleVisits';
import { distanceMeters } from './summary';
import type { PlaceTag, Visit } from './visitMonitor';

/**
 * In-memory edits for the sample mode. Mirrors the native store's tag rules (unique 1–30
 * character names, presets not renamable, sample visit ids only) but never touches SQLite,
 * native modules or the network. Everything resets when the sample mode is entered again.
 */
type Assigned = { tagId: number };

let tags: PlaceTag[] = [];
let nextTagId = 1;
let assignments = new Map<number, Assigned | null>();
let places = new Map<number, string | null>();
const listeners = new Set<() => void>();

function reset() {
  tags = SAMPLE_TAG_CATALOG.map(t => ({ ...t }));
  nextTagId = Math.max(...tags.map(t => t.id)) + 1;
  assignments = new Map();
  places = new Map();
}
reset();

const emit = () => listeners.forEach(l => l());

const fail = (message: string) => Promise.reject(new Error(message));

function normalize(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 && name.length <= 30 ? name : null;
}

const isSample = (visitId: number) => SAMPLE_VISITS.some(v => v.id === visitId);

/** Same shape as the parts of visitMonitor the tag sheet uses. */
export const demoTagApi = {
  getTags: async (): Promise<PlaceTag[]> =>
    [...tags].sort(
      (a, b) => Number(b.isPreset) - Number(a.isPreset) || a.id - b.id,
    ),
  createTag: async (raw: string): Promise<PlaceTag> => {
    const name = normalize(raw);
    if (!name) {
      return fail('A tag name must be 1 to 30 characters.');
    }
    if (tags.some(t => t.name === name)) {
      return fail('A tag with this name already exists.');
    }
    const tag = { id: nextTagId++, name, isPreset: false };
    tags.push(tag);
    emit();
    return tag;
  },
  renameTag: async (id: number, raw: string): Promise<PlaceTag> => {
    const name = normalize(raw);
    const tag = tags.find(t => t.id === id);
    if (!name) {
      return fail('A tag name must be 1 to 30 characters.');
    }
    if (!tag) {
      return fail('The visit or tag was not found.');
    }
    if (tag.isPreset) {
      return fail('Preset tags cannot be renamed.');
    }
    if (tags.some(t => t.name === name && t.id !== id)) {
      return fail('A tag with this name already exists.');
    }
    tag.name = name;
    emit();
    return { ...tag };
  },
  setVisitTag: async (visitId: number, tagId: number): Promise<void> => {
    if (!isSample(visitId) || !tags.some(t => t.id === tagId)) {
      return fail('The visit or tag was not found.');
    }
    assignments.set(visitId, { tagId });
    emit();
  },
  clearVisitTag: async (visitId: number): Promise<void> => {
    assignments.set(visitId, null);
    emit();
  },
};

/** Sample visits with the in-memory edits applied. */
export function demoVisits(): Visit[] {
  return SAMPLE_VISITS.map(v => {
    const a = assignments.get(v.id);
    const p = places.get(v.id);
    let tag = v.tag ?? null;
    if (a === null) {
      tag = null;
    } else if (a) {
      const t = tags.find(x => x.id === a.tagId);
      tag = t
        ? { id: t.id, name: t.name, source: 'manual', matchDistance: null }
        : null;
    } else if (tag) {
      // Seed tag: follow renames of its catalog entry.
      const t = tags.find(x => x.id === tag!.id);
      tag = t ? { ...tag, name: t.name } : null;
    }
    return {
      ...v,
      tag,
      googlePlaceId: p === undefined ? v.googlePlaceId ?? null : p,
    };
  });
}

export const demoStore = {
  reset: () => {
    reset();
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Sample place ids are local only, e.g. "sample:seoul-station". */
export const samplePlaceName = (stored: string) =>
  SAMPLE_PLACES.find(p => `sample:${p.key}` === stored)?.name ?? null;

/**
 * Nearby candidates for the sample mode: the fixed local sample place list, nearest first,
 * within 3 km. Nothing leaves the device.
 */
export const demoPlacesApi = {
  search: async (visit: Visit): Promise<NearbyResult> => {
    const list: PlaceCandidate[] = SAMPLE_PLACES.map(p => ({
      id: p.key,
      // Typed as a provider candidate for the shared UI; labeled "샘플" there.
      provider: 'google' as const,
      name: p.name,
      address: `서울 · ${p.category}`,
      lat: p.latitude,
      lng: p.longitude,
      distanceMeters: Math.round(distanceMeters(visit, p)),
    }))
      .filter(c => c.distanceMeters <= 3000)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 10);
    return {
      state: 'ok',
      response: {
        places: list,
        radiusMeters: 3000,
        provider: 'google',
        source: 'google_places',
      },
    };
  },
  storedId: (c: PlaceCandidate) => `sample:${c.id}`,
  setVisitPlace: async (visitId: number, stored: string): Promise<void> => {
    if (!isSample(visitId)) {
      return fail('The visit or tag was not found.');
    }
    places.set(visitId, stored);
    emit();
  },
  clearVisitPlace: async (visitId: number): Promise<void> => {
    places.set(visitId, null);
    emit();
  },
};
