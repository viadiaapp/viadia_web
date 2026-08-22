export type TargetPlatform = 'web' | 'android' | 'ios';

export function getActivePlatform(): TargetPlatform {

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'web';
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const capacitor = (window as any).Capacitor;

  if (capacitor) {
    try {
      if (typeof capacitor.isNativePlatform === 'function') {
        if (capacitor.isNativePlatform()) {
          const nativePlatform =
            typeof capacitor.getPlatform === 'function'
              ? capacitor.getPlatform()
              : '';

          if (nativePlatform === 'ios') {
            return 'ios';
          }

          if (nativePlatform === 'android') {
            return 'android';
          }
        }
      }

      // Fallback for older Capacitor setups
      if (typeof capacitor.getPlatform === 'function') {
        const nativePlatform = capacitor.getPlatform();

        if (nativePlatform === 'ios') {
          return 'ios';
        }

        if (nativePlatform === 'android') {
          return 'android';
        }
      }
    } catch {
      // Ignore Capacitor detection errors and continue
      // with browser-based detection.
    }
  }

  // ---------------------------------------------------------
  // 2. iOS browser / WebView
  // ---------------------------------------------------------
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (
      platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1
    );

  if (isIOS) {
    return 'ios';
  }

  // ---------------------------------------------------------
  // 3. Android browser / WebView
  // ---------------------------------------------------------
  const isAndroid = /Android/i.test(ua);

  if (isAndroid) {
    return 'android';
  }

  // ---------------------------------------------------------
  // 4. Resolution / viewport fallback
  // ---------------------------------------------------------
  const width = window.innerWidth;
  const height = window.innerHeight;

  const shortestSide = Math.min(width, height);

  const isMobileOrTabletResolution = shortestSide <= 768;

  if (isMobileOrTabletResolution) {
    return 'web';
  }

  // ---------------------------------------------------------
  // 5. Desktop / normal browser
  // ---------------------------------------------------------
  return 'web';
}