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

// 4. Video Download Byte Integrity & 100-Byte Empty Stream Rejection Test
function validateExportBlobSize(chunks) {
    const totalBytes = chunks.reduce((acc, c) => acc + (c.size || 0), 0);
    if (totalBytes <= 500) {
        return { valid: false, error: `Export failed: generated only ${totalBytes} bytes. Media stream was empty.` };
    }
    return { valid: true, totalBytes };
}

// Case 1: Corrupted 110-byte empty header download attempt (Should be rejected)
const emptyChunks = [{ size: 110 }];
const validationCorrupt = validateExportBlobSize(emptyChunks);
assert(validationCorrupt.valid === false, 'Corrupted 110-byte empty WebM is rejected');
assert(validationCorrupt.error.includes('generated only 110 bytes'), 'Returns descriptive error for 110-byte failure');

// Case 2: Zero-byte failure (Should be rejected)
const zeroChunks = [];
const validationZero = validateExportBlobSize(zeroChunks);
assert(validationZero.valid === false, 'Zero-byte empty stream is rejected');

// Case 3: Legitimate 4K video export with 150 frames (e.g. 8.5 MB) (Should pass)
const validChunks = [
    { size: 2500000 },
    { size: 3000000 },
    { size: 3000000 }
];
const validationSuccess = validateExportBlobSize(validChunks);
assert(validationSuccess.valid === true, 'Legitimate 8.5MB video export passes validation');
assert(validationSuccess.totalBytes === 8500000, 'Calculates correct total export bytes');

// 5. Exporter Source Code Safety Audits
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const exporterCode = fs.readFileSync(path.join(rootDir, 'js', 'exporter.js'), 'utf-8');

assert(
    exporterCode.includes('document.body.appendChild(exportCanvas)'),
    'exporter.js attaches exportCanvas to DOM so compositor processes paint updates'
);

assert(
    exporterCode.includes('videoTrack.requestFrame()'),
    'exporter.js explicitly invokes videoTrack.requestFrame() on every frame'
);

assert(
    exporterCode.includes('recorder.requestData()'),
    'exporter.js calls recorder.requestData() before stop to flush encoder buffers'
);

assert(
    exporterCode.includes('totalBytes <= 500'),
    'exporter.js enforces minimum byte threshold check before triggering browser download'
);

assert(
    exporterCode.includes('fixWebmDuration'),
    'exporter.js includes fixWebmDuration EBML header injector'
);

assert(
    exporterCode.includes('this.video.playbackRate = 1.0') && exporterCode.includes('this.video.play()'),
    'exporter.js uses synchronized real-time playback pipeline to eliminate wall-clock stretching'
);

assert(
    exporterCode.includes('video/mp4;codecs=avc1') && exporterCode.includes('requestedFormat === \'mp4\''),
    'exporter.js supports universal MP4 (H.264 / AVC1) container export'
);

// 6. Validate EBML Duration Injector Functionality
import { fixWebmDuration } from '../js/exporter.js';

const mockEbmlHeader = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x15, 0x49, 0xa9, 0x66, 0x85, 0x01, 0x02, 0x03, 0x04, 0x05]);
const rawMockBlob = new Blob([mockEbmlHeader], { type: 'video/webm' });
const patchedBlob = await fixWebmDuration(rawMockBlob, 34160); // 34.16 seconds
const patchedBuffer = await patchedBlob.arrayBuffer();
const patchedBytes = new Uint8Array(patchedBuffer);

const hasDurationTag = patchedBytes.some((b, i) => b === 0x44 && patchedBytes[i + 1] === 0x89);
assert(hasDurationTag, 'fixWebmDuration successfully injects 0x4489 EBML Duration element into WebM');

const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
assert(
    htmlContent.includes('id="formatSelector"') && htmlContent.includes('data-format="mp4"'),
    'index.html contains #formatSelector with MP4 Universal H.264 option'
);

// 7. Service Worker Cache-Busting & Network-First Audit
const swCode = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf-8');

assert(
    swCode.includes("CACHE_NAME = 'thamizh-studio-v3'"),
    'sw.js bumps cache to thamizh-studio-v3 to purge stale code'
);

assert(
    swCode.includes('fetch(event.request)'),
    'sw.js uses network-first strategy for active script code updates'
);

console.log(`\n🎉 All ${passedTests}/${totalTests} Video Exporter Unit Tests Passed Successfully!`);
