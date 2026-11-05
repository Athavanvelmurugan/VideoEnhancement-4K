/**
 * Thamizh Web Studio — Universal Downloader Engine
 * Solves mobile / Android WebView / Capacitor download limitations.
 * 
 * In standard desktop browsers, <a download> with blob URLs works smoothly.
 * However, in Android Capacitor WebView / mobile browsers, blob downloads
 * are often intercepted or discarded because the WebView doesn't have a download listener.
 * 
 * Solution:
 * 1. Web Share API (navigator.share with File): Supported in modern Android Chrome/WebView.
 *    Invokes Android's native system sheet ("Save to Files", "Downloads", "Photos", WhatsApp, Drive).
 * 2. Anchor click fallback with blob URL for desktop and browsers supporting direct download.
 * 3. Base64 / Data URL fallback or fallback prompt if blob links are restricted.
 */

/**
 * Check if the current browser environment can share a File object
 * @param {File} file 
 * @returns {boolean}
 */
export function canShareFile(file) {
    if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
        return false;
    }
    try {
        return navigator.canShare({ files: [file] });
    } catch {
        return false;
    }
}

/**
 * Create a File instance from a Blob
 * @param {Blob} blob 
 * @param {string} filename 
 * @param {string} mimeType 
 * @returns {File}
 */
export function createDownloadFile(blob, filename, mimeType) {
    const type = mimeType || blob.type || 'application/octet-stream';
    return new File([blob], filename, { type });
}

/**
 * Trigger universal file download / save across desktop and mobile APK
 * @param {Blob} blob - The file content blob
 * @param {string} filename - Desired filename
 * @param {string} mimeType - MIME type (e.g. 'image/png', 'video/mp4')
 * @returns {Promise<{ success: boolean, method: string }>}
 */
export async function triggerUniversalDownload(blob, filename, mimeType = 'image/png') {
    if (!blob) {
        throw new Error('Universal Downloader: Invalid or null Blob provided.');
    }

    const type = mimeType || blob.type || 'application/octet-stream';
    const file = createDownloadFile(blob, filename, type);

    // 1. Mobile First: Check if Android / iOS Web Share API is available with File support
    if (canShareFile(file)) {
        try {
            await navigator.share({
                files: [file],
                title: filename,
                text: `Exported from Thamizh AI Studio: ${filename}`
            });
            return { success: true, method: 'web-share' };
        } catch (shareErr) {
            // User aborted the share dialog (not a real error)
            if (shareErr.name === 'AbortError') {
                return { success: true, method: 'web-share-cancelled' };
            }
            console.warn('[Downloader] Web Share API failed, falling back to anchor download:', shareErr);
        }
    }

    // 2. Desktop & Standard Web Fallback: <a download>
    if (typeof document !== 'undefined') {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                if (a.parentNode) {
                    a.parentNode.removeChild(a);
                }
                URL.revokeObjectURL(url);
            }, 1500);

            return { success: true, method: 'anchor-blob' };
        } catch (anchorErr) {
            console.warn('[Downloader] Anchor blob download failed:', anchorErr);
        }
    }

    // 3. Fallback: Data URL window open (for older Android WebViews where blob URLs are blocked)
    if (typeof FileReader !== 'undefined' && typeof window !== 'undefined') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const dataUrl = reader.result;
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = dataUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => {
                        if (a.parentNode) a.parentNode.removeChild(a);
                    }, 1000);
                    resolve({ success: true, method: 'anchor-dataurl' });
                } catch (dataErr) {
                    reject(dataErr);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(blob);
        });
    }

    return { success: false, method: 'none' };
}

