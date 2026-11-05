/**
 * Remaster Enhancement — Universal Downloader Engine
 * Solves mobile / Android WebView / Capacitor download limitations.
 * 
 * Root Cause in Android WebView:
 * 1. Android's native DownloadManager only handles HTTP and HTTPS URLs.
 * 2. Blob URLs (blob:http://localhost/... or blob:capacitor://...) reside solely in
 *    the WebView's JavaScript V8 heap memory. Android OS has no access to this memory
 *    and ignores <a download> clicks on blob URLs.
 * 
 * Solution:
 * 1. Capacitor Native Bridge: Writes raw base64 directly to device storage via
 *    Capacitor.Plugins.Filesystem and triggers native system share sheet via
 *    Capacitor.Plugins.Share.
 * 2. Web Share API (navigator.share with File): Supported in modern browsers.
 * 3. Interactive In-App Save Sheet: Renders the 4K image directly with long-press
 *    saving capability ("Save image to Gallery") and system share button.
 * 4. Standard Desktop Anchor fallback (<a download>).
 */

/**
 * Converts a Blob to a full Base64 Data URL (e.g. data:image/png;base64,...)
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export async function blobToBase64(blob) {
    if (typeof FileReader !== 'undefined') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    // Universal fallback (Node.js & modern Web APIs)
    const buffer = await blob.arrayBuffer();
    const base64 = typeof Buffer !== 'undefined'
        ? Buffer.from(buffer).toString('base64')
        : btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const mime = blob.type || 'image/png';
    return `data:${mime};base64,${base64}`;
}

/**
 * Extracts pure Base64 characters from a Blob (stripping the data:...;base64, header)
 * Required by Capacitor Filesystem.writeFile
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export async function blobToBase64Raw(blob) {
    const dataUrl = await blobToBase64(blob);
    const commaIndex = dataUrl.indexOf(',');
    return commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

/**
 * Check if running inside Capacitor Android/iOS native app
 * @returns {boolean}
 */
export function isCapacitorNative() {
    if (typeof window === 'undefined' || !window.Capacitor) return false;
    try {
        if (typeof window.Capacitor.isNativePlatform === 'function') {
            return window.Capacitor.isNativePlatform();
        }
        if (typeof window.Capacitor.getPlatform === 'function') {
            const p = window.Capacitor.getPlatform();
            return p === 'android' || p === 'ios';
        }
        return !!(window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem);
    } catch {
        return false;
    }
}

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
 * Displays an interactive in-app save sheet with long-press image saving
 * @param {Object} options
 * @param {string} options.dataUrl - Base64 Data URL
 * @param {string} options.filename - Suggested filename
 * @param {Blob} options.blob - Raw blob
 */
export function showMobileSaveModal({ dataUrl, filename, blob }) {
    if (typeof document === 'undefined') return null;

    let modal = document.getElementById('mobileSaveModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mobileSaveModal';
        modal.className = 'mobile-save-modal-backdrop';
        modal.innerHTML = `
            <div class="mobile-save-card">
                <div class="mobile-save-header">
                    <span class="mobile-save-badge">✨ 4K MASTER READY</span>
                    <button class="mobile-save-close" id="closeMobileSaveModalBtn" aria-label="Close">&times;</button>
                </div>
                <div class="mobile-save-preview-wrap">
                    <img id="mobileSavePreviewImg" src="" alt="4K Master Export" />
                </div>
                <div class="mobile-save-instruction">
                    <span class="save-icon">👆</span>
                    <span><strong>Long-press (tap & hold)</strong> the photo above to save directly to your Android Gallery.</span>
                </div>
                <div class="mobile-save-actions">
                    <button class="mobile-save-btn btn-share" id="mobileShareDirectBtn">
                        <span class="icon">📤</span> Share / Save via App
                    </button>
                    <button class="mobile-save-btn btn-download" id="mobileDownloadDirectBtn">
                        <span class="icon">💾</span> Direct Download
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('#closeMobileSaveModalBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        }
    }

    const img = modal.querySelector('#mobileSavePreviewImg');
    if (img) img.src = dataUrl;

    const shareBtn = modal.querySelector('#mobileShareDirectBtn');
    if (shareBtn) {
        shareBtn.onclick = async () => {
            try {
                if (blob) {
                    const file = createDownloadFile(blob, filename, blob.type);
                    if (canShareFile(file)) {
                        await navigator.share({ files: [file], title: filename });
                        return;
                    }
                }
                if (navigator.share) {
                    await navigator.share({ title: filename, url: window.location.href });
                }
            } catch (err) {
                if (err.name !== 'AbortError') console.warn('Share failed:', err);
            }
        };
    }

    const downloadBtn = modal.querySelector('#mobileDownloadDirectBtn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
        };
    }

    modal.style.display = 'flex';
    return modal;
}

/**
 * Trigger universal file download / save across desktop and mobile APK
 * @param {Blob} blob - The file content blob
 * @param {string} filename - Desired filename
 * @param {string} mimeType - MIME type (e.g. 'image/png', 'video/mp4')
 * @returns {Promise<{ success: boolean, method: string, uri?: string }>}
 */
export async function triggerUniversalDownload(blob, filename, mimeType = 'image/png') {
    if (!blob) {
        throw new Error('Universal Downloader: Invalid or null Blob provided.');
    }

    const type = mimeType || blob.type || 'application/octet-stream';
    const isMobileDevice = typeof navigator !== 'undefined' && 
        (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isCapacitorNative());

    // 1. Native Capacitor Storage Bridge (Filesystem.writeFile + Share.share)
    if (typeof window !== 'undefined' && window.Capacitor) {
        const plugins = window.Capacitor.Plugins || {};
        const filesystem = plugins.Filesystem;
        const sharePlugin = plugins.Share;

        if (filesystem) {
            try {
                const base64Data = await blobToBase64Raw(blob);
                const writeResult = await filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: 'CACHE',
                    recursive: true
                });

                if (sharePlugin && writeResult && writeResult.uri) {
                    try {
                        await sharePlugin.share({
                            title: filename,
                            url: writeResult.uri,
                            dialogTitle: 'Save or Share 4K Master'
                        });
                        return { success: true, method: 'capacitor-native-share', uri: writeResult.uri };
                    } catch (shareErr) {
                        if (shareErr.name === 'AbortError') {
                            return { success: true, method: 'capacitor-share-dismissed', uri: writeResult.uri };
                        }
                    }
                }
                return { success: true, method: 'capacitor-native-fs', uri: writeResult.uri };
            } catch (fsErr) {
                console.warn('[Downloader] Capacitor Filesystem write failed, proceeding to fallbacks:', fsErr);
            }
        }
    }

    // 2. Web Share API with File object
    const file = createDownloadFile(blob, filename, type);
    if (canShareFile(file)) {
        try {
            await navigator.share({
                files: [file],
                title: filename,
                text: `Exported from Remaster Enhancement: ${filename}`
            });
            return { success: true, method: 'web-share' };
        } catch (shareErr) {
            if (shareErr.name === 'AbortError') {
                return { success: true, method: 'web-share-cancelled' };
            }
            console.warn('[Downloader] Web Share API failed:', shareErr);
        }
    }

    // 3. Desktop Direct Anchor Download (only if NOT on a restricted mobile WebView)
    if (!isMobileDevice && typeof document !== 'undefined') {
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1500);

            return { success: true, method: 'anchor-blob' };
        } catch (anchorErr) {
            console.warn('[Downloader] Anchor blob download failed:', anchorErr);
        }
    }

    // 4. Mobile Fallback: Display In-App Save Modal with Long-Press Image Element
    // Guarantees mobile users can ALWAYS save the photo to their gallery directly!
    try {
        const dataUrl = await blobToBase64(blob);
        showMobileSaveModal({ dataUrl, filename, blob });
        return { success: true, method: 'mobile-save-modal' };
    } catch (modalErr) {
        console.warn('[Downloader] In-app save modal failed:', modalErr);
    }

    // 5. Final desktop Data URL click fallback
    if (typeof document !== 'undefined') {
        try {
            const dataUrl = await blobToBase64(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = dataUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
            return { success: true, method: 'anchor-dataurl' };
        } catch (dataErr) {
            console.warn('[Downloader] Final anchor dataurl failed:', dataErr);
        }
    }

    return { success: false, method: 'none' };
}
