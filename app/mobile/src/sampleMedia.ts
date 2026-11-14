import type { MediaAsset } from './media';
import { SAMPLE_PLACES, SAMPLE_VISITS } from './sampleVisits';

// Test images generated locally with ffmpeg (assets/sample), each marked "SAMPLE" in the
// picture. No external photos. The sample "video" is shown as its first frame plus its real
// length (4 s), the same as library videos; the mp4 it came from is kept in assets/sample
// for reference and is not bundled.
const at = (visitId: number, minutesAfterArrival: number) =>
  SAMPLE_VISITS.find(v => v.id === visitId)!.arrivalAt! +
  minutesAfterArrival * 60000;
const near = (key: string) => {
  const p = SAMPLE_PLACES.find(x => x.key === key)!;
  return { latitude: p.latitude, longitude: p.longitude };
};

export const SAMPLE_MEDIA: MediaAsset[] = [
  {
    id: 'sample-photo-1',
    mediaType: 'photo',
    createdAt: at(-9, 20),
    duration: 0,
    width: 600,
    height: 600,
    ...near('bluebottle-seongsu'),
    source: require('../assets/sample/sample-photo-1.jpg'),
    sample: true,
  },
  {
    id: 'sample-video-1',
    mediaType: 'video',
    createdAt: at(-9, 35),
    duration: 4,
    width: 640,
    height: 360,
    ...near('bluebottle-seongsu'),
    source: require('../assets/sample/sample-video-1-poster.jpg'),
    sample: true,
  },
  {
    id: 'sample-photo-2',
    mediaType: 'photo',
    createdAt: at(-10, 30),
    duration: 0,
    width: 600,
    height: 600,
    ...near('seoul-forest'),
    source: require('../assets/sample/sample-photo-2.jpg'),
    sample: true,
  },
];
