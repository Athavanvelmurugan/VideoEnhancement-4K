/**
 * Unit Tests for Automatic In-App Update Engine
 * Validates version comparison math, release metadata parsing, and banner rendering.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isNewerVersion, CURRENT_APP_VERSION, renderUpdateBanner } from '../js/updater.js';

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

console.log('🔄 Running Automatic In-App Update Test Suite...\n');

// 1. Validate Semver Comparison Logic
assert(isNewerVersion('1.0.2', '1.0.1') === true, 'Patch update detected (1.0.2 > 1.0.1)');
assert(isNewerVersion('v1.0.2', '1.0.1') === true, 'Handles "v" prefix gracefully (v1.0.2 > 1.0.1)');
assert(isNewerVersion('1.1.0', '1.0.9') === true, 'Minor update detected (1.1.0 > 1.0.9)');
assert(isNewerVersion('2.0.0', '1.9.9') === true, 'Major update detected (2.0.0 > 1.9.9)');
assert(isNewerVersion('1.0.1', '1.0.1') === false, 'Same version rejects update (1.0.1 == 1.0.1)');
assert(isNewerVersion('1.0.0', '1.0.1') === false, 'Older version rejects update (1.0.0 < 1.0.1)');
assert(isNewerVersion('', '1.0.1') === false, 'Empty version handled safely');
assert(isNewerVersion(null, '1.0.1') === false, 'Null version handled safely');

// 2. Validate version.json metadata
const versionJsonPath = path.join(rootDir, 'version.json');
assert(fs.existsSync(versionJsonPath), 'version.json exists in root directory');

const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
assert(versionData.version === CURRENT_APP_VERSION, 'version.json matches CURRENT_APP_VERSION');
assert(versionData.appName === 'Remaster Enhancement', 'version.json appName is Remaster Enhancement');
assert(versionData.publicDownloadUrl.includes('Remaster-Enhancement.apk'), 'version.json provides public direct APK download URL');

// 3. Validate GitHub Workflow Release Configuration
const workflowPath = path.join(rootDir, '.github', 'workflows', 'build-apk.yml');
const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
assert(workflowContent.includes('softprops/action-gh-release@v2'), 'Workflow includes GitHub Release publisher');
assert(workflowContent.includes('Remaster-Enhancement.apk'), 'Workflow packages Remaster-Enhancement.apk for direct download');
assert(workflowContent.includes('tag_name: latest'), 'Workflow publishes to permanent "latest" public tag');

// 4. Validate In-App Update Banner DOM Construction
let bannerCreated = false;
let bannerHTML = '';

globalThis.document = {
    getElementById: () => null,
    createElement: (tag) => {
        return {
            tagName: tag,
            id: '',
            className: '',
            style: {},
            set innerHTML(val) { bannerHTML = val; bannerCreated = true; },
            get innerHTML() { return bannerHTML; },
            querySelector: () => ({ addEventListener: () => {} })
        };
    },
    body: {
        prepend: () => {}
    }
};

const renderedBanner = renderUpdateBanner({
    hasUpdate: true,
    newVersion: 'v1.0.2',
    downloadUrl: 'https://github.com/Athavanvelmurugan/VideoEnhancement-4K/releases/latest/download/Remaster-Enhancement.apk'
});

assert(renderedBanner !== null, 'renderUpdateBanner returns banner element on new version');
assert(bannerCreated === true, 'Banner was populated with HTML content');
assert(bannerHTML.includes('v1.0.2'), 'Banner displays the new version tag');
assert(bannerHTML.includes('Remaster-Enhancement.apk'), 'Banner links to the direct public APK download');

const noBanner = renderUpdateBanner({ hasUpdate: false });
assert(noBanner === null, 'renderUpdateBanner returns null when no update exists');

console.log(`\n🎉 All ${passedTests}/${totalTests} Automatic In-App Update Unit Tests Passed Successfully!`);
