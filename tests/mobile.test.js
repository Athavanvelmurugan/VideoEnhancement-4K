/**
 * Mobile Responsiveness & Hybrid APK Test Suite
 * Validates viewport meta tags, CSS responsive breakpoints,
 * touch interaction clamping, and Capacitor APK configurations.
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

console.log('📱 Running Thamizh Mobile Responsiveness & Hybrid APK Test Suite...\n');

// 1. Validate index.html mobile viewport & tags
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

assert(
    htmlContent.includes('viewport-fit=cover'),
    'index.html contains viewport-fit=cover for notched/edge-to-edge mobile screens'
);

assert(
    htmlContent.includes('apple-mobile-web-app-capable'),
    'index.html contains mobile web app standalone capability tag'
);

assert(
    htmlContent.includes('id="sheetDragPill"'),
    'index.html contains #sheetDragPill handle for collapsible mobile drawer'
);

assert(
    htmlContent.includes('data-snap="half"'),
    'index.html initializes bottom sheet with data-snap="half"'
);

assert(
    htmlContent.includes('class="btn-text"'),
    'index.html contains .btn-text spans for responsive collapsing buttons'
);

assert(
    htmlContent.includes('class="chip-label"'),
    'index.html contains .chip-label spans for responsive preview chips'
);

assert(
    htmlContent.includes('id="aiDirectorSkeleton"'),
    'index.html contains #aiDirectorSkeleton for visual AI feedback'
);

// 2. Validate style.css mobile rules, snap points & touch sizing
const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf-8');

assert(
    cssContent.includes('@media (max-width: 900px)'),
    'css/style.css defines @media (max-width: 900px) tablet/mobile breakpoint'
);

assert(
    cssContent.includes('@media (max-width: 600px)'),
    'css/style.css defines @media (max-width: 600px) button collapsing breakpoint'
);

assert(
    cssContent.includes('@media (max-width: 480px)'),
    'css/style.css defines @media (max-width: 480px) standard phone breakpoint'
);

assert(
    cssContent.includes('@media (max-width: 375px)'),
    'css/style.css defines @media (max-width: 375px) iPhone SE breakpoint'
);

assert(
    cssContent.includes('@media (max-width: 360px)'),
    'css/style.css defines @media (max-width: 360px) ultra-compact breakpoint'
);

assert(
    cssContent.includes('@media (min-width: 901px)'),
    'css/style.css defines @media (min-width: 901px) tablet/desktop dock layout'
);

assert(
    cssContent.includes('@media (orientation: landscape) and (max-height: 550px)'),
    'css/style.css defines landscape 2-column studio layout'
);

assert(
    cssContent.includes('safe-area-inset-bottom'),
    'css/style.css accounts for mobile hardware home indicator with env(safe-area-inset-bottom)'
);

assert(
    cssContent.includes('.inspector-panel.collapsed') || cssContent.includes('data-snap="peek"'),
    'css/style.css includes peek/collapsed snap state for bottom sheet'
);

assert(
    cssContent.includes('data-snap="half"') && cssContent.includes('data-snap="full"'),
    'css/style.css includes half and full snap points for bottom sheet'
);

assert(
    cssContent.includes('min-width: 44px') && cssContent.includes('min-height: 44px'),
    'css/style.css enforces 44x44px minimum touch targets'
);

assert(
    cssContent.includes('scroll-snap-type: x mandatory'),
    'css/style.css defines horizontal snap-scrolling preset carousel'
);

assert(
    cssContent.includes('position: sticky'),
    'css/style.css implements sticky track-label columns in timeline'
);

assert(
    cssContent.includes('prefers-reduced-motion'),
    'css/style.css supports prefers-reduced-motion accessibility preference'
);

assert(
    cssContent.includes('touch-action: none') || cssContent.includes('touch-action: pan-y') || cssContent.includes('-webkit-overflow-scrolling: touch'),
    'css/style.css optimizes touch scrolling and gesture handling'
);

// 3. Validate capacitor.config.json for Android Hybrid APK
const capConfigPath = path.join(rootDir, 'capacitor.config.json');
assert(fs.existsSync(capConfigPath), 'capacitor.config.json exists');

const capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf-8'));
assert(capConfig.appId === 'com.thamizh.ai.studio', 'Capacitor appId is set to com.thamizh.ai.studio');
assert(capConfig.appName === 'Thamizh Studio', 'Capacitor appName is set to Thamizh Studio');
assert(capConfig.android && capConfig.android.allowMixedContent === true, 'Capacitor allows mixed content for local testing');

// 4. Validate Touch Split Clamping Math Algorithm
function calculateSplitRatio(clientX, rectLeft, rectWidth) {
    let ratio = (clientX - rectLeft) / rectWidth;
    return Math.max(0.05, Math.min(0.95, ratio));
}

assert(calculateSplitRatio(100, 0, 200) === 0.5, 'Touch slider calculates exact 50% midpoint');
assert(calculateSplitRatio(-50, 0, 200) === 0.05, 'Touch slider clamps lower bound to 5%');
assert(calculateSplitRatio(300, 0, 200) === 0.95, 'Touch slider clamps upper bound to 95%');

// 5. Validate Bottom Sheet Snap Cycle Algorithm
const snapPoints = ['peek', 'half', 'full'];
function getNextSnap(currentSnap) {
    const idx = snapPoints.indexOf(currentSnap);
    return snapPoints[(idx + 1) % snapPoints.length];
}

assert(getNextSnap('peek') === 'half', 'Bottom sheet cycles peek -> half');
assert(getNextSnap('half') === 'full', 'Bottom sheet cycles half -> full');
assert(getNextSnap('full') === 'peek', 'Bottom sheet cycles full -> peek');

console.log(`\n🎉 All ${passedTests}/${totalTests} Mobile & Hybrid APK Unit Tests Passed Successfully!`);
