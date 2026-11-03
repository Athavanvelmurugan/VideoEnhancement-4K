/**
 * PWA & Cloud APK Builder Test Suite
 * Validates manifest.json, sw.js, GitHub Actions workflow, and index.html PWA tags.
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

console.log('🌐 Running Thamizh PWA & Cloud APK Builder Test Suite...\n');

// 1. Validate manifest.json
const manifestPath = path.join(rootDir, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifest.short_name === 'Thamizh Studio', 'manifest short_name is "Thamizh Studio"');
assert(manifest.display === 'standalone', 'manifest display mode is "standalone"');
assert(manifest.start_url === './index.html', 'manifest start_url is "./index.html"');
assert(manifest.theme_color === '#8b5cf6', 'manifest theme_color is "#8b5cf6"');
assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest defines app icons');

// 2. Validate sw.js Service Worker
const swPath = path.join(rootDir, 'sw.js');
assert(fs.existsSync(swPath), 'sw.js Service Worker exists');

const swContent = fs.readFileSync(swPath, 'utf-8');
assert(swContent.includes("addEventListener('install'"), 'sw.js contains install event listener');
assert(swContent.includes("addEventListener('activate'"), 'sw.js contains activate event listener');
assert(swContent.includes("addEventListener('fetch'"), 'sw.js contains fetch event listener');
assert(swContent.includes('CACHE_NAME'), 'sw.js defines offline cache name');

// 3. Validate GitHub Actions Cloud Workflow
const workflowPath = path.join(rootDir, '.github', 'workflows', 'build-apk.yml');
assert(fs.existsSync(workflowPath), '.github/workflows/build-apk.yml exists');

const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
assert(workflowContent.includes('setup-java@v4'), 'Workflow configures Java JDK 21');
assert(workflowContent.includes('npx cap add android'), 'Workflow configures Capacitor Android platform');
assert(workflowContent.includes('./gradlew assembleDebug'), 'Workflow triggers Gradle APK compilation');
assert(workflowContent.includes('upload-artifact@v4'), 'Workflow uploads compiled APK artifact for download');

// 4. Validate index.html PWA tags & registration
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
assert(htmlContent.includes('<link rel="manifest" href="manifest.json">'), 'index.html links to manifest.json');
assert(htmlContent.includes('navigator.serviceWorker.register'), 'index.html registers serviceWorker');

// 5. Validate Vector App Icon
const iconPath = path.join(rootDir, 'icons', 'icon-512.svg');
assert(fs.existsSync(iconPath), 'icons/icon-512.svg vector icon exists');
const iconContent = fs.readFileSync(iconPath, 'utf-8');
assert(iconContent.includes('<svg') && iconContent.includes('</svg>'), 'icons/icon-512.svg is a valid SVG');

console.log(`\n🎉 All ${passedTests}/${totalTests} PWA & Cloud APK Unit Tests Passed Successfully!`);
