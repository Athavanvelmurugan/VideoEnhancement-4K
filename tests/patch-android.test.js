/**
 * Patch Android Unit Test Suite
 * Validates that patchAndroidGradle correctly appends Kotlin deduplication rules
 * and behaves idempotently without duplicating blocks.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { patchAndroidGradle } from '../scripts/patch-android.js';

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

console.log('🤖 Running Android Gradle Patcher Test Suite...\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-test-'));
const mockGradlePath = path.join(tempDir, 'build.gradle');

// 1. Initial Mock Gradle File
const initialContent = `
apply plugin: 'com.android.application'

android {
    namespace "com.thamizh.ai.studio"
    compileSdkVersion 34
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
}
`;
fs.writeFileSync(mockGradlePath, initialContent, 'utf-8');

// 2. Test First Patch Application
const patchResult1 = patchAndroidGradle(mockGradlePath);
assert(patchResult1 === true, 'patchAndroidGradle returns true on successful patch');

const patchedContent1 = fs.readFileSync(mockGradlePath, 'utf-8');
assert(
    patchedContent1.includes("module: 'kotlin-stdlib-jdk7'"),
    'Patched file excludes kotlin-stdlib-jdk7'
);
assert(
    patchedContent1.includes("module: 'kotlin-stdlib-jdk8'"),
    'Patched file excludes kotlin-stdlib-jdk8'
);
assert(
    patchedContent1.includes("force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'"),
    'Patched file forces kotlin-stdlib 1.8.22 alignment'
);

// 3. Test Idempotency (Running patch a second time should not duplicate the block)
const patchResult2 = patchAndroidGradle(mockGradlePath);
assert(patchResult2 === true, 'Second patch run returns true');

const patchedContent2 = fs.readFileSync(mockGradlePath, 'utf-8');
const occurrences = (patchedContent2.match(/kotlin-stdlib-jdk7/g) || []).length;
assert(occurrences === 1, 'Patch is idempotent: kotlin-stdlib-jdk7 appears exactly once');

// 4. Test Missing File Handling
const nonExistentPath = path.join(tempDir, 'does-not-exist.gradle');
const missingResult = patchAndroidGradle(nonExistentPath);
assert(missingResult === false, 'Returns false gracefully when target gradle file does not exist');

// Clean up temp directory
fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`\n🎉 All ${passedTests}/${totalTests} Android Gradle Patcher Unit Tests Passed Successfully!`);
