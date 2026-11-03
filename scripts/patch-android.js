/**
 * Android Gradle Patcher for Thamizh Web Studio
 * Injects Kotlin stdlib deduplication rules into android/app/build.gradle
 * to prevent CheckDuplicatesRunnable collisions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
}
