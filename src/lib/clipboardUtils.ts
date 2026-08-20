/**
 * Robust clipboard copy utility that works reliably across browsers,
 * secure contexts, mobile web views, and iframes where `navigator.clipboard.writeText`
 * might fail with "Document is not focused" or "NotAllowedError".
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try navigator.clipboard.writeText if available and document has focus
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipErr) {
      // Typically throws "Document is not focused" or "NotAllowedError" in iframes
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand:', clipErr);
    }
  }

  // 2. Fallback using temporary textarea + document.execCommand('copy')
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    
    // Ensure window / document is focused for the selection
    try {
      window.focus();
    } catch (e) {
      // Ignore if iframe focus restriction occurs
    }

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (fallbackErr) {
    console.error('Fallback clipboard copy failed:', fallbackErr);
    return false;
  }
}
