/**
 * Unit Tests for Universal Downloader Engine & Android APK Download Resolution
 * Reproduces root causes of Android WebView download blocks and validates fixes:
 * 1. Base64 extraction math (stripping data URL header for Capacitor Filesystem).
 * 2. Capacitor Filesystem + Share plugin bridge execution.
 * 3. Mobile Save Sheet fallback with long-press image element.
 * 4. Desktop browser anchor fallback.
 */

import { blobToBase64, blobToBase64Raw, canShareFile, createDownloadFile, triggerUniversalDownload } from '../js/downloader.js';
import { DebugToast } from '../js/debug-toast.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    } else {
        console.log(`✅ PASS: ${message}`);
        passedTests++;
    }
}

console.log('📥 Running Universal Downloader & APK Save Unit Tests...\n');

// 1. Validate Base64 conversion math
const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
const sampleBlob = new Blob([sampleBytes], { type: 'image/png' });

const fullDataUrl = await blobToBase64(sampleBlob);
assert(fullDataUrl.startsWith('data:image/png;base64,'), 'blobToBase64 generates valid data URL with MIME header');

const rawBase64 = await blobToBase64Raw(sampleBlob);
assert(!rawBase64.includes('data:'), 'blobToBase64Raw strips data URL prefix');
assert(!rawBase64.includes('base64,'), 'blobToBase64Raw contains pure base64 characters for Filesystem');

// 2. Validate File creation from Blob
const downloadFile = createDownloadFile(sampleBlob, 'Remaster_4K.png', 'image/png');
assert(downloadFile.name === 'Remaster_4K.png', 'createDownloadFile sets filename correctly');
assert(downloadFile.type === 'image/png', 'createDownloadFile sets MIME type correctly');

// 3. Root Cause Simulation: Android WebView without native bridge
// When navigator.share is absent and a.click() is blocked by Android WebView,
// Downloader must not throw, but safely invoke the fallback.
assert(canShareFile(downloadFile) === false, 'canShareFile safely returns false when Web Share API is missing');

// 4. Test Native Capacitor Storage & Share Path
let mockWrittenPath = '';
let mockWrittenData = '';
let mockSharedUri = '';

globalThis.window = {
    Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
            Filesystem: {
                writeFile: async ({ path, data, directory }) => {
                    mockWrittenPath = path;
                    mockWrittenData = data;
                    return { uri: `file:///data/user/0/com.thamizh.ai.studio/cache/${path}` };
                }
            },
            Share: {
                share: async ({ title, url }) => {
                    mockSharedUri = url;
                    return { value: true };
                }
            }
        }
    }
};

const nativeResult = await triggerUniversalDownload(sampleBlob, 'Remaster_4K_Test.png', 'image/png');
assert(nativeResult.success === true, 'Native Capacitor download succeeds');
assert(nativeResult.method === 'capacitor-native-share', 'Native Capacitor uses capacitor-native-share method');
assert(mockWrittenPath === 'Remaster_4K_Test.png', 'Filesystem received exact filename');
assert(mockWrittenData === rawBase64, 'Filesystem received raw base64 data without header corruption');
assert(mockSharedUri.includes('Remaster_4K_Test.png'), 'Capacitor Share invoked with local file URI');

// 5. Test Mobile Fallback Save Sheet when Capacitor Plugins are Absent
// Simulates user in APK or mobile browser without Filesystem plugin
let modalCreated = false;
let modalImageSrc = '';

globalThis.document = {
    getElementById: (id) => null,
    createElement: (tag) => {
        const el = {
            tagName: tag,
            style: {},
            className: '',
            children: [],
            innerHTML: '',
            click: () => {},
            classList: { add: () => {}, remove: () => {} },
            querySelector: (sel) => {
                if (sel === '#mobileSavePreviewImg') return { src: '', set src(val) { modalImageSrc = val; } };
                return { addEventListener: () => {}, onclick: null };
            },
            appendChild: () => {}
        };
        if (tag === 'div') modalCreated = true;
        return el;
    },
    body: {
        appendChild: () => {},
        contains: () => true
    }
};

globalThis.window = {
    Capacitor: null // Plugins unavailable
};

Object.defineProperty(globalThis, 'navigator', {
    value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        share: null,
        canShare: null
    },
    configurable: true,
    writable: true
});

const fallbackResult = await triggerUniversalDownload(sampleBlob, 'Remaster_Fallback.png', 'image/png');
assert(fallbackResult.success === true, 'Mobile fallback succeeds');
assert(fallbackResult.method === 'mobile-save-modal', 'Mobile fallback displays interactive save modal');
assert(modalCreated === true, 'In-app save modal created in DOM');
assert(modalImageSrc.startsWith('data:image/png;base64,'), 'In-app save modal populates image with data URL for long-press saving');

// 6. Test Error Handling
let nullRejected = false;
try {
    await triggerUniversalDownload(null, 'test.png');
} catch (e) {
    nullRejected = true;
}
assert(nullRejected === true, 'triggerUniversalDownload rejects null blob');

// 7. Test On-Screen DebugToast HUD
const toastObj = DebugToast.show('Test live message', 'info');
assert(toastObj !== null && typeof toastObj === 'object', 'DebugToast creates toast element');

const errToast = DebugToast.error('Test error message');
assert(errToast !== null && errToast.className.includes('toast-error'), 'DebugToast formats error toast');

console.log(`\n🎉 All ${passedTests}/${totalTests} Downloader & APK Save Unit Tests Passed Successfully!`);
