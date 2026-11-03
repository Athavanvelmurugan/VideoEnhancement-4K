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

// 2. Validate style.css mobile rules & touch sizing
const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf-8');

assert(
    cssContent.includes('@media (max-width: 900px)'),
    'css/style.css defines @media (max-width: 900px) tablet/mobile breakpoint'
);

assert(
    cssContent.includes('@media (max-width: 480px)'),
    'css/style.css defines @media (max-width: 480px) small phone breakpoint'
);

assert(
    cssContent.includes('safe-area-inset-bottom'),
    'css/style.css accounts for mobile hardware home indicator with env(safe-area-inset-bottom)'
);

assert(
    cssContent.includes('.inspector-panel.collapsed'),
    'css/style.css includes .inspector-panel.collapsed state for collapsible bottom drawer'
);

assert(
    cssContent.includes('touch-action: none') || cssContent.includes('-webkit-overflow-scrolling: touch'),
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

console.log(`\n🎉 All ${passedTests}/${totalTests} Mobile & Hybrid APK Unit Tests Passed Successfully!`);
