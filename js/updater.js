/**
 * Remaster Enhancement — Automatic In-App Update Engine
 * Connects directly to GitHub Releases API to detect new deployments
 * and offer 1-tap direct APK updates.
 */

export const CURRENT_APP_VERSION = '1.0.1';
export const DEFAULT_REPO = 'Athavanvelmurugan/VideoEnhancement-4K';

/**
 * Compare two semver strings (e.g. '1.0.2' vs '1.0.1')
 * @param {string} remoteVer 
 * @param {string} currentVer 
 * @returns {boolean} - True if remote version is strictly newer
 */
export function isNewerVersion(remoteVer, currentVer) {
    if (!remoteVer || !currentVer) return false;

    const clean = (v) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const rParts = clean(remoteVer);
    const cParts = clean(currentVer);

    const maxLen = Math.max(rParts.length, cParts.length);
    for (let i = 0; i < maxLen; i++) {
        const r = rParts[i] || 0;
        const c = cParts[i] || 0;
        if (r > c) return true;
        if (r < c) return false;
    }
    return false;
}

/**
 * Check GitHub Releases for newer deployed APK
 * @param {Object} options
 * @param {string} options.repo - GitHub repository (owner/name)
 * @param {string} options.currentVersion - Current app version
 * @returns {Promise<{ hasUpdate: boolean, newVersion?: string, downloadUrl?: string, name?: string }>}
 */
export async function checkForAppUpdate(options = {}) {
    const repo = options.repo || DEFAULT_REPO;
    const currentVersion = options.currentVersion || CURRENT_APP_VERSION;

    const fallbackUrl = `https://github.com/${repo}/releases/latest/download/Remaster-Enhancement.apk`;

    try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;

        const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!res.ok) {
            return { hasUpdate: false, error: `GitHub API error: ${res.status}` };
        }

        const data = await res.json();
        const remoteTag = data.tag_name || data.name || '';
        const hasUpdate = isNewerVersion(remoteTag, currentVersion);

        let apkUrl = fallbackUrl;
        if (Array.isArray(data.assets)) {
            const apkAsset = data.assets.find(a => a.name && a.name.endsWith('.apk'));
            if (apkAsset && apkAsset.browser_download_url) {
                apkUrl = apkAsset.browser_download_url;
            }
        }

        return {
            hasUpdate,
            newVersion: remoteTag,
            downloadUrl: apkUrl,
            name: data.name || remoteTag,
            publishedAt: data.published_at
        };
    } catch (err) {
        return { hasUpdate: false, error: err.message };
    }
}

/**
 * Renders the interactive in-app update banner
 * @param {Object} updateInfo 
 */
export function renderUpdateBanner(updateInfo) {
    if (typeof document === 'undefined' || !updateInfo || !updateInfo.hasUpdate) return null;

    try {
        if (sessionStorage.getItem('remaster_update_dismissed') === updateInfo.newVersion) {
            return null;
        }
    } catch {
        // Safe fallback if sessionStorage is restricted
    }

    let banner = document.getElementById('appUpdateBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'appUpdateBanner';
        banner.className = 'app-update-banner';
        document.body.prepend(banner);
    }

    const versionLabel = updateInfo.newVersion ? ` (${updateInfo.newVersion})` : '';

    banner.innerHTML = `
        <div class="update-banner-content">
            <span class="update-sparkle">🚀</span>
            <div class="update-text-group">
                <span class="update-title">Remaster Enhancement Update Ready!${versionLabel}</span>
                <span class="update-sub">A new APK build has been deployed with latest features.</span>
            </div>
            <div class="update-actions">
                <a href="${updateInfo.downloadUrl}" class="btn-update-now" id="btnUpdateDownload" target="_blank" rel="noopener">
                    ⚡ Update Now
                </a>
                <button class="btn-update-close" id="btnDismissUpdate" aria-label="Dismiss">&times;</button>
            </div>
        </div>
    `;

    const dismissBtn = banner.querySelector('#btnDismissUpdate');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            banner.style.display = 'none';
            try {
                sessionStorage.setItem('remaster_update_dismissed', updateInfo.newVersion || 'true');
            } catch {}
        });
    }

    banner.style.display = 'block';
    return banner;
}

/**
 * Initialize automatic update checking on app startup
 */
export async function initUpdateChecker() {
    if (typeof window === 'undefined') return;

    // Run asynchronously without blocking app startup
    setTimeout(async () => {
        try {
            const update = await checkForAppUpdate();
            if (update && update.hasUpdate) {
                renderUpdateBanner(update);
            }
        } catch (err) {
            console.warn('[Updater] Background check failed silently:', err);
        }
    }, 2000);
}
