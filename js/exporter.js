/**
 * Thamizh Web Studio — 4K UHD Video Exporter
 * Offline canvas rendering pipeline with MediaRecorder & high-bitrate encoding
 */

export class VideoExporter {
    constructor(glEngine, videoElement) {
        this.glEngine = glEngine;
        this.video = videoElement;
        this.isExporting = false;
    }

    /**
     * Start rendering export
     * @param {Object} options - { resolution: '4k'|'1080p'|'720p', fps: 30|60, onProgress: fn, onComplete: fn }
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

        // Determine if source is live MediaStream (demo) or imported video file
        const isLiveStream = Boolean(this.video.srcObject) || !isFinite(this.video.duration) || this.video.duration <= 0;
        const duration = isLiveStream ? 5.0 : Math.min(Math.max(this.video.duration, 1.0), 300.0);

        // Create high-resolution 2D offscreen export canvas (DO NOT initialize WebGL on it)
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

        // Capture stream from export canvas
        const stream = exportCanvas.captureStream(targetFps);
        const videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;

        // Select optimal supported codec
        let mimeType = 'video/webm;codecs=vp9';
        const candidateTypes = [
            'video/mp4;codecs=h264',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            const supported = candidateTypes.find(t => MediaRecorder.isTypeSupported(t));
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
            recorder.onstop = () => {
                cleanup();

                const totalBytes = recordedChunks.reduce((acc, c) => acc + (c.size || 0), 0);
                if (totalBytes <= 500) {
                    this.isExporting = false;
                    const err = new Error(`Export failed: generated only ${totalBytes} bytes. Media stream was empty.`);
                    if (options.onError) options.onError(err);
                    reject(err);
                    return;
                }

                const blob = new Blob(recordedChunks, { type: mimeType });
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

        const totalFrames = Math.max(15, Math.floor(duration * targetFps));

        try {
            if (isLiveStream) {
                // Mode A: Live Stream / Animated Demo Portrait (record consecutive real-time frames)
                const frameDelayMs = Math.max(16, Math.floor(1000 / targetFps));
                for (let frame = 0; frame < totalFrames; frame++) {
                    this.glEngine.renderFrame(this.video);
                    ctx2d.drawImage(this.glEngine.canvas, 0, 0, target.width, target.height);

                    // Explicitly signal frame to CanvasCaptureMediaStreamTrack
                    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
                        videoTrack.requestFrame();
                    }

                    const percent = Math.floor(((frame + 1) / totalFrames) * 100);
                    if (options.onProgress) {
                        options.onProgress(percent, frame + 1, totalFrames);
                    }

                    await new Promise((r) => setTimeout(r, frameDelayMs));
                }
            } else {
                // Mode B: File Video (step-frame seek with fail-safe timeout)
                const origTime = this.video.currentTime;
                const origPaused = this.video.paused;
                this.video.pause();

                const frameInterval = duration / totalFrames;
                const frameDelayMs = Math.max(16, Math.floor(1000 / targetFps));

                for (let frame = 0; frame < totalFrames; frame++) {
                    const targetTime = Math.min(frame * frameInterval, duration);
                    this.video.currentTime = targetTime;

                    // Wait for video frame seek with 150ms timeout fallback
                    await new Promise((resolve) => {
                        let completed = false;
                        const finish = () => {
                            if (!completed) {
                                completed = true;
                                this.video.removeEventListener('seeked', finish);
                                resolve();
                            }
                        };
                        this.video.addEventListener('seeked', finish, { once: true });
                        setTimeout(finish, 150);
                    });

                    // Render current frame through WebGL shader engine
                    this.glEngine.renderFrame(this.video);

                    // Blit onto export canvas at master resolution (4K / 1080p / 720p)
                    ctx2d.drawImage(this.glEngine.canvas, 0, 0, target.width, target.height);

                    // Explicitly signal frame to CanvasCaptureMediaStreamTrack
                    if (videoTrack && typeof videoTrack.requestFrame === 'function') {
                        videoTrack.requestFrame();
                    }

                    const percent = Math.floor(((frame + 1) / totalFrames) * 100);
                    if (options.onProgress) {
                        options.onProgress(percent, frame + 1, totalFrames);
                    }

                    await new Promise((r) => setTimeout(r, frameDelayMs));
                }

                this.video.currentTime = origTime;
                if (!origPaused) this.video.play().catch(() => {});
            }

            // Flush pending encoder buffers before stopping
            if (recorder.state === 'recording') {
                try { recorder.requestData(); } catch (_) {}
            }
            await new Promise((r) => setTimeout(r, 250));

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
