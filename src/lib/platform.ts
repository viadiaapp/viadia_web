export type TargetPlatform = 'auto' | 'web' | 'android' | 'ios';

export function getStoredPlatform(): TargetPlatform {
  if (typeof window === 'undefined') return 'auto';
  const saved = localStorage.getItem('viadia_platform_target') as TargetPlatform;
  if (saved === 'web' || saved === 'android' || saved === 'ios') return saved;
  return 'auto';
}

export function setStoredPlatform(platform: TargetPlatform): void {
  if (typeof window === 'undefined') return;
  if (platform === 'auto') {
    localStorage.removeItem('viadia_platform_target');
  } else {
    localStorage.setItem('viadia_platform_target', platform);
  }
}

export function getActivePlatform(): 'web' | 'android' | 'ios' {
  if (typeof window === 'undefined') return 'web';

  // 1. Check URL query override e.g. ?platform=android, ?platform=ios, or ?platform=web
  const params = new URLSearchParams(window.location.search);
  const param = params.get('platform');
  if (param === 'android' || param === 'ios' || param === 'web') {
    return param;
  }

  // 2. Check stored override in localStorage
  const stored = getStoredPlatform();
  if (stored === 'web' || stored === 'android' || stored === 'ios') {
    return stored;
  }

  // 3. Auto-detect iOS or Android UserAgent / Capacitor / WebView
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isIOSUA = /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOSUA) {
    return 'ios';
  }

  const isAndroidUA = /android/i.test(ua);
  const isWebView = /wv|Capacitor|Cordova|AndroidClient/i.test(ua) || (window as any).Capacitor !== undefined;

  if (isAndroidUA || isWebView) {
    return 'android';
  }

  return 'web';
}
