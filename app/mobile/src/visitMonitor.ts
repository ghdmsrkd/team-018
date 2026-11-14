import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type Authorization =
  | 'notDetermined'
  | 'restricted'
  | 'denied'
  | 'whenInUse'
  | 'always'
  | 'unknown';

export type MonitorState = {
  authorization: Authorization;
  /** Bridge compatibility only; false only after the legacy stop() call. */
  optedIn: boolean;
  /** True only while native startMonitoringVisits is actually active. */
  monitoring: boolean;
  /** True once the app has asked iOS for Always on this install. */
  alwaysRequested: boolean;
  /** True while the first iOS prompt from an explicit request is still unanswered. */
  requestPending?: boolean;
  visitCount: number;
  lastError: string | null;
};

/** Times are epoch milliseconds; null means Core Location had no valid date. */
export type Visit = {
  id: number;
  latitude: number;
  longitude: number;
  horizontalAccuracy: number;
  arrivalAt: number | null;
  departureAt: number | null;
  receivedAt: number;
  /** Place tag on a stored visit. JS-only sample rows have none. */
  tag?: VisitTag | null;
  /** Place ID chosen for this visit: Google as-is, Kakao as "kakao:<id>". Only the ID is stored. */
  googlePlaceId?: string | null;
  /**
   * JS only: ids of hidden duplicate rows (CLVisit arrival callbacks) merged into this one by
   * normalizeVisits. Clearing a tag or place must clear these too, or the value comes back.
   */
  mergedVisitIds?: number[];
};

export type VisitTag = {
  id: number;
  name: string;
  /** manual: chosen by the user. auto: matched to a manually tagged place within 50 m. */
  source: 'manual' | 'auto';
  /** Meters to the matched manual place; auto assignments only. */
  matchDistance: number | null;
};

export type PlaceTag = {
  id: number;
  name: string;
  isPreset: boolean;
};

type Native = {
  getState(): Promise<MonitorState>;
  getVisits(limit: number): Promise<Visit[]>;
  getVisitsInRange(
    fromMs: number,
    toMs: number,
    openSinceMs: number,
  ): Promise<Visit[]>;
  startMonitoring(): Promise<MonitorState>;
  requestAlwaysAuthorization(): Promise<MonitorState>;
  stopMonitoring(): Promise<MonitorState>;
  openSettings(): Promise<void>;
  getTags(): Promise<PlaceTag[]>;
  createTag(name: string): Promise<PlaceTag>;
  renameTag(tagId: number, name: string): Promise<PlaceTag>;
  setVisitTag(visitId: number, tagId: number): Promise<void>;
  clearVisitTag(visitId: number): Promise<void>;
  setVisitPlace(visitId: number, placeId: string): Promise<void>;
  clearVisitPlace(visitId: number): Promise<void>;
};

const native: Native | undefined =
  Platform.OS === 'ios' ? NativeModules.VisitMonitorModule : undefined;

export const isSupported = native != null;

export const visitMonitor = {
  getState: () => native!.getState(),
  /** Newest rows by received time. Limited; use getVisitsInRange for summaries. */
  getVisits: (limit = 200) => native!.getVisits(limit),
  /** Every row that can overlap [fromMs, toMs), with no row limit. See the native docs. */
  getVisitsInRange: (fromMs: number, toMs: number, openSinceMs: number) =>
    native!.getVisitsInRange(fromMs, toMs, openSinceMs),
  /** Explicit user action only. Asks iOS for Always if needed; never call automatically. */
  requestAlways: () => native!.requestAlwaysAuthorization(),
  /** @deprecated Use requestAlways. */
  start: () => native!.startMonitoring(),
  /** @deprecated Monitoring is automatic. Pauses until the next app launch. */
  stop: () => native!.stopMonitoring(),
  openSettings: () => native!.openSettings(),
  getTags: () => native!.getTags(),
  createTag: (name: string) => native!.createTag(name),
  renameTag: (tagId: number, name: string) => native!.renameTag(tagId, name),
  setVisitTag: (visitId: number, tagId: number) =>
    native!.setVisitTag(visitId, tagId),
  clearVisitTag: (visitId: number) => native!.clearVisitTag(visitId),
  /** Stores only the place ID (see storedPlaceId); tags and 50 m matching are separate. */
  setVisitPlace: (visitId: number, placeId: string) =>
    native!.setVisitPlace(visitId, placeId),
  clearVisitPlace: (visitId: number) => native!.clearVisitPlace(visitId),
  subscribe(listener: () => void): () => void {
    if (!native) {
      return () => {};
    }
    const sub = new NativeEventEmitter(
      NativeModules.VisitMonitorModule,
    ).addListener('visitMonitorChanged', listener);
    return () => sub.remove();
  },
};
