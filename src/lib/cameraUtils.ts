import { Capacitor } from '@capacitor/core';
import { compressCameraPhoto, compressImageFile } from './imageUtils';

export interface CapturedPhotoResult {
  name: string;
  data: string; // Base64 data URL
  size?: number;
}

/**
 * Triggers the device camera directly without an intermediate modal or preview.
 * On Native Android/iOS, uses @capacitor/camera (CameraSource.Camera) with high quality.
 * On Web/Desktop, uses HTML input with capture="environment" to launch the camera directly.
 */
export async function capturePhotoDirectly(
  fileNamePrefix = 'Photo'
): Promise<CapturedPhotoResult | null> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultFileName = `${fileNamePrefix}_${timestamp}.jpg`;

  // 1. Native Capacitor Android / iOS Environment
  if (Capacitor.isNativePlatform()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      
      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera, // Force direct native camera launch
        saveToGallery: false,
      });

      if (image && image.dataUrl) {
        const compressed = await compressCameraPhoto(image.dataUrl, defaultFileName);
        return {
          name: compressed.name || defaultFileName,
          data: compressed.data || image.dataUrl,
          size: compressed.size,
        };
      }
      return null;
    } catch (err: any) {
      // User cancelled camera capture or permission was denied
      if (err?.message?.includes('cancelled') || err?.message?.includes('User cancelled')) {
        return null;
      }
      console.warn('Capacitor native camera error, falling back to input capture:', err);
    }
  }

  // 2. Web / Browser fallback using direct HTML <input capture="environment">
  return new Promise<CapturedPhotoResult | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment'); // Forces mobile browser to open rear camera directly
    input.className = 'hidden';
    document.body.appendChild(input);

    let hasHandled = false;

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = async () => {
      hasHandled = true;
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const compressed = await compressImageFile(file);
        resolve({
          name: file.name || defaultFileName,
          data: compressed.data,
          size: compressed.size,
        });
      } catch (err) {
        console.error('Error processing captured photo:', err);
        resolve(null);
      }
    };

    // Listen for cancel when window regains focus (if user closes camera without taking photo)
    const onWindowFocus = () => {
      setTimeout(() => {
        if (!hasHandled && (!input.files || input.files.length === 0)) {
          cleanup();
          window.removeEventListener('focus', onWindowFocus);
          resolve(null);
        }
      }, 1000);
    };

    window.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
}
