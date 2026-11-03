/**
 * Thamizh Web Studio — Multi-Track Timeline & Playback Controller
 * Frame-accurate seeking, scrubbing, trimming, timecode, and audio waveform
 */

export class TimelineController {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.fps = options.fps || 30;
        this.tracksArea = document.getElementById('timelineTracksArea');
        this.playhead = document.getElementById('timelinePlayhead');
        this.ruler = document.getElementById('timelineRuler');
        this.timeCurrentEl = document.getElementById('timeCurrent');
        this.timeTotalEl = document.getElementById('timeTotal');
        this.waveformCanvas = document.getElementById('audioWaveformCanvas');

        // Track clip boundaries (0.0 to 1.0 fraction of video duration)
        this.trimStart = 0.0;
        this.trimEnd = 1.0;
        this.isScrubbing = false;

        this.initEventListeners();
        this.drawWaveform();
        this.renderRuler();
    }

    /**
     * Convert seconds to formatted timecode HH:MM:SS:FF
     */
    static formatTimecode(seconds, fps = 30) {
        if (isNaN(seconds) || seconds < 0) seconds = 0;
        const totalFrames = Math.floor(seconds * fps);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const frames = totalFrames % fps;

        const pad = (num, size = 2) => String(num).padStart(size, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(secs)}:${pad(frames)}`;
    }

    initEventListeners() {
        if (!this.tracksArea) return;

        // Scrubbing on timeline track lane
        this.tracksArea.addEventListener('mousedown', (e) => {
            this.isScrubbing = true;
            this.handleScrub(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isScrubbing) {
                this.handleScrub(e);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isScrubbing = false;
        });

        // Trim handles
        const handleLeft = document.getElementById('trimHandleLeft');
        const handleRight = document.getElementById('trimHandleRight');
        const mainClip = document.getElementById('mainVideoClip');

        let isTrimmingLeft = false;
        let isTrimmingRight = false;

        if (handleLeft && handleRight && mainClip) {
            handleLeft.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isTrimmingLeft = true;
            });

            handleRight.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isTrimmingRight = true;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isTrimmingLeft && !isTrimmingRight) return;
                const rect = mainClip.parentElement.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

                if (isTrimmingLeft && pos < this.trimEnd - 0.05) {
                    this.trimStart = pos;
                    mainClip.style.left = `${this.trimStart * 100}%`;
                    mainClip.style.width = `${(this.trimEnd - this.trimStart) * 100}%`;
                } else if (isTrimmingRight && pos > this.trimStart + 0.05) {
                    this.trimEnd = pos;
                    mainClip.style.width = `${(this.trimEnd - this.trimStart) * 100}%`;
                }
            });

            window.addEventListener('mouseup', () => {
                isTrimmingLeft = false;
                isTrimmingRight = false;
            });
        }
    }

    handleScrub(e) {
        if (!this.video || !this.video.duration) return;
        const rect = this.tracksArea.getBoundingClientRect();
        // 140px is track header column offset
        const clickX = e.clientX - rect.left - 140;
        const trackWidth = rect.width - 140;

        if (trackWidth <= 0) return;

        const fraction = Math.max(0, Math.min(1, clickX / trackWidth));
        this.video.currentTime = fraction * this.video.duration;
        this.updatePlayheadPosition();
    }

    updatePlayheadPosition() {
        if (!this.video || !this.playhead) return;
        const duration = this.video.duration || 10;
        const current = this.video.currentTime || 0;
        const fraction = current / duration;

        const trackAreaWidth = this.tracksArea.clientWidth - 140;
        const xPos = 140 + fraction * trackAreaWidth;

        this.playhead.style.left = `${xPos}px`;
        if (this.timeCurrentEl) {
            this.timeCurrentEl.textContent = TimelineController.formatTimecode(current, this.fps);
        }
    }

    updateDuration() {
        if (this.video && this.timeTotalEl && this.video.duration) {
            this.timeTotalEl.textContent = TimelineController.formatTimecode(this.video.duration, this.fps);
        }
    }

    stepFrame(direction = 1) {
        if (!this.video) return;
        const frameTime = 1.0 / this.fps;
        this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + direction * frameTime));
        this.updatePlayheadPosition();
    }

    renderRuler() {
        if (!this.ruler) return;
        this.ruler.innerHTML = '';
        const rulerWidth = this.ruler.clientWidth;
        const ticksCount = 20;

        for (let i = 0; i <= ticksCount; i++) {
            const tick = document.createElement('div');
            tick.style.position = 'absolute';
            tick.style.left = `${(i / ticksCount) * 100}%`;
            tick.style.bottom = '0';
            tick.style.width = '1px';
            tick.style.height = i % 5 === 0 ? '12px' : '6px';
            tick.style.background = i % 5 === 0 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
            this.ruler.appendChild(tick);
        }
    }

    drawWaveform() {
        if (!this.waveformCanvas) return;
        const ctx = this.waveformCanvas.getContext('2d');
        const w = (this.waveformCanvas.width = 600);
        const h = (this.waveformCanvas.height = 36);

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#38bdf8';

        // Generate synthetic audio waveform bars
        const bars = 100;
        const barWidth = w / bars;
        for (let i = 0; i < bars; i++) {
            // Smooth natural waveform curve
            const freq = Math.sin(i * 0.15) * 0.5 + Math.sin(i * 0.08) * 0.3 + 0.5;
            const barHeight = Math.max(3, freq * (h * 0.85));
            const y = (h - barHeight) / 2;
            ctx.fillRect(i * barWidth, y, barWidth - 2, barHeight);
        }
    }
}
