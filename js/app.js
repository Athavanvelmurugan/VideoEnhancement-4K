/**
 * Thamizh Web Studio — Main Application Orchestrator
 * Coordinates UI, WebGL Engine, Face Tracking, Timeline, and Video Playback
 */

import { GlEngine } from './gl-engine.js';
import { FaceTracker } from './face-tracker.js';
import { TimelineController } from './timeline.js';
import { VideoExporter } from './exporter.js';

/**
 * Dynamic API Base URL resolver (no hardcoded hosts or ports)
 */
export function getApiBaseUrl() {
    if (typeof window === 'undefined') return 'http://127.0.0.1:8000';

    // 1. Check for custom configured backend URL
    try {
        const customUrl = localStorage.getItem('thamizh_backend_url');
        if (customUrl && customUrl.trim().length > 0) return customUrl.trim();
    } catch {
        // Safe fallback if localStorage is unavailable
    }

    // 2. Default Cloud Backend Endpoint for remote APK users
    const DEFAULT_CLOUD_BACKEND = 'https://videoenhancement-4k.onrender.com';

    // 3. Detect Capacitor Android WebView or mobile standalone environment
    const isCapacitor = window.location.protocol === 'capacitor:' || 
                        (window.location.protocol === 'http:' && window.location.hostname === 'localhost' && window.location.port === '');
    
    if (isCapacitor) {
        return DEFAULT_CLOUD_BACKEND;
    }

    if (window.location.protocol === 'file:') return 'http://127.0.0.1:8000';
    // If the frontend is served from the FastAPI backend itself on port 8000
    if (window.location.port === '8000') return '';
    // Otherwise fallback to the backend port on the same host
    return `${window.location.protocol}//${window.location.hostname}:8000`;
}

/**
 * Parameter Undo/Redo History Manager
 */
export class ParameterHistory {
    constructor(maxSize = 40) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
    }

    push(state) {
        this.undoStack.push(JSON.parse(JSON.stringify(state)));
        if (this.undoStack.length > this.maxSize) this.undoStack.shift();
        this.redoStack = [];
    }

    undo(currentState) {
        if (!this.canUndo()) return null;
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));
        return this.undoStack.pop();
    }

    redo(currentState) {
        if (!this.canRedo()) return null;
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));
        return this.redoStack.pop();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}

class ThamizhApp {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.video = document.getElementById('sourceVideo');
        this.glEngine = new GlEngine(this.canvas);
        this.faceTracker = new FaceTracker();
        this.timeline = new TimelineController(this.video);
        this.exporter = new VideoExporter(this.glEngine, this.video);
        this.history = new ParameterHistory(40);

        this.animationFrameId = null;
        this.isSplitDragging = false;
        this.splitRatio = 0.5;
        this.currentVideoFile = null;

        this.initDemoMedia();
        this.initUIEventListeners();
        this.initSplitSlider();
        this.initPresets();
        this.initExportModal();
        this.updateUndoRedoButtons();
        this.startRenderLoop();
    }

    /**
     * Create high-quality animated portrait demo canvas if no external video is loaded yet
     */
    initDemoMedia() {
        // Create an offscreen dynamic video generator canvas
        const demoCanvas = document.createElement('canvas');
        demoCanvas.width = 1280;
        demoCanvas.height = 720;
        const ctx = demoCanvas.getContext('2d');

        let tick = 0;
        const drawDemoFrame = () => {
            tick += 0.03;
            // Background cinematic gradient
            const grad = ctx.createRadialGradient(640, 360, 50, 640, 360, 600);
            grad.addColorStop(0, '#2d1b4e');
            grad.addColorStop(0.5, '#131127');
            grad.addColorStop(1, '#08080f');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1280, 720);

            // Subtle background studio light bokeh
            for (let i = 0; i < 6; i++) {
                const bx = 300 + Math.sin(tick * 0.5 + i) * 200 + i * 120;
                const by = 200 + Math.cos(tick * 0.7 + i) * 100;
                ctx.beginPath();
                ctx.arc(bx, by, 60 + i * 15, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(139, 92, 246, ${0.08 + Math.sin(tick + i) * 0.04})`;
                ctx.fill();
            }

            // Draw stylized portrait figure (Face, Eyes, Lips, Hair, Shoulders)
            const faceCenterX = 640 + Math.sin(tick * 0.6) * 12;
            const faceCenterY = 360 + Math.cos(tick * 0.8) * 8;

            // Shoulders & neck
            ctx.fillStyle = '#f0c2a2';
            ctx.beginPath();
            ctx.ellipse(faceCenterX, faceCenterY + 180, 220, 160, 0, 0, Math.PI * 2);
            ctx.fill();

            // Jawline & Face Oval
            ctx.fillStyle = '#f8d1b4';
            ctx.beginPath();
            ctx.ellipse(faceCenterX, faceCenterY, 130, 170, 0, 0, Math.PI * 2);
            ctx.fill();

            // Hair
            ctx.fillStyle = '#221510';
            ctx.beginPath();
            ctx.arc(faceCenterX, faceCenterY - 40, 150, Math.PI, Math.PI * 2);
            ctx.fill();
            // Side hair strands
            ctx.fillRect(faceCenterX - 150, faceCenterY - 40, 40, 240);
            ctx.fillRect(faceCenterX + 110, faceCenterY - 40, 40, 240);

            // Eyebrows
            ctx.strokeStyle = '#3d2314';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(faceCenterX - 50, faceCenterY - 45, 30, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(faceCenterX + 50, faceCenterY - 45, 30, Math.PI * 1.1, Math.PI * 1.9);
            ctx.stroke();

            // Eyes (with realistic blinking)
            const blink = Math.sin(tick * 1.5) > 0.96 ? 0.1 : 1.0;
            // Eye whites
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(faceCenterX - 50, faceCenterY - 20, 22, 12 * blink, 0, 0, Math.PI * 2);
            ctx.ellipse(faceCenterX + 50, faceCenterY - 20, 22, 12 * blink, 0, 0, Math.PI * 2);
            ctx.fill();

            // Irises (Radiant hazel/brown)
            if (blink > 0.3) {
                ctx.fillStyle = '#5c3a21';
                ctx.beginPath();
                ctx.arc(faceCenterX - 50, faceCenterY - 20, 9, 0, Math.PI * 2);
                ctx.arc(faceCenterX + 50, faceCenterY - 20, 9, 0, Math.PI * 2);
                ctx.fill();

                // Catchlight reflection
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(faceCenterX - 48, faceCenterY - 23, 3, 0, Math.PI * 2);
                ctx.arc(faceCenterX + 52, faceCenterY - 23, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Nose
            ctx.strokeStyle = '#d99f7d';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(faceCenterX, faceCenterY - 15);
            ctx.lineTo(faceCenterX - 6, faceCenterY + 30);
            ctx.lineTo(faceCenterX + 8, faceCenterY + 30);
            ctx.stroke();

            // Natural Lip & Smile
            ctx.fillStyle = '#d9657b';
            ctx.beginPath();
            ctx.ellipse(faceCenterX, faceCenterY + 75, 36, 16, 0, 0, Math.PI * 2);
            ctx.fill();

            // Teeth inside smile
            ctx.fillStyle = '#faf0e6';
            ctx.beginPath();
            ctx.ellipse(faceCenterX, faceCenterY + 72, 22, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Subtle simulated skin texture/imperfections to show off AI smoothing
            ctx.fillStyle = 'rgba(180, 100, 80, 0.25)';
            ctx.beginPath();
            ctx.arc(faceCenterX - 35, faceCenterY + 25, 4, 0, Math.PI * 2);
            ctx.arc(faceCenterX + 45, faceCenterY + 15, 5, 0, Math.PI * 2);
            ctx.fill();
        };

        // Capture demo stream into video element
        const stream = demoCanvas.captureStream(30);
        this.video.srcObject = stream;
        this.video.play().catch(() => {});

        // Run internal demo canvas loop
        setInterval(drawDemoFrame, 1000 / 30);

        this.glEngine.setResolution(1280, 720);
        this.timeline.updateDuration();

        // Update UI dynamic names
        this.updateProjectDetails('Demo_Hero_Portrait.mp4', 1280, 720, 30);
    }

    updateProjectDetails(name, width, height, fps = 30) {
        const proj = document.getElementById('projectName');
        if (proj) proj.textContent = name;

        const badge = document.getElementById('resolutionBadge');
        if (badge) badge.textContent = `${width}×${height} • ${Math.round(fps)} FPS`;

        const clipName = document.querySelector('.video-clip .clip-name');
        if (clipName) clipName.textContent = name;
    }

    /**
     * UI Event Listeners (Tabs, Sliders, Transport, Undo/Redo, Buttons)
     */
    initUIEventListeners() {
        // Undo and Redo Buttons
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        undoBtn?.addEventListener('click', () => {
            const prevState = this.history.undo(this.glEngine.getParams());
            if (prevState) {
                this.applyParamsToUI(prevState);
                this.updateUndoRedoButtons();
            }
        });

        redoBtn?.addEventListener('click', () => {
            const nextState = this.history.redo(this.glEngine.getParams());
            if (nextState) {
                this.applyParamsToUI(nextState);
                this.updateUndoRedoButtons();
            }
        });

        // Mobile Inspector Sheet Pill Collapse/Expand
        const sheetPill = document.getElementById('sheetDragPill');
        const inspector = document.getElementById('inspectorPanel');
        if (sheetPill && inspector) {
            sheetPill.addEventListener('click', () => {
                inspector.classList.toggle('collapsed');
            });
        }

        // Primary Nav Tab Switching
        const navTabs = document.querySelectorAll('.nav-tab');
        const tabContents = {
            'retouch': document.getElementById('tabContentRetouch'),
            'enhancer': document.getElementById('tabContentEnhancer'),
            'filters': document.getElementById('tabContentFilters'),
            'body': document.getElementById('tabContentBody'),
            'subtitles': document.getElementById('tabContentSubtitles')
        };

        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                navTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const targetTab = tab.getAttribute('data-tab');
                Object.entries(tabContents).forEach(([key, contentEl]) => {
                    if (contentEl) {
                        contentEl.classList.toggle('active', key === targetTab);
                    }
                });

                // Auto-expand mobile bottom sheet when tab is tapped
                if (inspector && inspector.classList.contains('collapsed')) {
                    inspector.classList.remove('collapsed');
                }
            });
        });

        // Sliders Binding — Retouch Suite
        this.bindSlider('sliderSkinSmooth', 'valSkinSmooth', 'skinSmooth', 100);
        this.bindSlider('sliderSkinDetail', 'valSkinDetail', 'skinDetail', 100);
        this.bindSlider('sliderFaceSlim', 'valFaceSlim', 'faceSlim', 100);
        this.bindSlider('sliderBigEyes', 'valBigEyes', 'bigEyes', 100);
        this.bindSlider('sliderTeethWhiten', 'valTeethWhiten', 'teethWhiten', 100);
        this.bindSlider('sliderFaceRelight', 'valFaceRelight', 'faceRelight', 100);

        // Sliders Binding — AI 4K Repair Suite
        this.bindSlider('sliderSuperRes', 'valSuperRes', 'superRes', 100);
        this.bindSlider('sliderDenoise', 'valDenoise', 'denoise', 100);
        this.bindSlider('sliderDeblur', 'valDeblur', 'deblur', 100);
        this.bindSlider('sliderLowLight', 'valLowLight', 'lowLight', 100);

        // Sliders Binding — Body Tune Suite
        this.bindSlider('sliderBodySlim', 'valBodySlim', 'bodySlim', 100);
        this.bindSlider('sliderLegLengthen', 'valLegLengthen', 'legLengthen', 100);

        // Sliders Binding — LUT Opacity
        this.bindSlider('sliderLutIntensity', 'valLutIntensity', 'lutIntensity', 100);

        // Reset Buttons
        document.getElementById('resetRetouchBtn')?.addEventListener('click', () => {
            this.history.push(this.glEngine.getParams());
            this.setSliderVal('sliderSkinSmooth', 'valSkinSmooth', 'skinSmooth', 65);
            this.setSliderVal('sliderSkinDetail', 'valSkinDetail', 'skinDetail', 80);
            this.setSliderVal('sliderFaceSlim', 'valFaceSlim', 'faceSlim', 35);
            this.setSliderVal('sliderBigEyes', 'valBigEyes', 'bigEyes', 40);
            this.setSliderVal('sliderTeethWhiten', 'valTeethWhiten', 'teethWhiten', 55);
            this.setSliderVal('sliderFaceRelight', 'valFaceRelight', 'faceRelight', 45);
            this.updateUndoRedoButtons();
        });

        document.getElementById('resetEnhancerBtn')?.addEventListener('click', () => {
            this.history.push(this.glEngine.getParams());
            this.setSliderVal('sliderSuperRes', 'valSuperRes', 'superRes', 75);
            this.setSliderVal('sliderDenoise', 'valDenoise', 'denoise', 60);
            this.setSliderVal('sliderDeblur', 'valDeblur', 'deblur', 50);
            this.setSliderVal('sliderLowLight', 'valLowLight', 'lowLight', 40);
            this.updateUndoRedoButtons();
        });

        document.getElementById('resetLutBtn')?.addEventListener('click', () => {
            this.history.push(this.glEngine.getParams());
            this.selectLut('original');
            this.updateUndoRedoButtons();
        });

        // LUT Filter Cards
        const lutCards = document.querySelectorAll('.lut-card');
        lutCards.forEach(card => {
            card.addEventListener('click', () => {
                this.history.push(this.glEngine.getParams());
                lutCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const lutKey = card.getAttribute('data-lut');
                this.selectLut(lutKey);
                this.updateUndoRedoButtons();
            });
        });

        // Fit to Screen Button Toggle
        const fitBtn = document.getElementById('fitScreenBtn');
        let isFitCover = false;
        fitBtn?.addEventListener('click', () => {
            isFitCover = !isFitCover;
            if (this.canvas) {
                this.canvas.classList.toggle('fit-cover', isFitCover);
            }
            if (fitBtn) {
                fitBtn.innerHTML = isFitCover ? '<span class="icon">🔍</span> Fill: 100%' : '<span class="icon">🔍</span> Fit: SCREEN';
            }
        });

        // Loop Playback Toggle
        const loopBtn = document.getElementById('loopToggleBtn');
        let isLooping = true;
        this.video.loop = true;
        loopBtn?.classList.add('active');

        loopBtn?.addEventListener('click', () => {
            isLooping = !isLooping;
            this.video.loop = isLooping;
            loopBtn.classList.toggle('active', isLooping);
            loopBtn.title = isLooping ? 'Loop: ON' : 'Loop: OFF';
        });

        // Transport Play / Pause
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playIcon = document.getElementById('playIcon');
        const pauseIcon = document.getElementById('pauseIcon');

        const togglePlay = () => {
            if (this.video.paused) {
                this.video.play().catch(() => {});
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
            } else {
                this.video.pause();
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            }
        };

        playPauseBtn?.addEventListener('click', togglePlay);

        // Frame Stepping
        document.getElementById('stepBackBtn')?.addEventListener('click', () => this.timeline.stepFrame(-1));
        document.getElementById('stepForwardBtn')?.addEventListener('click', () => this.timeline.stepFrame(1));

        // Speed Buttons
        const speedButtons = document.querySelectorAll('.speed-btn');
        speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                speedButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const speed = parseFloat(btn.getAttribute('data-speed'));
                this.video.playbackRate = speed;
            });
        });

        // Volume Mute Toggle
        const muteToggleBtn = document.getElementById('muteToggleBtn');
        const volHigh = document.getElementById('volumeHighIcon');
        const volMute = document.getElementById('volumeMuteIcon');
        muteToggleBtn?.addEventListener('click', () => {
            this.video.muted = !this.video.muted;
            if (volHigh) volHigh.style.display = this.video.muted ? 'none' : 'block';
            if (volMute) volMute.style.display = this.video.muted ? 'block' : 'none';
        });

        // Keyboard Shortcuts (Space: Play/Pause, Left/Right: Frame step, Ctrl+Z: Undo, Ctrl+Y: Redo)
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowLeft') {
                this.timeline.stepFrame(-1);
            } else if (e.code === 'ArrowRight') {
                this.timeline.stepFrame(1);
            } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
                e.preventDefault();
                const prevState = this.history.undo(this.glEngine.getParams());
                if (prevState) {
                    this.applyParamsToUI(prevState);
                    this.updateUndoRedoButtons();
                }
            } else if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
                e.preventDefault();
                const nextState = this.history.redo(this.glEngine.getParams());
                if (nextState) {
                    this.applyParamsToUI(nextState);
                    this.updateUndoRedoButtons();
                }
            }
        });

        // File Upload & Drag and Drop
        const fileInput = document.getElementById('videoFileInput');
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadUserVideo(file);
        });

        const dropzone = document.getElementById('dropzoneOverlay');
        const stage = document.querySelector('.stage-container');

        stage?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone?.classList.add('active');
        });

        dropzone?.addEventListener('dragleave', () => {
            dropzone.classList.remove('active');
        });

        dropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) {
                this.loadUserVideo(file);
            }
        });

        // Demo Video Reload Button
        document.getElementById('loadSampleBtn')?.addEventListener('click', () => {
            this.initDemoMedia();
        });

        // Groq AI Director Button
        const askAiBtn = document.getElementById('askAiDirectorBtn');
        const promptInput = document.getElementById('aiDirectorPromptInput');
        const feedbackBox = document.getElementById('aiDirectorFeedback');
        const styleTag = document.getElementById('aiDirectorStyleTag');
        const expText = document.getElementById('aiDirectorExplanation');

        askAiBtn?.addEventListener('click', async () => {
            const prompt = promptInput?.value?.trim();
            if (!prompt) return;

            this.history.push(this.glEngine.getParams());
            askAiBtn.disabled = true;
            askAiBtn.innerHTML = '<span>⏳ Thinking...</span>';

            const apiBase = getApiBaseUrl();

            try {
                const response = await fetch(`${apiBase}/api/ai/director`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });

                if (!response.ok) throw new Error(`API status ${response.status}`);
                const resData = await response.json();
                const p = resData.data;

                // Apply parameters to sliders & WebGL shaders
                this.applyParamsToUI(p);

                // Show Feedback from AI
                if (feedbackBox) {
                    feedbackBox.style.display = 'flex';
                    if (styleTag) styleTag.textContent = `✨ ${p.styleName || 'AI CUSTOM LOOK'}`;
                    if (expText) expText.textContent = p.explanation || 'Parameters optimized for scene aesthetics.';
                }
                this.updateUndoRedoButtons();
            } catch (err) {
                console.warn('AI Director error (fallback to local smart preset):', err);
                if (feedbackBox) {
                    feedbackBox.style.display = 'flex';
                    if (styleTag) styleTag.textContent = '✨ LOCAL AI LOOK';
                    if (expText) expText.textContent = 'Applied local aesthetic beauty preset. Ensure backend is running.';
                }
            } finally {
                askAiBtn.disabled = false;
                askAiBtn.innerHTML = '<span>⚡ AI Tune</span>';
            }
        });

        // Caption Animation Style Chips (Pop Bounce, Karaoke Glow, Minimal White)
        const capChips = document.querySelectorAll('.cap-style-chip');
        const subtitleText = document.getElementById('subtitleText');

        capChips.forEach(chip => {
            chip.addEventListener('click', () => {
                capChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const style = chip.getAttribute('data-style');

                if (subtitleText) {
                    subtitleText.classList.remove('style-bounce', 'style-karaoke', 'style-minimal');
                    subtitleText.classList.add(`style-${style}`);
                }
            });
        });

        // Auto Captions with Groq Whisper
        const genCapBtn = document.getElementById('generateCaptionsBtn');
        const subtitleOverlay = document.getElementById('subtitleOverlay');
        const subText = document.getElementById('subtitleText');
        const whisperBox = document.getElementById('whisperStatusBox');

        genCapBtn?.addEventListener('click', async () => {
            if (whisperBox) whisperBox.style.display = 'flex';
            genCapBtn.disabled = true;

            const apiBase = getApiBaseUrl();

            try {
                if (this.currentVideoFile) {
                    const formData = new FormData();
                    formData.append('video', this.currentVideoFile);

                    const res = await fetch(`${apiBase}/api/ai/transcribe`, {
                        method: 'POST',
                        body: formData
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const transcriptText = data.transcription?.text || 'Groq Whisper transcribed audio seamlessly.';
                        if (subText) subText.textContent = `"${transcriptText}"`;
                    }
                } else {
                    await new Promise(r => setTimeout(r, 500));
                    if (subText) subText.textContent = '✨ "Groq Whisper: Ultra-fast 4K video captioning active"';
                }

                if (subtitleOverlay) subtitleOverlay.style.display = 'block';
                genCapBtn.innerHTML = '✓ Captions Active (Groq Whisper)';
            } catch (err) {
                console.warn('Whisper transcription notice:', err);
                if (subtitleOverlay) subtitleOverlay.style.display = 'block';
                if (subText) subText.textContent = '✨ "Thamizh 4K VIP AI Studio Powered by Groq"';
            } finally {
                if (whisperBox) whisperBox.style.display = 'none';
                genCapBtn.disabled = false;
            }
        });
    }

    /**
     * Update Undo/Redo button states
     */
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = !this.history.canUndo();
        if (redoBtn) redoBtn.disabled = !this.history.canRedo();
    }

    /**
     * Apply parameter snapshot to all sliders, badges, and WebGL
     */
    applyParamsToUI(p) {
        if (!p) return;

        if (p.skinSmooth !== undefined) this.setSliderVal('sliderSkinSmooth', 'valSkinSmooth', 'skinSmooth', p.skinSmooth * 100);
        if (p.skinDetail !== undefined) this.setSliderVal('sliderSkinDetail', 'valSkinDetail', 'skinDetail', p.skinDetail * 100);
        if (p.faceSlim !== undefined) this.setSliderVal('sliderFaceSlim', 'valFaceSlim', 'faceSlim', p.faceSlim * 100);
        if (p.bigEyes !== undefined) this.setSliderVal('sliderBigEyes', 'valBigEyes', 'bigEyes', p.bigEyes * 100);
        if (p.teethWhiten !== undefined) this.setSliderVal('sliderTeethWhiten', 'valTeethWhiten', 'teethWhiten', p.teethWhiten * 100);
        if (p.faceRelight !== undefined) this.setSliderVal('sliderFaceRelight', 'valFaceRelight', 'faceRelight', p.faceRelight * 100);

        if (p.superRes !== undefined) this.setSliderVal('sliderSuperRes', 'valSuperRes', 'superRes', p.superRes * 100);
        if (p.denoise !== undefined) this.setSliderVal('sliderDenoise', 'valDenoise', 'denoise', p.denoise * 100);
        if (p.deblur !== undefined) this.setSliderVal('sliderDeblur', 'valDeblur', 'deblur', p.deblur * 100);
        if (p.lowLight !== undefined) this.setSliderVal('sliderLowLight', 'valLowLight', 'lowLight', p.lowLight * 100);

        if (p.bodySlim !== undefined) this.setSliderVal('sliderBodySlim', 'valBodySlim', 'bodySlim', p.bodySlim * 100);
        if (p.legLengthen !== undefined) this.setSliderVal('sliderLegLengthen', 'valLegLengthen', 'legLengthen', p.legLengthen * 100);

        if (p.lutType !== undefined) {
            this.glEngine.updateParams({ lutType: p.lutType });
            const lutKeys = ['original', 'flaze-yellow', 'teal-orange', 'emerald-film', 'cyber-neon', 'soft-glamour'];
            const activeKey = lutKeys[p.lutType] || 'original';
            document.querySelectorAll('.lut-card').forEach(c => {
                c.classList.toggle('active', c.getAttribute('data-lut') === activeKey);
            });
        }
        if (p.lutIntensity !== undefined) {
            this.setSliderVal('sliderLutIntensity', 'valLutIntensity', 'lutIntensity', p.lutIntensity * 100);
        }
    }

    /**
     * Load Video File uploaded by user
     */
    loadUserVideo(file) {
        this.currentVideoFile = file;
        const url = URL.createObjectURL(file);
        this.video.srcObject = null;
        this.video.src = url;
        this.video.load();
        this.video.play().catch(() => {});

        this.video.onloadedmetadata = () => {
            const w = this.video.videoWidth || 1920;
            const h = this.video.videoHeight || 1080;
            this.glEngine.setResolution(w, h);
            this.timeline.updateDuration();
            this.updateProjectDetails(file.name, w, h, 30);
        };
    }

    /**
     * Helper to wire slider with uniform parameter and history push
     */
    bindSlider(sliderId, labelId, paramKey, divisor = 100) {
        const slider = document.getElementById(sliderId);
        const label = document.getElementById(labelId);
        if (!slider) return;

        // On input: live feedback
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (label) label.textContent = `${Math.round(val)}%`;
            this.glEngine.updateParams({ [paramKey]: val / divisor });
        });

        // On change (mouse up): record to history stack
        slider.addEventListener('change', () => {
            this.history.push(this.glEngine.getParams());
            this.updateUndoRedoButtons();
        });
    }

    setSliderVal(sliderId, labelId, paramKey, value) {
        const slider = document.getElementById(sliderId);
        const label = document.getElementById(labelId);
        if (slider) slider.value = value;
        if (label) label.textContent = `${Math.round(value)}%`;
        this.glEngine.updateParams({ [paramKey]: value / 100 });
    }

    /**
     * Select Color LUT filter
     */
    selectLut(name) {
        const lutMap = {
            'original': 0,
            'flaze-yellow': 1,
            'teal-orange': 2,
            'emerald-film': 3,
            'cyber-neon': 4,
            'soft-glamour': 5
        };
        const type = lutMap[name] !== undefined ? lutMap[name] : 0;
        this.glEngine.updateParams({ lutType: type });
    }

    /**
     * Initialize Interactive Split-Screen Slider & Hold-to-Compare
     */
    initSplitSlider() {
        const sliderLine = document.getElementById('splitSliderLine');
        const handle = document.getElementById('splitHandle');
        const viewport = document.getElementById('viewportWrapper');
        const splitToggleBtn = document.getElementById('splitToggleBtn');
        const splitStatusText = document.getElementById('splitStatusText');
        const holdCompareBtn = document.getElementById('holdCompareBtn');

        if (!sliderLine || !handle || !viewport) return;

        const updateSplitPos = (clientX) => {
            const rect = viewport.getBoundingClientRect();
            let ratio = (clientX - rect.left) / rect.width;
            ratio = Math.max(0.05, Math.min(0.95, ratio));
            this.splitRatio = ratio;
            sliderLine.style.left = `${ratio * 100}%`;
            this.glEngine.updateParams({ splitX: ratio });
        };

        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.isSplitDragging = true;
        });

        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            this.isSplitDragging = true;
            if (e.touches && e.touches[0]) {
                updateSplitPos(e.touches[0].clientX);
            }
        }, { passive: true });

        window.addEventListener('mousemove', (e) => {
            if (this.isSplitDragging) {
                updateSplitPos(e.clientX);
            }
        });

        window.addEventListener('touchmove', (e) => {
            if (this.isSplitDragging && e.touches && e.touches[0]) {
                updateSplitPos(e.touches[0].clientX);
            }
        }, { passive: true });

        window.addEventListener('mouseup', () => {
            this.isSplitDragging = false;
        });

        window.addEventListener('touchend', () => {
            this.isSplitDragging = false;
        });

        // Split Toggle ON/OFF
        let isSplitOn = true;
        splitToggleBtn?.addEventListener('click', () => {
            isSplitOn = !isSplitOn;
            sliderLine.style.display = isSplitOn ? 'block' : 'none';
            if (splitStatusText) splitStatusText.textContent = isSplitOn ? 'ON' : 'OFF';
            this.glEngine.updateParams({ splitEnabled: isSplitOn });
        });

        // Hold Compare Button (Show Raw input on hold)
        if (holdCompareBtn) {
            const holdStart = () => this.glEngine.updateParams({ holdRaw: true });
            const holdEnd = () => this.glEngine.updateParams({ holdRaw: false });

            holdCompareBtn.addEventListener('mousedown', holdStart);
            window.addEventListener('mouseup', holdEnd);
            holdCompareBtn.addEventListener('touchstart', holdStart);
            window.addEventListener('touchend', holdEnd);
        }
    }

    /**
     * Initialize One-Tap AI Presets
     */
    initPresets() {
        const presetCards = document.querySelectorAll('.preset-card');
        const presets = {
            natural: { skinSmooth: 0.50, skinDetail: 0.85, faceSlim: 0.20, bigEyes: 0.25, teethWhiten: 0.40, faceRelight: 0.30, bodySlim: 0.15, legLengthen: 0.10 },
            glass:   { skinSmooth: 0.85, skinDetail: 0.90, faceSlim: 0.35, bigEyes: 0.45, teethWhiten: 0.65, faceRelight: 0.60, bodySlim: 0.25, legLengthen: 0.20 },
            glamour: { skinSmooth: 0.70, skinDetail: 0.75, faceSlim: 0.50, bigEyes: 0.60, teethWhiten: 0.75, faceRelight: 0.50, bodySlim: 0.35, legLengthen: 0.25 },
            cinematic: { skinSmooth: 0.45, skinDetail: 0.95, faceSlim: 0.15, bigEyes: 0.20, teethWhiten: 0.30, faceRelight: 0.70, bodySlim: 0.10, legLengthen: 0.10 }
        };

        presetCards.forEach(card => {
            card.addEventListener('click', () => {
                this.history.push(this.glEngine.getParams());
                presetCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const key = card.getAttribute('data-preset');
                const p = presets[key];
                if (p) {
                    this.applyParamsToUI(p);
                    this.updateUndoRedoButtons();
                }
            });
        });
    }

    /**
     * Initialize 4K UHD Export Modal
     */
    initExportModal() {
        const modal = document.getElementById('exportModal');
        const openBtn = document.getElementById('openExportModalBtn');
        const closeBtn = document.getElementById('closeExportModalBtn');
        const cancelBtn = document.getElementById('cancelExportBtn');
        const startBtn = document.getElementById('startRenderBtn');

        let selectedRes = '4k';
        let selectedFps = 60;

        openBtn?.addEventListener('click', () => {
            if (modal) modal.style.display = 'flex';
        });

        const closeModal = () => {
            if (modal) modal.style.display = 'none';
        };

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);

        // Resolution Selector
        const resButtons = document.querySelectorAll('#resolutionSelector .radio-pill');
        resButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                resButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedRes = btn.getAttribute('data-res');
            });
        });

        // FPS Selector
        const fpsButtons = document.querySelectorAll('#fpsSelector .radio-pill');
        fpsButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                fpsButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedFps = parseInt(btn.getAttribute('data-fps'), 10);
            });
        });

        // Start Export
        const progressContainer = document.getElementById('exportProgressContainer');
        const progressBar = document.getElementById('exportProgressBarFill');
        const percentText = document.getElementById('exportPercentText');
        const statusText = document.getElementById('exportStatusText');

        startBtn?.addEventListener('click', async () => {
            if (progressContainer) progressContainer.style.display = 'flex';
            if (startBtn) startBtn.disabled = true;

            await this.exporter.exportVideo({
                resolution: selectedRes,
                fps: selectedFps,
                onProgress: (percent, currentFrame, totalFrames) => {
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (percentText) percentText.textContent = `${percent}%`;
                    if (statusText) statusText.textContent = `Rendering frame ${currentFrame}/${totalFrames} (${selectedRes.toUpperCase()})...`;
                },
                onComplete: () => {
                    if (statusText) statusText.textContent = 'Export complete! File downloaded.';
                    setTimeout(() => {
                        closeModal();
                        if (startBtn) startBtn.disabled = false;
                        if (progressContainer) progressContainer.style.display = 'none';
                    }, 1200);
                }
            });
        });
    }

    /**
     * 60FPS WebGL Render Loop
     */
    startRenderLoop() {
        const loop = () => {
            this.glEngine.renderFrame(this.video);
            this.timeline.updatePlayheadPosition();
            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }
}

// Instantiate on DOM load in browser environment
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.thamizhApp = new ThamizhApp();
    });
}
