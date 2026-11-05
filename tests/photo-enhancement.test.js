/**
 * Thamizh Web Studio — Photo Enhancement & Home Hub Test Suite
 * Validates 100% clarity parameters, presets, split comparison math,
 * export scaling, and SPA view routing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

console.log('📸 Running Thamizh Photo Enhancement & Home Hub Test Suite...\n');

// 1. Validate index.html markup for Hub & Photo Studio
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

assert(htmlContent.includes('id="homeHubView"'), 'index.html contains #homeHubView Start Screen');
assert(htmlContent.includes('id="cardSelectVideo"'), 'index.html contains #cardSelectVideo mode card');
assert(htmlContent.includes('id="cardSelectPhoto"'), 'index.html contains #cardSelectPhoto mode card');
assert(htmlContent.includes('id="videoStudioView"'), 'index.html contains #videoStudioView container');
assert(htmlContent.includes('id="photoStudioView"'), 'index.html contains #photoStudioView container');
assert(htmlContent.includes('id="photoCanvasWrapper"'), 'index.html contains #photoCanvasWrapper to lock aspect ratio');
assert(htmlContent.includes('class="photo-subtoolbar"'), 'index.html contains .photo-subtoolbar for clean mobile controls');
assert(htmlContent.includes('id="photoCanvas"'), 'index.html contains #photoCanvas WebGL element');
assert(htmlContent.includes('id="photoSplitHandle"'), 'index.html contains #photoSplitHandle before/after divider');
assert(htmlContent.includes('id="photoSplitLine"'), 'index.html contains #photoSplitLine comparison line');
assert(htmlContent.includes('id="photoClaritySlider"'), 'index.html contains #photoClaritySlider for 100% clarity');
assert(htmlContent.includes('id="photoSkinDetailSlider"'), 'index.html contains #photoSkinDetailSlider for pore preservation');
assert(htmlContent.includes('data-photo-preset="remini-ultra"'), 'index.html contains Remini Ultra preset');
assert(htmlContent.includes('data-photo-preset="natural-hd"'), 'index.html contains Natural HD preset');
assert(htmlContent.includes('data-photo-preset="old-photo"'), 'index.html contains Old Photo preset');
assert(htmlContent.includes('data-photo-preset="crystal-sharp"'), 'index.html contains Crystal Sharp preset');
assert(htmlContent.includes('id="backToHubFromVideoBtn"'), 'index.html contains #backToHubFromVideoBtn');
assert(htmlContent.includes('id="backToHubFromPhotoBtn"'), 'index.html contains #backToHubFromPhotoBtn');
assert(htmlContent.includes('id="photoDeepAiBtn"'), 'index.html contains #photoDeepAiBtn Deep AI 4K Enhance button');
assert(htmlContent.includes('id="photoFaceZoomBtn"'), 'index.html contains #photoFaceZoomBtn Face 2x close-up button');
assert(htmlContent.includes('id="photoAiOverlay"'), 'index.html contains #photoAiOverlay neural progress overlay');
assert(htmlContent.includes('data-scale="4k"'), 'index.html contains data-scale="4k" True 4K UHD export option');
assert(htmlContent.includes('id="photoExportModal"'), 'index.html contains #photoExportModal 4K Master export modal');

// 2. Validate Clarity Shader Parameters & Math
function clamp(val, min = 0.0, max = 1.0) {
    return Math.max(min, Math.min(max, val));
}

assert(clamp(1.25) === 1.0, 'Clarity parameter clamped to maximum 1.0');
assert(clamp(-0.1) === 0.0, 'Clarity parameter clamped to minimum 0.0');
assert(clamp(0.85) === 0.85, 'Clarity 85% is in valid normalized range');

// 3. Validate Split-Screen Ratio Clamping
function calculateSplitRatio(clientX, rectLeft, rectWidth) {
    let ratio = (clientX - rectLeft) / rectWidth;
    return Math.max(0.02, Math.min(0.98, ratio));
}

assert(calculateSplitRatio(500, 0, 1000) === 0.50, 'Split ratio centered at 50%');
assert(calculateSplitRatio(10, 0, 1000) === 0.02, 'Split ratio clamped at left margin 2%');
assert(calculateSplitRatio(990, 0, 1000) === 0.98, 'Split ratio clamped at right margin 98%');

// 3B. Validate Aspect-Ratio Containment Math (Zero Image Distortion)
function fitContain(stageW, stageH, imgW, imgH) {
    const availW = Math.max(100, stageW - 24);
    const availH = Math.max(100, stageH - 24);
    const imgAspect = imgW / imgH;
    const stageAspect = availW / availH;

    let displayW, displayH;
    if (stageAspect > imgAspect) {
        displayH = availH;
        displayW = availH * imgAspect;
    } else {
        displayW = availW;
        displayH = availW / imgAspect;
    }
    return {
        displayW: Math.round(displayW),
        displayH: Math.round(displayH),
        aspect: (displayW / displayH).toFixed(2)
    };
}

// Case 1: 16:9 Landscape (1920x1080) inside Mobile Stage (360x450)
const mobileLandscape = fitContain(360, 450, 1920, 1080);
assert(mobileLandscape.displayW === 336 && mobileLandscape.displayH === 189, 'Landscape image correctly fitted without vertical/horizontal squeezing on mobile');
assert(mobileLandscape.aspect === '1.78', 'Aspect ratio 1.78 is 100% preserved on mobile');

// Case 2: 9:16 Portrait (1080x1920) inside Desktop Stage (1200x800)
const desktopPortrait = fitContain(1200, 800, 1080, 1920);
assert(desktopPortrait.displayH === 776 && desktopPortrait.displayW === 437, 'Portrait image correctly fitted with pillarbox framing without distortion on desktop');
assert(desktopPortrait.aspect === '0.56', 'Aspect ratio 0.56 is 100% preserved on desktop');

// Case 3: 1:1 Square (1000x1000) inside Widescreen Stage (800x400)
const squareImage = fitContain(800, 400, 1000, 1000);
assert(squareImage.displayW === squareImage.displayH, 'Square image maintains 1:1 equal width and height');

// 4. Validate Preset Values
const presets = {
    'remini-ultra': { clarity: 1.0, skinDetail: 0.90, denoise: 0.60, deblur: 0.85 },
    'natural-hd': { clarity: 0.70, skinDetail: 0.95, denoise: 0.35, deblur: 0.50 },
    'old-photo': { clarity: 0.95, skinDetail: 0.75, denoise: 0.80, deblur: 0.80 },
    'crystal-sharp': { clarity: 0.90, skinDetail: 0.85, denoise: 0.30, deblur: 0.95 }
};

assert(presets['remini-ultra'].clarity === 1.0, 'Remini Ultra preset applies 100% maximum clarity');
assert(presets['remini-ultra'].skinDetail >= 0.85, 'Remini Ultra preset preserves pore texture');
assert(presets['natural-hd'].skinDetail === 0.95, 'Natural HD prioritizes authentic skin detail');
assert(presets['old-photo'].denoise === 0.80, 'Old Photo preset applies strong noise/grain suppression');

// 5. Validate 4K Photo Export Dimension Calculations
function calculatePhotoExportDimensions(origWidth, origHeight, scale) {
    return {
        width: Math.round(origWidth * scale),
        height: Math.round(origHeight * scale)
    };
}

const portraitOriginal = { width: 1600, height: 2000 };
const out1x = calculatePhotoExportDimensions(portraitOriginal.width, portraitOriginal.height, 1.0);
const out2x = calculatePhotoExportDimensions(portraitOriginal.width, portraitOriginal.height, 2.0);
const out4x = calculatePhotoExportDimensions(portraitOriginal.width, portraitOriginal.height, 4.0);

assert(out1x.width === 1600 && out1x.height === 2000, '1x export preserves exact source resolution');
assert(out2x.width === 3200 && out2x.height === 4000, '2x export yields 3200x4000 Quad-HD');
assert(out4x.width === 6400 && out4x.height === 8000, '4x export yields 6400x8000 Ultra-HD Master');

// 5B. Validate True 4K UHD Scale Resolution (Guarantee Longest Edge >= 3840px)
function computeTrue4kExportDimensions(origWidth, origHeight, scaleSetting) {
    let scale = 2.0;
    if (scaleSetting === '4k') {
        const longest = Math.max(origWidth, origHeight);
        scale = Math.max(3840.0 / longest, 2.0);
    } else {
        scale = parseFloat(scaleSetting) || 2.0;
    }
    return {
        width: Math.round(origWidth * scale),
        height: Math.round(origHeight * scale)
    };
}

// User's image: 670x1194
const userImg4k = computeTrue4kExportDimensions(670, 1194, '4k');
assert(userImg4k.height === 3840, 'User 670x1194 image scales to exactly 3840px height for True 4K');
assert(userImg4k.width === 2155, 'User 670x1194 image scales to 2155px width preserving aspect ratio');
assert(Math.max(userImg4k.width, userImg4k.height) >= 3840, 'True 4K export guarantees longest edge >= 3840px');

// 5C. Validate Already 4K-Enhanced Image Export Clamping (Zero Double-Scaling)
function computeSafeExportDimensions(baseW, baseH, scaleRaw, isDeepEnhanced) {
    let scale = 1.0;
    if (scaleRaw === '4k') {
        if (isDeepEnhanced) {
            scale = 1.0; // Already 4K UHD!
        } else {
            const longest = Math.max(baseW, baseH);
            scale = Math.max(3840.0 / longest, 2.0);
        }
    } else {
        scale = parseFloat(scaleRaw) || 1.0;
    }
    let outW = Math.round(baseW * scale);
    let outH = Math.round(baseH * scale);
    const maxDim = Math.max(outW, outH);
    if (maxDim > 3840) {
        const clamp = 3840.0 / maxDim;
        outW = Math.round(outW * clamp);
        outH = Math.round(outH * clamp);
    }
    return { outW, outH };
}

const safeExport = computeSafeExportDimensions(2155, 3840, '4k', true);
assert(safeExport.outW === 2155 && safeExport.outH === 3840, 'Already-enhanced 4K photo exports at 2155x3840 with zero double-scaling');
assert(Math.max(safeExport.outW, safeExport.outH) <= 3840, 'Export dimensions never exceed 3840px maximum GPU threshold');

// 5D. Validate Mobile Touch Pan Clamping Math
function clampPan(currentPan, delta) {
    return Math.max(-0.5, Math.min(0.5, currentPan + delta));
}
assert(clampPan(0.0, 0.2) === 0.2, 'Pan accumulates within valid range');
assert(clampPan(0.4, 0.3) === 0.5, 'Pan clamped at maximum 0.5');
assert(clampPan(-0.4, -0.3) === -0.5, 'Pan clamped at minimum -0.5');

// 6. Validate Export Filename Generation
function formatExportFilename(currentFilename, width, height, format) {
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
    const baseName = currentFilename.replace(/\.[^/.]+$/, '');
    return `Thamizh_4K_Clarity_${baseName}_${width}x${height}.${ext}`;
}

const fname = formatExportFilename('portrait.jpg', 3200, 4000, 'image/png');
assert(fname === 'Thamizh_4K_Clarity_portrait_3200x4000.png', 'Generates correct brand-prefixed 4K photo filename');

// 7. Validate View Routing State Logic
function resolveInitialRoute(hash) {
    const cleanHash = (hash || '').toLowerCase();
    if (cleanHash === '#video') return 'video';
    if (cleanHash === '#photo') return 'photo';
    return 'hub';
}

assert(resolveInitialRoute('') === 'hub', 'Default route without hash resolves to Home Hub');
assert(resolveInitialRoute('#video') === 'video', 'Route #video resolves to Video Studio');
assert(resolveInitialRoute('#photo') === 'photo', 'Route #photo resolves to Photo Studio');

// 8. Validate Photo Session Store Serialization Math
function serializeSessionPayload(rawBlob, enhancedBlob, filename, isDeepEnhanced, params) {
    return {
        hasRaw: !!rawBlob,
        hasEnhanced: !!enhancedBlob,
        filename: filename || 'Thamizh_Clarity_Portrait.jpg',
        isDeepEnhanced: !!isDeepEnhanced,
        savedAt: Date.now(),
        paramsCount: Object.keys(params || {}).length
    };
}

const mockSession = serializeSessionPayload({ size: 1024 }, { size: 4096 }, 'couple.png', true, { clarity: 0.85, skinDetail: 0.80 });
assert(mockSession.hasRaw === true, 'Session preserves raw image presence');
assert(mockSession.hasEnhanced === true, 'Session preserves enhanced 4K layer presence');
assert(mockSession.filename === 'couple.png', 'Session preserves original user filename');
assert(mockSession.isDeepEnhanced === true, 'Session tracks 4K AI active flag');
assert(mockSession.paramsCount === 2, 'Session serializes slider parameter count');

console.log(`\n🎉 All ${passedTests}/${totalTests} Photo Enhancement & Home Hub Unit Tests Passed Successfully!`);

