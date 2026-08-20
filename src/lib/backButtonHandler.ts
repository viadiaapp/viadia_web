import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';

type BackHandler = () => boolean | void;

interface RegisteredHandler {
  id: string;
  priority: number; // Higher number = higher priority
  handler: BackHandler;
}

const backHandlers: RegisteredHandler[] = [];

/**
 * Register a back button handler.
 * Return false or undefined if the handler consumed the back press.
 * Return true if it did not consume and wants the next handler to run.
 */
export function registerBackHandler(id: string, handler: BackHandler, priority = 10): () => void {
  // Remove any existing handler with same id
  const existingIdx = backHandlers.findIndex(h => h.id === id);
  if (existingIdx !== -1) {
    backHandlers.splice(existingIdx, 1);
  }

  backHandlers.push({ id, priority, handler });
  // Sort descending by priority, then by insertion order (latest first for same priority)
  backHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    const idx = backHandlers.findIndex(h => h.id === id);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

export function unregisterBackHandler(id: string): void {
  const idx = backHandlers.findIndex(h => h.id === id);
  if (idx !== -1) {
    backHandlers.splice(idx, 1);
  }
}

/**
 * Trigger back button press programmatically or from native events
 */
export function triggerBackAction(): boolean {
  if (backHandlers.length > 0) {
    // Copy to prevent mutation issues during execution
    const sorted = [...backHandlers];
    for (const item of sorted) {
      try {
        const result = item.handler();
        // If handler returns false or void, it consumed the back event
        if (result !== true) {
          return true; // consumed
        }
      } catch (e) {
        console.error('Error in back handler:', e);
      }
    }
  }
  return false;
}

/**
 * Exit the application on Android / Native platforms
 */
export function exitApplication(): void {
  try {
    if (Capacitor.isNativePlatform() || (window as any)?.Capacitor?.isNativePlatform?.()) {
      CapApp.exitApp().catch((err) => {
        console.warn('CapApp.exitApp error:', err);
      });
    } else {
      // If web, attempt to close or navigate back
      if (window.history.length > 1) {
        window.history.back();
      }
    }
  } catch (e) {
    console.warn('Could not exit app:', e);
  }
}

/**
 * Initialize Android hardware back button listener (Capacitor & Cordova & Web)
 */
export function initBackButtonListener(): () => void {
  let removeCapacitorListener: (() => void) | null = null;

  try {
    const capPlugin = CapApp;
    if (capPlugin && typeof capPlugin.addListener === 'function') {
      const listenerPromise = capPlugin.addListener('backButton', ({ canGoBack }) => {
        const consumed = triggerBackAction();
        if (!consumed) {
          exitApplication();
        }
      });
      listenerPromise.then((sub) => {
        if (sub && typeof sub.remove === 'function') {
          removeCapacitorListener = () => sub.remove();
        }
      }).catch((e) => {
        console.warn('Could not attach Capacitor backButton listener:', e);
      });
    }
  } catch (e) {
    console.warn('Capacitor App listener not available:', e);
  }

  // Fallback Cordova/PhoneGap document listener
  const onCordovaBackButton = (e: Event) => {
    e.preventDefault();
    const consumed = triggerBackAction();
    if (!consumed) {
      exitApplication();
    }
  };
  document.addEventListener('backbutton', onCordovaBackButton, false);

  return () => {
    if (removeCapacitorListener) {
      removeCapacitorListener();
    }
    document.removeEventListener('backbutton', onCordovaBackButton, false);
  };
}

/**
 * React hook for components/modals to easily register back button handling
 */
export function useBackButton(
  id: string,
  isActive: boolean,
  onBack: () => void,
  priority = 50
) {
  useEffect(() => {
    if (!isActive) return;

    const unregister = registerBackHandler(
      id,
      () => {
        onBack();
        return false; // Consumed
      },
      priority
    );

    return () => {
      unregister();
    };
  }, [id, isActive, onBack, priority]);
}
