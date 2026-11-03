/**
 * Unit Tests for Timeline, History Stack, and Dynamic API Configuration
 */

import { TimelineController } from '../js/timeline.js';
import { ParameterHistory, getApiBaseUrl } from '../js/app.js';

export function runTimelineTests() {
    const results = [];
    const assert = (condition, testName) => {
        if (condition) {
            results.push({ name: testName, passed: true });
        } else {
            results.push({ name: testName, passed: false, error: 'Assertion failed' });
        }
    };

    // Test 1: Timecode zero formatting
    assert(TimelineController.formatTimecode(0, 30) === '00:00:00:00', 'Zero timecode format');

    // Test 2: Standard second formatting (15 seconds, 30 fps)
    assert(TimelineController.formatTimecode(15.5, 30) === '00:00:15:15', 'Timecode with fractional second (15 frames)');

    // Test 3: Minutes & Hours formatting
    assert(TimelineController.formatTimecode(3661, 30) === '01:01:01:00', '1 hour, 1 min, 1 sec format');

    // Test 4: Negative and NaN protection
    assert(TimelineController.formatTimecode(-5, 30) === '00:00:00:00', 'Negative time clamped to zero');
    assert(TimelineController.formatTimecode(NaN, 30) === '00:00:00:00', 'NaN time clamped to zero');

    // Test 5: Trim handle range boundary
    const validateTrim = (start, end) => {
        return start >= 0 && end <= 1.0 && end - start >= 0.05;
    };
    assert(validateTrim(0.1, 0.9) === true, 'Valid trim range (10% to 90%)');
    assert(validateTrim(0.8, 0.82) === false, 'Invalid trim range (too short < 5%)');
    assert(validateTrim(-0.1, 0.5) === false, 'Invalid trim range (< 0)');

    // Test 6: Parameter History Stack - Push, Undo, and Redo
    const history = new ParameterHistory(5);
    assert(history.canUndo() === false, 'History initially cannot undo');
    assert(history.canRedo() === false, 'History initially cannot redo');

    // Initial state A
    const stateA = { skinSmooth: 0.5, faceSlim: 0.2 };
    history.push(stateA);
    assert(history.canUndo() === true, 'History can undo after push');

    // Current state B
    const stateB = { skinSmooth: 0.8, faceSlim: 0.4 };
    const restoredA = history.undo(stateB);
    assert(restoredA.skinSmooth === 0.5, 'Undo restores state A skinSmooth 0.5');
    assert(history.canRedo() === true, 'History can redo after undo');

    // Redo back to state B
    const restoredB = history.redo(restoredA);
    assert(restoredB.skinSmooth === 0.8, 'Redo restores state B skinSmooth 0.8');

    // Test 7: Parameter History Stack size cap
    const capHistory = new ParameterHistory(3);
    capHistory.push({ v: 1 });
    capHistory.push({ v: 2 });
    capHistory.push({ v: 3 });
    capHistory.push({ v: 4 }); // Should evict { v: 1 }
    assert(capHistory.undoStack.length === 3, 'History capped at maximum size 3');
    assert(capHistory.undoStack[0].v === 2, 'Oldest state 1 evicted');

    // Test 8: Dynamic API Base URL resolution (fallback test)
    const apiUrl = getApiBaseUrl();
    assert(typeof apiUrl === 'string' && apiUrl.length > 0, 'Dynamic API Base URL resolves to valid string');

    return results;
}

if (typeof window === 'undefined') {
    // Running under Node.js
    const results = runTimelineTests();
    console.log('=== Timeline, History & Dynamic API Unit Tests ===');
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
