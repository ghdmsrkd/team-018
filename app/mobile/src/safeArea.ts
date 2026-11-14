import { useEffect, useState } from 'react';
import { AppState, Dimensions, NativeModules } from 'react-native';

export type Insets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

type SafeAreaNative = { getSafeAreaInsets(): Promise<Insets> };

const native: SafeAreaNative | undefined = NativeModules.VisitMonitorModule
  ?.getSafeAreaInsets
  ? NativeModules.VisitMonitorModule
  : undefined;

/**
 * The real iOS window safe-area insets, read from UIKit. Re-read when the window size
 * changes (rotation) and when the app becomes active. Zero where the module is absent.
 */
export function useWindowSafeAreaInsets(): Insets {
  const [insets, setInsets] = useState<Insets>(ZERO);
  useEffect(() => {
    if (!native) {
      return;
    }
    let alive = true;
    const read = () =>
      native
        .getSafeAreaInsets()
        .then(next => {
          if (alive) {
            setInsets(prev =>
              prev.top === next.top &&
              prev.bottom === next.bottom &&
              prev.left === next.left &&
              prev.right === next.right
                ? prev
                : next,
            );
          }
        })
        .catch(() => {});
    read();
    const dims = Dimensions.addEventListener('change', read);
    const app = AppState.addEventListener('change', s => {
      if (s === 'active') {
        read();
      }
    });
    return () => {
      alive = false;
      dims.remove();
      app.remove();
    };
  }, []);
  return insets;
}
