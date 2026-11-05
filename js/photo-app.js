/**
 * Thamizh Web Studio — Photo Enhancement UI Controller
 * Manages photo uploading, split-screen comparison slider, zoom/pan, clarity presets, and 4K master export.
 */

import { PhotoEngine } from './photo-engine.js';
import { navigateTo, getApiBaseUrl } from './app.js';
import { photoSessionStore } from './photo-session-store.js';
import { triggerUniversalDownload } from './downloader.js';

export class PhotoApp {
    constructor() {
        this.canvas = document.getElementById('photoCanvas');
        if (!this.canvas) return;

        this.engine = new PhotoEngine(this.canvas);
        this.isDraggingSplit = false;
        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.currentFilename = 'Thamizh_Clarity_Portrait.jpg';
        this.rawFile = null;
        this.rawImage = null;
        this.enhancedImage = null;
        this.enhancedBlob = null;
        this.isDeepEnhanced = false;

        this.initDOM();
        this.initEvents();
        this.restoreOrInitSession();
    }

    initDOM() {
        this.canvasWrapper = document.getElementById('photoCanvasWrapper');
        this.splitHandle = document.getElementById('photoSplitHandle');
        this.splitLine = document.getElementById('photoSplitLine');
        this.photoUploadInput = document.getElementById('photoFileInput');
        this.loadSampleBtn = document.getElementById('photoLoadSampleBtn');
        this.backBtn = document.getElementById('backToHubFromPhotoBtn');
        this.deepAiBtn = document.getElementById('photoDeepAiBtn');
        this.aiOverlay = document.getElementById('photoAiOverlay');
        this.faceZoomBtn = document.getElementById('photoFaceZoomBtn');

        // Sliders
        this.sliders = {
            clarity: document.getElementById('photoClaritySlider'),
            skinDetail: document.getElementById('photoSkinDetailSlider'),
            denoise: document.getElementById('photoDenoiseSlider'),
            deblur: document.getElementById('photoDeblurSlider'),
            faceRelight: document.getElementById('photoRelightSlider'),
            vibrance: document.getElementById('photoVibranceSlider'),
        };

        // Value text displays
        this.valDisplays = {
            clarity: document.getElementById('valPhotoClarity'),
            skinDetail: document.getElementById('valPhotoSkinDetail'),
            denoise: document.getElementById('valPhotoDenoise'),
            deblur: document.getElementById('valPhotoDeblur'),
            faceRelight: document.getElementById('valPhotoRelight'),
            vibrance: document.getElementById('valPhotoVibrance'),
        };

        // Export Elements
        this.exportModal = document.getElementById('photoExportModal');
        this.openExportBtn = document.getElementById('openPhotoExportModalBtn');
        this.closeExportBtn = document.getElementById('closePhotoExportModalBtn');
        this.startExportBtn = document.getElementById('startPhotoRenderBtn');
        this.resolutionInfoBadge = document.getElementById('photoResolutionBadge');
    }

    initEvents() {
        // 1. Navigation
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => navigateTo('hub'));
        }

        // 2. File Upload
        if (this.photoUploadInput) {
            this.photoUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.loadFile(file);
            });
        }

        if (this.loadSampleBtn) {
            this.loadSampleBtn.addEventListener('click', () => this.loadSamplePortrait());
        }

        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => navigateTo('hub'));
        }

        if (this.deepAiBtn) {
            this.deepAiBtn.addEventListener('click', () => this.triggerDeepAiEnhance());
        }

        // 3. Slider Binding
        for (const [key, slider] of Object.entries(this.sliders)) {
            if (!slider) continue;
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.engine.setParam(key, val);
                if (this.valDisplays[key]) {
                    this.valDisplays[key].textContent = `${Math.round(val * 100)}%`;
                }
            });
        }

        // 4. Preset Buttons
        document.querySelectorAll('[data-photo-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-photo-preset]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const preset = btn.getAttribute('data-photo-preset');
                const newParams = this.engine.applyPreset(preset);
                if (newParams) this.syncUIWithParams(newParams);
            });
        });

        // 5. Split-Screen Slider Dragging
        const stage = document.getElementById('photoStage');
        if (stage) {
            const updateSplitFromEvent = (clientX) => {
                const targetEl = this.canvasWrapper || stage;
                const rect = targetEl.getBoundingClientRect();
                let ratio = (clientX - rect.left) / rect.width;
                ratio = Math.max(0.02, Math.min(0.98, ratio));
                this.engine.setParam('splitX', ratio);
                this.updateSplitDividerUI(ratio);
            };

            stage.addEventListener('mousedown', (e) => {
                if (e.target.closest('#photoSplitHandle') || e.target.closest('#photoSplitLine')) {
                    this.isDraggingSplit = true;
                    e.preventDefault();
                } else if (e.button === 0 && this.engine.params.zoom > 1.05) {
                    this.isPanning = true;
                    this.lastMousePos = { x: e.clientX, y: e.clientY };
                }
            });

            window.addEventListener('mousemove', (e) => {
                if (this.isDraggingSplit) {
                    updateSplitFromEvent(e.clientX);
                } else if (this.isPanning) {
                    const dx = (e.clientX - this.lastMousePos.x) / stage.clientWidth;
                    const dy = (e.clientY - this.lastMousePos.y) / stage.clientHeight;
                    this.engine.params.panX = Math.max(-0.5, Math.min(0.5, this.engine.params.panX + dx));
                    this.engine.params.panY = Math.max(-0.5, Math.min(0.5, this.engine.params.panY - dy));
                    this.lastMousePos = { x: e.clientX, y: e.clientY };
                    this.engine.render();
                }
            });

            window.addEventListener('mouseup', () => {
                this.isDraggingSplit = false;
                this.isPanning = false;
            });

            // Touch support for Mobile / Android APK
            stage.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    if (e.target.closest('#photoSplitHandle') || e.target.closest('#photoSplitLine')) {
                        this.isDraggingSplit = true;
                    } else if (this.engine.params.zoom > 1.05) {
                        this.isPanning = true;
                    }
                    this.lastMousePos = { x: touch.clientX, y: touch.clientY };
                }
            }, { passive: true });

            stage.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    if (this.isDraggingSplit) {
                        updateSplitFromEvent(touch.clientX);
                    } else if (this.isPanning) {
                        const dx = (touch.clientX - this.lastMousePos.x) / stage.clientWidth;
                        const dy = (touch.clientY - this.lastMousePos.y) / stage.clientHeight;
                        this.engine.params.panX = Math.max(-0.5, Math.min(0.5, this.engine.params.panX + dx));
                        this.engine.params.panY = Math.max(-0.5, Math.min(0.5, this.engine.params.panY - dy));
                        this.lastMousePos = { x: touch.clientX, y: touch.clientY };
                        this.engine.render();
                    }
                }
            }, { passive: true });

            stage.addEventListener('touchend', () => {
                this.isDraggingSplit = false;
                this.isPanning = false;
            });
        }

        // 6. Hold to see Raw
        const holdRawBtn = document.getElementById('photoHoldRawBtn');
        if (holdRawBtn) {
            const startRaw = () => {
                this.engine.setParam('splitEnabled', false);
                this.engine.setParam('splitX', 1.0); // Full raw
            };
            const stopRaw = () => {
                this.engine.setParam('splitEnabled', true);
                this.engine.setParam('splitX', 0.5);
                this.updateSplitDividerUI(0.5);
            };

            holdRawBtn.addEventListener('mousedown', startRaw);
            holdRawBtn.addEventListener('mouseup', stopRaw);
            holdRawBtn.addEventListener('mouseleave', stopRaw);
            holdRawBtn.addEventListener('touchstart', startRaw, { passive: true });
            holdRawBtn.addEventListener('touchend', stopRaw);
        }

        // 6B. Face Close-Up 2x Zoom Button
        if (this.faceZoomBtn) {
            this.faceZoomBtn.addEventListener('click', () => {
                if (this.engine.params.zoom > 1.2) {
                    this.engine.params.zoom = 1.0;
                    this.engine.params.panX = 0.0;
                    this.engine.params.panY = 0.0;
                } else {
                    this.focusFaces();
                }
                this.engine.render();
                this.updateZoomDisplay();
            });
        }

        // 7. Zoom Controls
        const zoomInBtn = document.getElementById('photoZoomInBtn');
        const zoomOutBtn = document.getElementById('photoZoomOutBtn');
        const zoomResetBtn = document.getElementById('photoZoomResetBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.engine.params.zoom = Math.min(4.0, this.engine.params.zoom + 0.5);
                this.engine.render();
                this.updateZoomDisplay();
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.engine.params.zoom = Math.max(1.0, this.engine.params.zoom - 0.5);
                if (this.engine.params.zoom === 1.0) {
                    this.engine.params.panX = 0;
                    this.engine.params.panY = 0;
                }
                this.engine.render();
                this.updateZoomDisplay();
            });
        }
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => {
                this.engine.params.zoom = 1.0;
                this.engine.params.panX = 0;
                this.engine.params.panY = 0;
                this.engine.render();
                this.updateZoomDisplay();
            });
        }

        // 8. Export Modal Handling
        if (this.openExportBtn && this.exportModal) {
            this.openExportBtn.addEventListener('click', () => {
                this.exportModal.style.display = 'flex';
            });
        }
        if (this.closeExportBtn && this.exportModal) {
            this.closeExportBtn.addEventListener('click', () => {
                this.exportModal.style.display = 'none';
            });
        }

        // Export Scale & Format selection
        document.querySelectorAll('#photoExportScaleGroup .radio-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#photoExportScaleGroup .radio-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.querySelectorAll('#photoExportFormatGroup .radio-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#photoExportFormatGroup .radio-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        if (this.startExportBtn) {
            this.startExportBtn.addEventListener('click', async () => {
                await this.executePhotoExport();
            });
        }

        // Resize Canvas Observer
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    updateSplitDividerUI(ratio) {
        if (this.splitLine) {
            this.splitLine.style.left = `${ratio * 100}%`;
        }
        if (this.splitHandle) {
            this.splitHandle.style.left = `${ratio * 100}%`;
        }
    }

    updateZoomDisplay() {
        const text = document.getElementById('photoZoomLevelText');
        if (text) {
            text.textContent = `${Math.round(this.engine.params.zoom * 100)}%`;
        }
    }

    syncUIWithParams(params) {
        for (const [key, val] of Object.entries(params)) {
            if (this.sliders[key]) {
                this.sliders[key].value = val;
            }
            if (this.valDisplays[key]) {
                this.valDisplays[key].textContent = `${Math.round(val * 100)}%`;
            }
        }
    }

    async restoreOrInitSession() {
        try {
            const session = await photoSessionStore.loadSession();
            if (session && session.rawBlob) {
                this.currentFilename = session.filename || 'Thamizh_Clarity_Portrait.jpg';
                this.rawFile = session.rawBlob;
                if (session.params) {
                    Object.assign(this.engine.params, session.params);
                    this.syncUIWithParams(session.params);
                }

                // Load Raw Image
                const rawUrl = URL.createObjectURL(session.rawBlob);
                const rawImg = new Image();
                await new Promise((resolve) => {
                    rawImg.onload = resolve;
                    rawImg.onerror = resolve;
                    rawImg.src = rawUrl;
                });
                this.rawImage = rawImg;
                this.engine.setImage(rawImg);
                this.updateResolutionBadge(rawImg.width, rawImg.height);

                // Load Enhanced Image if it was saved
                if (session.isDeepEnhanced && session.enhancedBlob) {
                    this.enhancedBlob = session.enhancedBlob;
                    this.isDeepEnhanced = true;
                    const enhUrl = URL.createObjectURL(session.enhancedBlob);
                    const enhImg = new Image();
                    await new Promise((resolve) => {
                        enhImg.onload = resolve;
                        enhImg.onerror = resolve;
                        enhImg.src = enhUrl;
                    });
                    this.enhancedImage = enhImg;
                    this.engine.setEnhancedImage(enhImg);
                    this.updateResolutionBadge(enhImg.width, enhImg.height, true);
                    if (this.deepAiBtn) {
                        this.deepAiBtn.innerHTML = '<span class="icon">✓</span> <span class="btn-text">4K Master Active</span>';
                    }
                }
                this.resizeCanvas();
                return;
            }
        } catch (e) {
            console.warn('[PhotoApp] Session restore error, loading demo:', e);
        }
        this.loadSamplePortrait();
    }

    loadFile(file) {
        this.rawFile = file;
        this.currentFilename = file.name;
        this.isDeepEnhanced = false;
        this.enhancedImage = null;
        this.enhancedBlob = null;
        if (this.deepAiBtn) {
            this.deepAiBtn.innerHTML = '<span class="icon">⚡</span> <span class="btn-text">Deep AI 4K Enhance</span>';
        }

        // Save raw file to session store
        photoSessionStore.saveSession({
            rawBlob: file,
            enhancedBlob: null,
            filename: file.name,
            isDeepEnhanced: false,
            params: this.engine.params
        });

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.rawImage = img;
                this.engine.setImage(img);
                this.updateResolutionBadge(img.width, img.height);
                this.resizeCanvas();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    loadSamplePortrait() {
        // High-definition synthetic face portrait generator
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 1600;
        sampleCanvas.height = 2000;
        const ctx = sampleCanvas.getContext('2d');

        // Background studio glow
        const bgGrad = ctx.createRadialGradient(800, 1000, 100, 800, 1000, 1100);
        bgGrad.addColorStop(0, '#2d2745');
        bgGrad.addColorStop(1, '#0e0b1a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1600, 2000);

        // Shoulders & Body
        ctx.fillStyle = '#1c192c';
        ctx.beginPath();
        ctx.ellipse(800, 1850, 600, 450, 0, 0, Math.PI * 2);
        ctx.fill();

        // Neck
        ctx.fillStyle = '#b7876a';
        ctx.fillRect(720, 1100, 160, 300);

        // Face Oval
        ctx.fillStyle = '#c59477';
        ctx.beginPath();
        ctx.ellipse(800, 950, 320, 420, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cheeks highlight
        ctx.fillStyle = 'rgba(235, 170, 140, 0.35)';
        ctx.beginPath();
        ctx.ellipse(660, 980, 110, 80, 0, 0, Math.PI * 2);
        ctx.ellipse(940, 980, 110, 80, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#181210';
        ctx.beginPath();
        ctx.ellipse(800, 720, 360, 260, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(680, 890, 48, 26, 0, 0, Math.PI * 2);
        ctx.ellipse(920, 890, 48, 26, 0, 0, Math.PI * 2);
        ctx.fill();

        // Irises
        ctx.fillStyle = '#3a2012';
        ctx.beginPath();
        ctx.arc(680, 890, 20, 0, Math.PI * 2);
        ctx.arc(920, 890, 20, 0, Math.PI * 2);
        ctx.fill();

        // Pupils & Glint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(674, 884, 6, 0, Math.PI * 2);
        ctx.arc(914, 884, 6, 0, Math.PI * 2);
        ctx.fill();

        // Eyebrows
        ctx.strokeStyle = '#251a13';
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(680, 850, 70, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(920, 850, 70, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();

        // Nose
        ctx.strokeStyle = '#9c6a50';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(800, 880);
        ctx.lineTo(795, 1020);
        ctx.lineTo(825, 1030);
        ctx.stroke();

        // Lips
        ctx.fillStyle = '#ab5353';
        ctx.beginPath();
        ctx.ellipse(800, 1140, 85, 36, 0, 0, Math.PI * 2);
        ctx.fill();

        // Micro-Skin Texture Simulation (Random noise)
        const imgData = ctx.getImageData(500, 650, 600, 600);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 16;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
        }
        ctx.putImageData(imgData, 500, 650);

        this.isDeepEnhanced = false;
        this.enhancedImage = null;
        this.enhancedBlob = null;
        this.rawFile = null;
        photoSessionStore.clearSession();
        if (this.deepAiBtn) {
            this.deepAiBtn.innerHTML = '<span class="icon">⚡</span> <span class="btn-text">Deep AI 4K Enhance</span>';
        }
        this.engine.setImage(sampleCanvas);
        this.updateResolutionBadge(1600, 2000);
        this.resizeCanvas();
    }

    async triggerDeepAiEnhance() {
        if (!this.engine.imageSource) {
            alert('Please load or import a photo first.');
            return;
        }

        if (this.aiOverlay) this.aiOverlay.style.display = 'flex';
        if (this.deepAiBtn) {
            this.deepAiBtn.disabled = true;
            this.deepAiBtn.innerHTML = '<span>⏳ Synthesizing 4K Neural...</span>';
        }

        try {
            // Get source image as a Blob
            let blob = this.rawFile;
            if (!blob) {
                // If loaded via demo or canvas, extract blob from imageSource
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.engine.imgWidth;
                tempCanvas.height = this.engine.imgHeight;
                const ctx = tempCanvas.getContext('2d');
                ctx.drawImage(this.engine.imageSource, 0, 0);
                blob = await new Promise(r => tempCanvas.toBlob(r, 'image/png'));
            }

            const formData = new FormData();
            formData.append('file', blob, this.currentFilename || 'photo.png');
            formData.append('params', JSON.stringify(this.engine.params));

            const apiBase = getApiBaseUrl();
            const res = await fetch(`${apiBase}/api/photo/enhance`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                throw new Error(`AI enhancement error: ${res.status} ${res.statusText}`);
            }

            const enhancedBlob = await res.blob();
            const enhancedUrl = URL.createObjectURL(enhancedBlob);
            const enhancedImg = new Image();

            await new Promise((resolve, reject) => {
                enhancedImg.onload = resolve;
                enhancedImg.onerror = reject;
                enhancedImg.src = enhancedUrl;
            });

            this.enhancedImage = enhancedImg;
            this.enhancedBlob = enhancedBlob;
            this.isDeepEnhanced = true;

            // Load new 4K enhanced image into WebGL engine as enhanced layer
            this.engine.setEnhancedImage(enhancedImg);
            this.updateResolutionBadge(enhancedImg.width, enhancedImg.height, true);
            this.resizeCanvas();

            // Auto-focus 2x on faces so user immediately sees crisp eyelashes, irises, and skin pores
            this.focusFaces();

            // Persist full enhanced session in IndexedDB
            photoSessionStore.saveSession({
                rawBlob: this.rawFile,
                enhancedBlob: enhancedBlob,
                filename: this.currentFilename,
                isDeepEnhanced: true,
                params: this.engine.params
            });

            if (this.deepAiBtn) {
                this.deepAiBtn.innerHTML = '<span class="icon">✓</span> <span class="btn-text">4K Master Active</span>';
            }
        } catch (err) {
            console.error('Deep AI enhance failed:', err);
            alert('Deep AI enhance failed: ' + err.message + '\nMake sure Python backend is running.');
            if (this.deepAiBtn) {
                this.deepAiBtn.innerHTML = '<span class="icon">⚡</span> <span class="btn-text">Deep AI 4K Enhance</span>';
            }
        } finally {
            if (this.aiOverlay) this.aiOverlay.style.display = 'none';
            if (this.deepAiBtn) this.deepAiBtn.disabled = false;
        }
    }

    focusFaces() {
        this.engine.params.zoom = 2.0;
        this.engine.params.panX = 0.0;
        this.engine.params.panY = 0.18; // Focus up towards portrait faces
        this.engine.params.splitX = 0.5;
        this.updateSplitDividerUI(0.5);
        this.engine.render();
        this.updateZoomDisplay();
    }

    updateResolutionBadge(w, h, isAi4k = false) {
        if (this.resolutionInfoBadge) {
            this.resolutionInfoBadge.textContent = isAi4k 
                ? `${w}×${h} • TRUE 4K UHD` 
                : `${w}×${h} • 100% CLARITY`;
        }
    }

    resizeCanvas() {
        const stage = document.getElementById('photoStage');
        const wrapper = this.canvasWrapper || document.getElementById('photoCanvasWrapper');
        if (!stage || !this.canvas) return;

        const stageRect = stage.getBoundingClientRect();
        if (stageRect.width <= 0 || stageRect.height <= 0) return;

        const imgW = this.engine.imgWidth || 1600;
        const imgH = this.engine.imgHeight || 2000;
        const imgAspect = imgW / imgH;

        // Provide 16px safety padding inside stage
        const availW = Math.max(100, stageRect.width - 24);
        const availH = Math.max(100, stageRect.height - 24);
        const stageAspect = availW / availH;

        let displayW, displayH;
        if (stageAspect > imgAspect) {
            // Limited by height
            displayH = availH;
            displayW = availH * imgAspect;
        } else {
            // Limited by width
            displayW = availW;
            displayH = availW / imgAspect;
        }

        displayW = Math.round(displayW);
        displayH = Math.round(displayH);

        if (wrapper) {
            wrapper.style.width = `${displayW}px`;
            wrapper.style.height = `${displayH}px`;
        }

        this.canvas.width = Math.round(displayW * window.devicePixelRatio);
        this.canvas.height = Math.round(displayH * window.devicePixelRatio);
        this.engine.render();
    }

    async executePhotoExport() {
        const scaleBtn = document.querySelector('#photoExportScaleGroup .radio-pill.active');
        const formatBtn = document.querySelector('#photoExportFormatGroup .radio-pill.active');
        
        const scaleRaw = scaleBtn ? scaleBtn.dataset.scale : '4k';
        let scale = 1.0;

        if (scaleRaw === '4k') {
            if (this.isDeepEnhanced && this.enhancedImage) {
                // Image is already 4K Master (longest edge >= 3840px)
                scale = 1.0;
            } else {
                const longest = Math.max(this.engine.imgWidth, this.engine.imgHeight);
                scale = Math.max(3840.0 / longest, 2.0);
            }
        } else if (scaleRaw === '2x') {
            scale = (this.isDeepEnhanced && this.enhancedImage) ? 1.0 : 2.0;
        } else {
            scale = parseFloat(scaleRaw) || 1.0;
        }

        const format = formatBtn ? formatBtn.dataset.format : 'image/png';
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';

        if (this.startExportBtn) {
            this.startExportBtn.disabled = true;
            this.startExportBtn.innerHTML = '<span>⏳ Rendering 4K Master...</span>';
        }

        try {
            let finalBlob = null;
            let outW = 0;
            let outH = 0;

            // Direct Master Download:
            // If already deep enhanced to 4K and scale is 4k/1x and PNG format is selected,
            // directly download the backend's lossless 4K master blob!
            if (this.isDeepEnhanced && this.enhancedBlob && (scaleRaw === '4k' || scale === 1.0) && format === 'image/png') {
                finalBlob = this.enhancedBlob;
                outW = this.enhancedImage.width;
                outH = this.enhancedImage.height;
            } else {
                const result = await this.engine.exportPhoto({ scale, format });
                finalBlob = result.blob;
                outW = result.width;
                outH = result.height;
            }
            
            const baseName = this.currentFilename.replace(/\.[^/.]+$/, '');
            const filename = `Thamizh_4K_Clarity_${baseName}_${outW}x${outH}.${ext}`;

            // Trigger universal download (supports Android Web Share / direct anchor / data URL fallback)
            await triggerUniversalDownload(finalBlob, filename, format);

            if (this.exportModal) {
                this.exportModal.style.display = 'none';
            }
        } catch (err) {
            console.error('Photo export failed:', err);
            alert('Photo export failed: ' + err.message);
        } finally {
            if (this.startExportBtn) {
                this.startExportBtn.disabled = false;
                this.startExportBtn.innerHTML = '<span class="icon">🚀</span> Start Rendering & Download';
            }
        }
    }
}

