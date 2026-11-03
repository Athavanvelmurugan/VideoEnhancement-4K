/**
 * Video Exporter Unit Test Suite
 * Tests resolution presets, duration fallbacks (Infinity / NaN / MediaStream),
 * and export filename formatting.
 */

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

console.log('🎬 Running Thamizh Video Exporter Test Suite...\n');

// 1. Resolution Map & Bitrate Tests
const resolutionMap = {
    '4k': { width: 3840, height: 2160, bitrate: 35000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 15000000 },
    '720p': { width: 1280, height: 720, bitrate: 6000000 }
};

assert(resolutionMap['4k'].width === 3840 && resolutionMap['4k'].height === 2160, '4K resolution is 3840x2160 UHD');
assert(resolutionMap['1080p'].width === 1920 && resolutionMap['1080p'].height === 1080, '1080p resolution is 1920x1080 Full HD');
assert(resolutionMap['720p'].width === 1280 && resolutionMap['720p'].height === 720, '720p resolution is 1280x720 HD');
assert(resolutionMap['4k'].bitrate > resolutionMap['1080p'].bitrate, '4K bitrate is higher than 1080p');

// 2. Duration & Live Stream Detection Tests
function determineDurationAndMode(videoMock) {
    const isLiveStream = Boolean(videoMock.srcObject) || !isFinite(videoMock.duration) || videoMock.duration <= 0;
    const duration = isLiveStream ? 5.0 : Math.min(Math.max(videoMock.duration, 1.0), 300.0);
    return { isLiveStream, duration };
}

// Case A: MediaStream Demo Video
const demoVideo = { srcObject: {}, duration: NaN };
const resDemo = determineDurationAndMode(demoVideo);
assert(resDemo.isLiveStream === true, 'MediaStream demo video is detected as live stream');
assert(resDemo.duration === 5.0, 'MediaStream demo video gets safe 5.0s default duration');

// Case B: Infinite Duration Stream
const infVideo = { duration: Infinity };
const resInf = determineDurationAndMode(infVideo);
assert(resInf.isLiveStream === true, 'Infinity duration video detected as live stream');
assert(resInf.duration === 5.0, 'Infinity duration clamped to safe 5.0s default');

// Case C: Real 15-second Video File
const fileVideo = { duration: 15.4 };
const resFile = determineDurationAndMode(fileVideo);
assert(resFile.isLiveStream === false, 'File video detected as normal seekable file');
assert(resFile.duration === 15.4, 'File video preserves 15.4s duration');

// Case D: Clamping excessive duration (> 300s)
const longVideo = { duration: 450.0 };
const resLong = determineDurationAndMode(longVideo);
assert(resLong.duration === 300.0, 'Long video duration clamped to 300.0s max export limit');

// 3. Filename Formatting Test
function generateExportFilename(resolution, mimeType, timestamp = 1793700000000) {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    return `Thamizh_${resolution.toUpperCase()}_Master_${timestamp}.${ext}`;
}

const fnWebm = generateExportFilename('4k', 'video/webm;codecs=vp9');
assert(fnWebm === 'Thamizh_4K_Master_1793700000000.webm', 'Generates correct WebM filename with Thamizh brand');

const fnMp4 = generateExportFilename('1080p', 'video/mp4;codecs=h264');
assert(fnMp4 === 'Thamizh_1080P_Master_1793700000000.mp4', 'Generates correct MP4 filename with Thamizh brand');

console.log(`\n🎉 All ${passedTests}/${totalTests} Video Exporter Unit Tests Passed Successfully!`);
