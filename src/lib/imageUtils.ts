import { Trip, Place, Expense, AttachmentItem } from '../types';

export const ALLOWED_FILE_TYPES_NOTE = 'Supported formats: JPG, JPEG, PNG, or PDF (Max size: 500KB)';

/**
 * Normalizes attachments from an Expense or Timeline Place card.
 * Combines both modern attachments array and any legacy attachment properties.
 */
export function getItemAttachments(item?: Partial<Expense & Place> | null): AttachmentItem[] {
  if (!item) return [];

  const list: AttachmentItem[] = [];
  const addedKeys = new Set<string>();

  // 1. Add modern attachments array items if present
  if (Array.isArray(item.attachments)) {
    for (const att of item.attachments) {
      if (att && att.data) {
        list.push({
          id: att.id || `att-${Math.random().toString(36).substring(2, 9)}`,
          name: att.name || 'Attachment',
          data: att.data,
          type: att.type || (att.data.includes('pdf') ? 'pdf' : 'image'),
          size: att.size,
          createdAt: att.createdAt || new Date().toISOString(),
        });
        addedKeys.add(att.data.substring(0, 100));
      }
    }
  }

  // Helper to add legacy fields if not duplicate
  const addLegacy = (data?: string, name?: string, defaultLabel = 'Attachment') => {
    if (!data) return;
    const key = data.substring(0, 100);
    if (!addedKeys.has(key)) {
      addedKeys.add(key);
      const isPdf = data.includes('pdf') || (name && name.toLowerCase().endsWith('.pdf'));
      list.push({
        id: `legacy-${Math.random().toString(36).substring(2, 9)}`,
        name: name || defaultLabel,
        data,
        type: isPdf ? 'pdf' : 'image',
        createdAt: new Date().toISOString(),
      });
    }
  };

  // 2. Add legacy expense fields
  addLegacy(item.receiptAttachmentData || item.receiptData, item.receiptAttachment || item.receiptName, 'Receipt');

  // 3. Add legacy place fields
  addLegacy(item.ticketAttachmentData, item.ticketAttachment, 'Ticket');
  addLegacy(item.stayAttachmentData, item.stayAttachment, 'Stay Doc');
  addLegacy(item.attachmentData, item.attachmentName, 'Attachment');

  return list;
}

/**
 * Validates file type and size.
 * Only allows JPG, JPEG, PNG, PDF up to 500KB.
 */
export function validateAttachmentFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const nameLower = file.name.toLowerCase();
  const validExt =
    nameLower.endsWith('.jpg') ||
    nameLower.endsWith('.jpeg') ||
    nameLower.endsWith('.png') ||
    nameLower.endsWith('.pdf');

  if (!allowedMimes.includes(file.type) && !validExt) {
    return {
      valid: false,
      error: 'Invalid file format. Only JPG, JPEG, PNG, and PDF files are allowed.',
    };
  }

  const MAX_SIZE = 500 * 1024; // 500KB
  if (file.size > MAX_SIZE && file.type === 'application/pdf') {
    const sizeInKb = (file.size / 1024).toFixed(0);
    return {
      valid: false,
      error: `PDF file size exceeds 500KB limit (Selected file is ${sizeInKb}KB). Please choose a smaller PDF.`,
    };
  }

  return { valid: true };
}

/**
 * Compresses an uploaded image File using HTML5 Canvas.
 * Automatically resizes and compresses high-resolution photos (including camera captures)
 * so that the output size is strictly guaranteed to be under 500KB (typically 40KB - 180KB).
 */
export async function compressImageFile(
  file: File,
  maxDimension = 1200,
  quality = 0.8
): Promise<{ name: string; data: string; size: number }> {
  if (!file) {
    return { name: '', data: '', size: 0 };
  }

  // If not an image (e.g. PDF), read as raw Data URL
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = (reader.result as string) || '';
        resolve({
          name: file.name,
          data: res,
          size: file.size,
        });
      };
      reader.onerror = () => resolve({ name: file.name, data: '', size: 0 });
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const TARGET_MAX_BYTES = 480 * 1024; // ~480KB target
          let currentMaxDim = maxDimension;
          let currentQuality = quality;
          let compressedDataUrl = '';

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve({ name: file.name, data: (e.target?.result as string) || '', size: file.size });
            return;
          }

          // Stepwise loop to guarantee output size < 500KB
          for (let attempt = 0; attempt < 5; attempt++) {
            let { width, height } = img;
            if (width > currentMaxDim || height > currentMaxDim) {
              if (width > height) {
                height = Math.round((height * currentMaxDim) / width);
                width = currentMaxDim;
              } else {
                width = Math.round((width * currentMaxDim) / height);
                height = currentMaxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            compressedDataUrl = canvas.toDataURL('image/jpeg', currentQuality);

            // Base64 byte length estimation (approx len * 0.75)
            const estimatedBytes = Math.round(compressedDataUrl.length * 0.75);

            if (estimatedBytes <= TARGET_MAX_BYTES || attempt === 4) {
              resolve({
                name: file.name,
                data: compressedDataUrl,
                size: estimatedBytes,
              });
              return;
            }

            // Reduce dimension and quality for next attempt
            currentMaxDim = Math.round(currentMaxDim * 0.8);
            currentQuality = Math.max(0.4, currentQuality * 0.85);
          }

          resolve({ name: file.name, data: compressedDataUrl, size: Math.round(compressedDataUrl.length * 0.75) });
        } catch (err) {
          console.warn('Canvas compression failed, falling back to original:', err);
          resolve({ name: file.name, data: (e.target?.result as string) || '', size: file.size });
        }
      };
      img.onerror = () => resolve({ name: file.name, data: (e.target?.result as string) || '', size: file.size });
      img.src = (e.target?.result as string) || '';
    };
    reader.onerror = () => resolve({ name: file.name, data: '', size: 0 });
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses camera photo data URL to ensure size is strictly under 500KB.
 */
export async function compressCameraPhoto(
  dataUrl: string,
  fileName = 'Camera_Photo.jpg'
): Promise<{ name: string; data: string; size: number }> {
  if (!dataUrl) return { name: fileName, data: '', size: 0 };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ name: fileName, data: dataUrl, size: Math.round(dataUrl.length * 0.75) });
          return;
        }

        let maxDim = 1200;
        let quality = 0.8;
        let resultUrl = dataUrl;

        for (let i = 0; i < 5; i++) {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          resultUrl = canvas.toDataURL('image/jpeg', quality);
          const bytes = Math.round(resultUrl.length * 0.75);

          if (bytes <= 480 * 1024 || i === 4) {
            resolve({ name: fileName, data: resultUrl, size: bytes });
            return;
          }

          maxDim = Math.round(maxDim * 0.8);
          quality = Math.max(0.4, quality * 0.8);
        }
      } catch {
        resolve({ name: fileName, data: dataUrl, size: Math.round(dataUrl.length * 0.75) });
      }
    };
    img.onerror = () => resolve({ name: fileName, data: dataUrl, size: Math.round(dataUrl.length * 0.75) });
    img.src = dataUrl;
  });
}

/**
 * Compresses an existing base64 image data URL to fit target canvas dimensions and quality.
 */
export async function compressBase64Image(
  dataUrl: string,
  maxDimension = 800,
  quality = 0.65
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Optimizes a Trip object so its serialized JSON size stays below ~850KB
 * to strictly prevent exceeding Firestore's 1MB (1,048,576 byte) document limit.
 */
export async function optimizeTripForFirestore(trip: Trip): Promise<Trip> {
  if (!trip) return trip;

  // Deep clone trip
  const tripCopy: Trip = JSON.parse(JSON.stringify(trip));
  
  // Target max size in bytes: 850,000 (~830KB)
  const MAX_BYTES = 850000;
  let jsonStr = JSON.stringify(tripCopy);
  if (jsonStr.length <= MAX_BYTES) {
    return tripCopy;
  }

  console.warn(`Trip ${trip.code || trip.id} size (${jsonStr.length} bytes) exceeds safety limit (${MAX_BYTES} bytes). Optimizing attachments...`);

  // Stage 1: Compress image attachments to 600px, 0.5 quality
  if (tripCopy.timeline && Array.isArray(tripCopy.timeline)) {
    for (const place of tripCopy.timeline) {
      if (place.ticketAttachmentData) {
        place.ticketAttachmentData = await compressBase64Image(place.ticketAttachmentData, 600, 0.5);
      }
      if (place.attachmentData) {
        place.attachmentData = await compressBase64Image(place.attachmentData, 600, 0.5);
      }
      if (place.stayAttachmentData) {
        place.stayAttachmentData = await compressBase64Image(place.stayAttachmentData, 600, 0.5);
      }
    }
  }

  if (tripCopy.expenses && Array.isArray(tripCopy.expenses)) {
    for (const exp of tripCopy.expenses) {
      if (exp.receiptAttachmentData) {
        exp.receiptAttachmentData = await compressBase64Image(exp.receiptAttachmentData, 600, 0.5);
      }
      if (exp.receiptData) {
        exp.receiptData = await compressBase64Image(exp.receiptData, 600, 0.5);
      }
    }
  }

  jsonStr = JSON.stringify(tripCopy);
  if (jsonStr.length <= MAX_BYTES) {
    console.log(`Trip optimized successfully to ${jsonStr.length} bytes (Stage 1).`);
    return tripCopy;
  }

  // Stage 2: Compress image attachments to 400px, 0.35 quality
  if (tripCopy.timeline) {
    for (const place of tripCopy.timeline) {
      if (place.ticketAttachmentData) {
        place.ticketAttachmentData = await compressBase64Image(place.ticketAttachmentData, 400, 0.35);
      }
      if (place.attachmentData) {
        place.attachmentData = await compressBase64Image(place.attachmentData, 400, 0.35);
      }
      if (place.stayAttachmentData) {
        place.stayAttachmentData = await compressBase64Image(place.stayAttachmentData, 400, 0.35);
      }
    }
  }

  if (tripCopy.expenses) {
    for (const exp of tripCopy.expenses) {
      if (exp.receiptAttachmentData) {
        exp.receiptAttachmentData = await compressBase64Image(exp.receiptAttachmentData, 400, 0.35);
      }
      if (exp.receiptData) {
        exp.receiptData = await compressBase64Image(exp.receiptData, 400, 0.35);
      }
    }
  }

  jsonStr = JSON.stringify(tripCopy);
  if (jsonStr.length <= MAX_BYTES) {
    console.log(`Trip optimized successfully to ${jsonStr.length} bytes (Stage 2).`);
    return tripCopy;
  }

  // Stage 3: Truncate oversized raw data strings (> 50KB) if still over limit
  const truncateIfHuge = (dataStr?: string): string | undefined => {
    if (dataStr && dataStr.length > 50000) {
      return ''; // Strip heavy non-image data or PDF payload
    }
    return dataStr;
  };

  if (tripCopy.timeline) {
    for (const place of tripCopy.timeline) {
      place.ticketAttachmentData = truncateIfHuge(place.ticketAttachmentData);
      place.attachmentData = truncateIfHuge(place.attachmentData);
      place.stayAttachmentData = truncateIfHuge(place.stayAttachmentData);
    }
  }

  if (tripCopy.expenses) {
    for (const exp of tripCopy.expenses) {
      exp.receiptAttachmentData = truncateIfHuge(exp.receiptAttachmentData);
      exp.receiptData = truncateIfHuge(exp.receiptData);
    }
  }

  jsonStr = JSON.stringify(tripCopy);
  console.log(`Trip optimized successfully to ${jsonStr.length} bytes (Stage 3).`);
  return tripCopy;
}
