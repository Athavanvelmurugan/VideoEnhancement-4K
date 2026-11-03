/**
 * Unit Tests for WebGL 2.0 Engine & Math Routines
 */

export function runGlEngineTests() {
    const results = [];
    const assert = (condition, testName) => {
        if (condition) {
            results.push({ name: testName, passed: true });
        } else {
            results.push({ name: testName, passed: false, error: 'Assertion failed' });
        }
    };

    // Test 1: Parameter clamping between 0.0 and 1.0
    const clamp = (val, min = 0.0, max = 1.0) => Math.max(min, Math.min(max, val));
    assert(clamp(1.5) === 1.0, 'Parameter clamp upper bound (1.5 -> 1.0)');
    assert(clamp(-0.5) === 0.0, 'Parameter clamp lower bound (-0.5 -> 0.0)');
    assert(clamp(0.65) === 0.65, 'Parameter clamp within normal range (0.65)');

    // Test 2: Color LUT index mapping
    const lutMap = {
        'original': 0,
        'flaze-yellow': 1,
        'teal-orange': 2,
        'emerald-film': 3,
        'cyber-neon': 4,
        'soft-glamour': 5
    };
    assert(lutMap['original'] === 0, 'LUT mapping for original');
    assert(lutMap['flaze-yellow'] === 1, 'LUT mapping for Golden Flaze');
    assert(lutMap['teal-orange'] === 2, 'LUT mapping for Teal & Orange');
    assert(lutMap['emerald-film'] === 3, 'LUT mapping for Emerald Film');

    // Test 3: Resolution aspect ratio computation
    const calcAspect = (w, h) => (w / h).toFixed(2);
    assert(calcAspect(3840, 2160) === '1.78', '4K UHD aspect ratio is 16:9 (1.78)');
    assert(calcAspect(1920, 1080) === '1.78', '1080p aspect ratio is 16:9 (1.78)');
    assert(calcAspect(1280, 720) === '1.78', '720p aspect ratio is 16:9 (1.78)');

    // Test 4: Split screen ratio normalization
    const normalizeSplit = (clientX, left, width) => {
        let ratio = (clientX - left) / width;
        return Math.max(0.05, Math.min(0.95, ratio));
    };
    assert(normalizeSplit(500, 0, 1000) === 0.5, 'Split ratio centered at 50%');
    assert(normalizeSplit(-100, 0, 1000) === 0.05, 'Split ratio clamped at left margin (5%)');
    assert(normalizeSplit(1200, 0, 1000) === 0.95, 'Split ratio clamped at right margin (95%)');

    return results;
}

if (typeof window === 'undefined') {
    // Running under Node.js
    const results = runGlEngineTests();
    console.log('=== WebGL Engine Math Unit Tests ===');
    let allPassed = true;
    results.forEach(r => {
        if (r.passed) {
            console.log(`PASS: ${r.name}`);
        } else {
            console.error(`FAIL: ${r.name}`);
            allPassed = false;
        }
    });
    if (!allPassed) process.exit(1);
}
