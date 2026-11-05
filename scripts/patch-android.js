/**
 * Android Gradle & Icon Patcher for Remaster Enhancement
 * 1. Injects Kotlin stdlib deduplication rules into android/app/build.gradle
 * 2. Syncs custom high-res mipmap launcher icons into android/app/src/main/res/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function copyAndroidIcons(sourceResDir, targetResDir) {
    if (!fs.existsSync(sourceResDir)) {
        console.warn(`[patch-android] Source icon directory not found: ${sourceResDir}`);
        return false;
    }
    if (!fs.existsSync(targetResDir)) {
        console.warn(`[patch-android] Target res directory not found: ${targetResDir}`);
        return false;
    }

    const folders = fs.readdirSync(sourceResDir);
    let copiedCount = 0;

    for (const folder of folders) {
        if (!folder.startsWith('mipmap') && folder !== 'values') continue;
        const srcFolder = path.join(sourceResDir, folder);
        const dstFolder = path.join(targetResDir, folder);

        if (!fs.existsSync(dstFolder)) {
            fs.mkdirSync(dstFolder, { recursive: true });
        }

        const files = fs.readdirSync(srcFolder);
        for (const file of files) {
            fs.copyFileSync(path.join(srcFolder, file), path.join(dstFolder, file));
            copiedCount++;
        }
    }

    console.log(`✅ [patch-android] Successfully copied ${copiedCount} custom launcher icons & background values to ${targetResDir}`);
    return true;
}

export function patchAndroidGradle(gradlePath) {
    if (!fs.existsSync(gradlePath)) {
        console.warn(`[patch-android] File not found: ${gradlePath}`);
        return false;
    }

    let content = fs.readFileSync(gradlePath, 'utf-8');

    // Check if already patched to maintain idempotency
    if (content.includes("module: 'kotlin-stdlib-jdk7'")) {
        console.log(`[patch-android] ${gradlePath} is already patched.`);
        return true;
    }

    const patchBlock = `
// ==============================================================================
// Auto-Patch: Resolve duplicate Kotlin stdlib classes (Kotlin 1.8+ merge)
// ==============================================================================
configurations.all {
    resolutionStrategy {
        force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'
    }
    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk7'
    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk8'
}
`;

    content += patchBlock;
    fs.writeFileSync(gradlePath, content, 'utf-8');
    console.log(`✅ [patch-android] Successfully patched ${gradlePath}`);
    return true;
}

// Execute when invoked directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const appGradle = path.join(rootDir, 'android', 'app', 'build.gradle');
    patchAndroidGradle(appGradle);

    const sourceRes = path.join(rootDir, 'resources', 'android', 'res');
    const targetRes = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
    if (fs.existsSync(targetRes)) {
        copyAndroidIcons(sourceRes, targetRes);
    }
}
