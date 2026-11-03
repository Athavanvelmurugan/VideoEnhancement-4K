/**
 * Thamizh Web Studio — 4K UHD Video Exporter
 * Offline canvas rendering pipeline with MediaRecorder, synchronized real-time playback,
 * and pure-JS EBML Duration header patching to guarantee smooth 30/60 FPS playback.
 */

/**
 * Injects or updates EBML Duration metadata (0x4489) into a WebM Blob
 * Fixes the Chromium MediaRecorder bug where WebM files lack duration and cannot seek.
 * @param {Blob} blob - Original WebM blob produced by MediaRecorder
 * @param {number} durationMs - Target duration in milliseconds
 * @returns {Promise<Blob>} - Fixed WebM blob with valid EBML Duration element
 */
export async function fixWebmDuration(blob, durationMs) {
    if (!blob || durationMs <= 0) return blob;
    try {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Find Segment Info element ID: 0x15, 0x49, 0xA9, 0x66
        let infoPos = -1;
        const searchLimit = Math.min(bytes.length - 4, 8192);
        for (let i = 0; i < searchLimit; i++) {
            if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xa9 && bytes[i + 3] === 0x66) {
                infoPos = i;
                break;
            }
        }
        if (infoPos === -1) return blob;

        // Check if Duration element (0x4489) already exists inside Info (within 256 bytes)
        let durPos = -1;
        const durLimit = Math.min(bytes.length - 2, infoPos + 256);
        for (let i = infoPos; i < durLimit; i++) {
            if (bytes[i] === 0x44 && bytes[i + 1] === 0x89) {
                durPos = i;
                break;
            }
        }

        const dataView = new DataView(buffer);
        if (durPos !== -1) {
            // Overwrite existing duration
            const sizeByte = bytes[durPos + 2];
            const elemSize = sizeByte & 0x7f;
            if (elemSize === 8) {
                dataView.setFloat64(durPos + 3, durationMs, false); // big-endian
                return new Blob([buffer], { type: blob.type });
            } else if (elemSize === 4) {
                dataView.setFloat32(durPos + 3, durationMs, false);
                return new Blob([buffer], { type: blob.type });
            }
        }

        // Duration element is missing: insert [0x44, 0x89, 0x88, float64] into Info
        // Info element starts at infoPos (4 bytes ID). Read its VINT size:
        const pos = infoPos + 4;
        const firstByte = bytes[pos];
        let mask = 0x80;
        let vintLen = 1;
        while ((firstByte & mask) === 0 && vintLen < 8) {
            mask >>= 1;
            vintLen++;
        }

        const insertPos = pos + vintLen;

        // Create 11-byte Duration element: [0x44, 0x89, 0x88, float64 (8 bytes)]
        const durElem = new Uint8Array(11);
        durElem[0] = 0x44;
        durElem[1] = 0x89;
        durElem[2] = 0x88;
        const durView = new DataView(durElem.buffer);
        durView.setFloat64(3, durationMs, false);

        // Update Info size if 1-byte VINT
        let newVint = null;
        if (vintLen === 1) {
            const currentSize = firstByte & 0x7f;
            const newSize = currentSize + 11;
            if (newSize < 127) {
                newVint = new Uint8Array([0x80 | newSize]);
            }
        }

        // Construct patched buffer
        const patched = new Uint8Array(bytes.length + 11);
        if (newVint) {
            patched.set(bytes.subarray(0, pos), 0);
            patched.set(newVint, pos);
            patched.set(durElem, pos + 1);
            patched.set(bytes.subarray(insertPos), pos + 1 + 11);
        } else {
            patched.set(bytes.subarray(0, insertPos), 0);
            patched.set(durElem, insertPos);
            patched.set(bytes.subarray(insertPos), insertPos + 11);
        }

        return new Blob([patched], { type: blob.type });
    } catch (e) {
        console.warn('[VideoExporter] EBML duration patch skipped:', e);
        return blob;
    }
}

export class VideoExporter {
    constructor(glEngine, videoElement) {
        this.glEngine = glEngine;
        this.video = videoElement;
        this.isExporting = false;
    }

    /**
     * Start rendering export
     * @param {Object} options - { format: 'auto'|'mp4'|'webm', resolution: '4k'|'1080p'|'720p', fps: 30|60, onProgress: fn, onComplete: fn, onError: fn }
     */
    async exportVideo(options = {}) {
        if (this.isExporting) return;
        this.isExporting = true;

        const resolutionMap = {
            '4k': { width: 3840, height: 2160, bitrate: 35000000 },
            '1080p': { width: 1920, height: 1080, bitrate: 15000000 },
            '720p': { width: 1280, height: 720, bitrate: 6000000 }
        };

        const target = resolutionMap[options.resolution || '4k'] || resolutionMap['1080p'];
        const targetFps = options.fps || 30;
        const requestedFormat = (options.format || 'auto').toLowerCase();

        // Determine if source is live MediaStream (demo) or imported video file
        const isLiveStream = Boolean(this.video.srcObject) || !isFinite(this.video.duration) || this.video.duration <= 0;
        const duration = isLiveStream ? 5.0 : Math.min(Math.max(this.video.duration, 0.5), 300.0);

        // Create high-resolution 2D offscreen export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = target.width;
        exportCanvas.height = target.height;
        const ctx2d = exportCanvas.getContext('2d', { alpha: false });

        if (!ctx2d) {
            this.isExporting = false;
            throw new Error('Unable to create 2D export canvas context.');
        }

        // Attach export canvas to DOM so Chromium compositor activates paint and frame generation
        if (typeof document !== 'undefined' && document.body) {
            exportCanvas.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:1px; height:1px; pointer-events:none; opacity:0; z-index:-1;';
            document.body.appendChild(exportCanvas);
        }

        // Draw initial frame
        this.glEngine.renderFrame(this.video);
        ctx2d.drawImage(this.glEngine.canvas, 0, 0, target.width, target.height);

        // Capture stream from export canvas at targetFps
        const stream = exportCanvas.captureStream(targetFps);
        const videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;

        // Select optimal supported codec based on requested format
        let preferredTypes = [];
        if (requestedFormat === 'mp4') {
            preferredTypes = [
                'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
                'video/mp4;codecs=avc1',
                'video/mp4;codecs=h264',
                'video/mp4',
                'video/webm;codecs=vp9',
                'video/webm'
            ];
        } else if (requestedFormat === 'webm') {
            preferredTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
        } else {
            // 'auto': prioritize MP4 for universal Windows & mobile compatibility, fallback to WebM
            preferredTypes = [
                'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
                'video/mp4;codecs=avc1',
                'video/mp4;codecs=h264',
                'video/mp4',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
        }

        let mimeType = 'video/webm;codecs=vp9';
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            const supported = preferredTypes.find(t => MediaRecorder.isTypeSupported(t));
            if (supported) mimeType = supported;
        }

        const recordedChunks = [];
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: target.bitrate
        });

        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        const cleanup = () => {
            if (exportCanvas && exportCanvas.parentNode) {
                exportCanvas.parentNode.removeChild(exportCanvas);
            }
        };

        const exportPromise = new Promise((resolve, reject) => {
            recorder.onstop = async () => {
                cleanup();

                const totalBytes = recordedChunks.reduce((acc, c) => acc + (c.size || 0), 0);
                if (totalBytes <= 500) {
                    this.isExporting = false;
                    const err = new Error(`Export failed: generated only ${totalBytes} bytes. Media stream was empty.`);
                    if (options.onError) options.onError(err);
                    reject(err);
                    return;
                }

                let blob = new Blob(recordedChunks, { type: mimeType });

                // Inject EBML Duration metadata into WebM files so players know exact duration & can seek
                if (mimeType.includes('webm')) {
                    blob = await fixWebmDuration(blob, duration * 1000);
                }

                const url = URL.createObjectURL(blob);

                // Determine file extension
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const filename = `Thamizh_${(options.resolution || '4K').toUpperCase()}_Master_${Date.now()}.${ext}`;

                // Trigger direct browser download
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                this.isExporting = false;
                if (options.onComplete) options.onComplete(url);
                resolve(url);
            };

            recorder.onerror = (err) => {
                cleanup();
                this.isExporting = false;
                if (options.onError) options.onError(err);
                reject(err);
            };
        });

        // Start recorder with 200ms timeslice to flush chunks continuously
        recorder.start(200);

        try {
            if (isLiveStream) {
                // Mode A: Live Stream / Animated Demo Portrait (record synchronized real-time frames)
                const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                const targetMs = duration * 1000;
                const frameIntervalMs = Math.max(16, Math.floor(1000 / targetFps));

                while ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime < targetMs && this.isExporting) {
                    this.glEngine.renderFrame(this.video);
                    ctx2d.drawImage(this.glEngine.canvas, 0, 0, target.width, target.height);

                    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
                        videoTrack.requestFrame();
                    }

                    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
                    const percent = Math.min(99, Math.floor((elapsed / targetMs) * 100));
                    if (options.onProgress) options.onProgress(percent);

                    await new Promise(r => setTimeout(r, frameIntervalMs));
                }
            } else {
                // Mode B: File Video (Synchronized Real-Time Playback Pipeline)
                // Eliminates the 230ms step-frame seek delay and prevents 4.3 FPS slow motion distortion
                const origTime = this.video.currentTime;
                const origPaused = this.video.paused;

                this.video.currentTime = 0;
                this.video.playbackRate = 1.0;

                await new Promise((resolve) => {
                    const onSeeked = () => {
                        this.video.removeEventListener('seeked', onSeeked);
                        resolve();
                    };
                    this.video.addEventListener('seeked', onSeeked, { once: true });
                    setTimeout(resolve, 200);
                });

                try {
                    await this.video.play();
                } catch (_) {}

                await new Promise((resolve) => {
                    let finished = false;
                    const endPlayback = () => {
                        if (finished) return;
                        finished = true;
                        this.video.removeEventListener('ended', endPlayback);
                        this.video.pause();
                        resolve();
                    };
                    this.video.addEventListener('ended', endPlayback, { once: true });

                    const renderFrameLoop = () => {
                        if (finished || !this.isExporting) return;

                        // Render current frame through WebGL shader engine
                        this.glEngine.renderFrame(this.video);

                        // Blit onto export canvas at master resolution (4K / 1080p / 720p)
                        ctx2d.drawImage(this.glEngine.canvas, 0, 0, target.width, target.height);

                        if (videoTrack && typeof videoTrack.requestFrame === 'function') {
                            videoTrack.requestFrame();
                        }

                        const current = this.video.currentTime;
                        const percent = Math.min(99, Math.floor((current / duration) * 100));
                        if (options.onProgress) options.onProgress(percent);

                        if (current >= duration - 0.05 || this.video.ended) {
                            endPlayback();
                            return;
                        }

                        if ('requestVideoFrameCallback' in this.video) {
                            this.video.requestVideoFrameCallback(renderFrameLoop);
                        } else {
                            setTimeout(renderFrameLoop, Math.max(16, Math.floor(1000 / targetFps)));
                        }
                    };

                    if ('requestVideoFrameCallback' in this.video) {
                        this.video.requestVideoFrameCallback(renderFrameLoop);
                    } else {
                        setTimeout(renderFrameLoop, Math.max(16, Math.floor(1000 / targetFps)));
                    }
                });

                this.video.currentTime = origTime;
                if (!origPaused) this.video.play().catch(() => {});
            }

            // Flush pending encoder buffers before stopping
            if (recorder.state === 'recording') {
                try { recorder.requestData(); } catch (_) {}
            }
            await new Promise((r) => setTimeout(r, 200));

            // Finalize recording
            if (recorder.state === 'recording') {
                recorder.stop();
            }
        } catch (err) {
            cleanup();
            if (recorder.state === 'recording') {
                recorder.stop();
            }
            this.isExporting = false;
            throw err;
        }

        return exportPromise;
    }
}
