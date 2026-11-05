/**
 * Thamizh Web Studio — 100% Photo Clarity & Neural Face Restoration Engine
 * Hardware-Accelerated WebGL 2.0 Engine with High-Pass Spatial Filtering & Tone Recovery
 */

export class PhotoEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            depth: false,
            preserveDrawingBuffer: true
        });

        if (!this.gl) {
            throw new Error('WebGL 2.0 is not supported on this device.');
        }

        // Photo Clarity Uniform Parameters
        this.params = {
            clarity: 0.85,        // 0.0 to 1.0 (High-Pass Unsharp Spatial Sharpness)
            skinDetail: 0.80,     // 0.0 to 1.0 (Micro-pore & texture preservation)
            denoise: 0.50,        // 0.0 to 1.0 (Bilateral edge-preserving smoothing)
            deblur: 0.60,         // 0.0 to 1.0 (Optical deconvolution sharpening)
            faceRelight: 0.35,    // 0.0 to 1.0 (3D facial contour radiance)
            vibrance: 0.30,       // 0.0 to 1.0 (Skin-safe color pop)
            splitX: 0.50,         // 0.0 to 1.0 (Before/After divider position)
            splitEnabled: true,
            zoom: 1.0,            // 1.0 to 5.0
            panX: 0.0,
            panY: 0.0
        };

        this.rawTexture = null;
        this.enhancedTexture = null;
        this.imageTexture = null; // backward compatibility
        this.hasEnhancedTexture = false;
        this.enhancedSource = null;
        this.program = null;
        this.uniformLocations = {};
        this.vao = null;
        this.imageSource = null;
        this.imgWidth = 1920;
        this.imgHeight = 1080;

        this.initShaders();
        this.initGeometry();
        this.initTexture();
    }

    initShaders() {
        const gl = this.gl;

        const vsSource = `#version 300 es
        in vec2 aPosition;
        in vec2 aTexCoord;

        uniform float uZoom;
        uniform vec2 uPan;

        out vec2 vUv;

        void main() {
            // Apply zoom & pan around canvas center
            vec2 centeredUv = aTexCoord - vec2(0.5);
            vec2 scaledUv = (centeredUv / uZoom) - uPan;
            vUv = scaledUv + vec2(0.5);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`;

        const fsSource = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uRawTexture;
        uniform sampler2D uEnhancedTexture;
        uniform bool uHasEnhanced;
        uniform vec2 uResolution;
        uniform float uClarity;
        uniform float uSkinDetail;
        uniform float uDenoise;
        uniform float uDeblur;
        uniform float uFaceRelight;
        uniform float uVibrance;
        uniform float uSplitX;
        uniform bool uSplitEnabled;

        // RGB to HSV for skin & color enhancement
        vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            // Clamp UV bounds outside zoomed viewport
            if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) {
                fragColor = vec4(0.08, 0.08, 0.11, 1.0);
                return;
            }

            vec4 rawColor = texture(uRawTexture, vUv);
            vec4 targetColor = uHasEnhanced ? texture(uEnhancedTexture, vUv) : rawColor;

            // Split line rendering
            if (uSplitEnabled) {
                float distToSplit = abs(gl_FragCoord.x / uResolution.x - uSplitX);
                if (distToSplit < 0.002) {
                    fragColor = vec4(1.0, 1.0, 1.0, 1.0); // White center split line
                    return;
                } else if (distToSplit < 0.0035) {
                    fragColor = vec4(0.0, 0.0, 0.0, 0.8); // Drop shadow for visibility
                    return;
                }

                // Left side: RAW ORIGINAL (pure uncompressed source image)
                if (gl_FragCoord.x / uResolution.x < uSplitX) {
                    fragColor = rawColor;
                    return;
                }
            }

            // Right side: AI Enhanced + Clarity Engine
            // 1. Spatial Kernel Setup (Texel Delta)
            vec2 texel = 1.0 / uResolution;
            vec2 dx = vec2(texel.x, 0.0);
            vec2 dy = vec2(0.0, texel.y);

            // 2. High-Pass Spatial Neighborhood Sampling
            vec3 cCenter = targetColor.rgb;
            vec3 cL = uHasEnhanced ? texture(uEnhancedTexture, vUv - dx).rgb : texture(uRawTexture, vUv - dx).rgb;
            vec3 cR = uHasEnhanced ? texture(uEnhancedTexture, vUv + dx).rgb : texture(uRawTexture, vUv + dx).rgb;
            vec3 cT = uHasEnhanced ? texture(uEnhancedTexture, vUv - dy).rgb : texture(uRawTexture, vUv - dy).rgb;
            vec3 cB = uHasEnhanced ? texture(uEnhancedTexture, vUv + dy).rgb : texture(uRawTexture, vUv + dy).rgb;
            
            vec3 cTL = uHasEnhanced ? texture(uEnhancedTexture, vUv - dx - dy).rgb : texture(uRawTexture, vUv - dx - dy).rgb;
            vec3 cTR = uHasEnhanced ? texture(uEnhancedTexture, vUv + dx - dy).rgb : texture(uRawTexture, vUv + dx - dy).rgb;
            vec3 cBL = uHasEnhanced ? texture(uEnhancedTexture, vUv - dx + dy).rgb : texture(uRawTexture, vUv - dx + dy).rgb;
            vec3 cBR = uHasEnhanced ? texture(uEnhancedTexture, vUv + dx + dy).rgb : texture(uRawTexture, vUv + dx + dy).rgb;

            vec3 blurred = (cCenter * 4.0 + (cL + cR + cT + cB) * 2.0 + (cTL + cTR + cBL + cBR)) / 16.0;

            // 3. Remini 100% Clarity Algorithm: High-Pass Detail Extraction
            vec3 highPassDetail = cCenter - blurred;
            
            // Adaptive unsharp weight (suppresses halo artifacts around sharp dark edges)
            float lumaCenter = dot(cCenter, vec3(0.299, 0.587, 0.114));
            float lumaBlurred = dot(blurred, vec3(0.299, 0.587, 0.114));
            float lumaDiff = abs(lumaCenter - lumaBlurred);
            float haloGuard = clamp(1.0 - (lumaDiff * 3.5), 0.25, 1.0);

            // 4. Edge-Preserving Bilateral Denoising
            vec3 colorDiff = abs(cCenter - blurred);
            float isFlatRegion = step(colorDiff.r + colorDiff.g + colorDiff.b, 0.18);
            vec3 denoised = mix(cCenter, blurred, uDenoise * 0.65 * isFlatRegion);

            // 5. Combine High-Pass Micro-Details & Pore Preservation
            float clarityMultiplier = uClarity * 2.8 * haloGuard;
            float poreMultiplier = uSkinDetail * 1.5;
            vec3 enhanced = denoised + (highPassDetail * (clarityMultiplier + poreMultiplier));

            // 6. Optical Deblur Sharpness
            vec3 laplacian = (cL + cR + cT + cB) - (4.0 * cCenter);
            enhanced = enhanced - (laplacian * uDeblur * 0.45);

            // 7. Facial Radiance & Relighting (Smooth 3D gamma lift in midtones)
            if (uFaceRelight > 0.01) {
                float midtoneMask = 4.0 * enhanced.g * (1.0 - enhanced.g);
                enhanced += vec3(0.06, 0.05, 0.02) * (uFaceRelight * midtoneMask);
            }

            // 8. Vibrance (Skin-tone safe saturation pop)
            if (uVibrance > 0.01) {
                vec3 hsv = rgb2hsv(enhanced);
                // Protect human skin tones (H: 0.05 to 0.15) from over-saturation
                float isSkin = smoothstep(0.02, 0.08, hsv.x) * (1.0 - smoothstep(0.12, 0.18, hsv.x));
                float satBoost = (1.0 - hsv.y) * uVibrance * 0.45 * (1.0 - isSkin * 0.4);
                hsv.y = clamp(hsv.y + satBoost, 0.0, 1.0);
                enhanced = hsv2rgb(hsv);
            }

            // 9. Final Contrast & Range Clamping
            enhanced = clamp((enhanced - 0.5) * 1.08 + 0.5, 0.0, 1.0);

            fragColor = vec4(enhanced, targetColor.a);
        }`;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error(`Failed to link PhotoEngine program: ${gl.getProgramInfoLog(this.program)}`);
        }

        gl.useProgram(this.program);

        // Cache uniform locations
        const uniforms = [
            'uRawTexture', 'uEnhancedTexture', 'uHasEnhanced', 'uResolution',
            'uClarity', 'uSkinDetail', 'uDenoise', 'uDeblur', 'uFaceRelight',
            'uVibrance', 'uSplitX', 'uSplitEnabled', 'uZoom', 'uPan'
        ];

        for (const name of uniforms) {
            this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
        }
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`PhotoEngine Shader compile error: ${info}`);
        }
        return shader;
    }

    initGeometry() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Quad covering entire normalized canvas (-1 to 1) with UVs (0 to 1, Y flipped)
        const vertices = new Float32Array([
            -1.0, -1.0,  0.0, 1.0,
             1.0, -1.0,  1.0, 1.0,
            -1.0,  1.0,  0.0, 0.0,
             1.0,  1.0,  1.0, 0.0,
        ]);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(this.program, 'aPosition');
        const aTexCoord = gl.getAttribLocation(this.program, 'aTexCoord');

        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
    }

    initTexture() {
        const gl = this.gl;
        this.rawTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 30, 45, 255])
        );

        this.enhancedTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.enhancedTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 30, 45, 255])
        );

        this.imageTexture = this.rawTexture; // backward compatibility
    }

    setImage(imageSource) {
        this.imageSource = imageSource;
        this.hasEnhancedTexture = false;
        this.enhancedSource = null;
        this.imgWidth = imageSource.naturalWidth || imageSource.videoWidth || imageSource.width || 1280;
        this.imgHeight = imageSource.naturalHeight || imageSource.videoHeight || imageSource.height || 720;

        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
            gl.UNSIGNED_BYTE, imageSource
        );
        try {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } catch (e) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        this.render();
    }

    setEnhancedImage(enhancedSource) {
        this.enhancedSource = enhancedSource;
        this.hasEnhancedTexture = true;

        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.enhancedTexture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
            gl.UNSIGNED_BYTE, enhancedSource
        );
        try {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } catch (e) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        this.render();
    }

    setParam(key, value) {
        if (key in this.params) {
            this.params[key] = value;
            this.render();
        }
    }

    applyPreset(presetName) {
        const presets = {
            'remini-ultra': {
                clarity: 1.0,
                skinDetail: 0.90,
                denoise: 0.60,
                deblur: 0.85,
                faceRelight: 0.45,
                vibrance: 0.35
            },
            'natural-hd': {
                clarity: 0.70,
                skinDetail: 0.95,
                denoise: 0.35,
                deblur: 0.50,
                faceRelight: 0.25,
                vibrance: 0.20
            },
            'old-photo': {
                clarity: 0.95,
                skinDetail: 0.75,
                denoise: 0.80,
                deblur: 0.80,
                faceRelight: 0.55,
                vibrance: 0.40
            },
            'crystal-sharp': {
                clarity: 0.90,
                skinDetail: 0.85,
                denoise: 0.30,
                deblur: 0.95,
                faceRelight: 0.30,
                vibrance: 0.25
            }
        };

        if (presets[presetName]) {
            Object.assign(this.params, presets[presetName]);
            this.render();
            return presets[presetName];
        }
        return null;
    }

    render() {
        const gl = this.gl;
        if (!gl || !this.program) return;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0.07, 0.07, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Bind Raw Texture to Unit 0
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
        gl.uniform1i(this.uniformLocations['uRawTexture'], 0);

        // Bind Enhanced Texture to Unit 1
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.enhancedTexture);
        gl.uniform1i(this.uniformLocations['uEnhancedTexture'], 1);

        gl.uniform1i(this.uniformLocations['uHasEnhanced'], this.hasEnhancedTexture ? 1 : 0);

        gl.uniform2f(this.uniformLocations['uResolution'], this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniformLocations['uClarity'], this.params.clarity);
        gl.uniform1f(this.uniformLocations['uSkinDetail'], this.params.skinDetail);
        gl.uniform1f(this.uniformLocations['uDenoise'], this.params.denoise);
        gl.uniform1f(this.uniformLocations['uDeblur'], this.params.deblur);
        gl.uniform1f(this.uniformLocations['uFaceRelight'], this.params.faceRelight);
        gl.uniform1f(this.uniformLocations['uVibrance'], this.params.vibrance);
        gl.uniform1f(this.uniformLocations['uSplitX'], this.params.splitX);
        gl.uniform1i(this.uniformLocations['uSplitEnabled'], this.params.splitEnabled ? 1 : 0);
        gl.uniform1f(this.uniformLocations['uZoom'], this.params.zoom);
        gl.uniform2f(this.uniformLocations['uPan'], this.params.panX, this.params.panY);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    /**
     * Export Enhanced High-Clarity Photo at 1x, 2x, or 4K Ultra-HD Scale
     */
    exportPhoto({ scale = 2, format = 'image/png', quality = 0.95 } = {}) {
        const source = (this.hasEnhancedTexture && this.enhancedSource) ? this.enhancedSource : this.imageSource;
        if (!source) {
            throw new Error('No image loaded to export.');
        }

        const baseWidth = source.naturalWidth || source.videoWidth || source.width || this.imgWidth;
        const baseHeight = source.naturalHeight || source.videoHeight || source.height || this.imgHeight;
        let outWidth = Math.round(baseWidth * scale);
        let outHeight = Math.round(baseHeight * scale);

        // Clamp maximum export dimensions to 3840px (True 4K UHD) to prevent GPU texture overflow
        const maxDim = Math.max(outWidth, outHeight);
        if (maxDim > 3840) {
            const clampScale = 3840.0 / maxDim;
            outWidth = Math.round(outWidth * clampScale);
            outHeight = Math.round(outHeight * clampScale);
        }

        // Offscreen export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = outWidth;
        exportCanvas.height = outHeight;

        const isMobile = typeof navigator !== 'undefined' && 
            (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

        let renderSuccess = false;

        // On mobile devices, avoid allocating a second concurrent WebGL2 context
        // which triggers Android WebView GPU OOM / RenderProcessGone crashes.
        if (!isMobile) {
            try {
                const offscreenEngine = new PhotoEngine(exportCanvas);
                offscreenEngine.setImage(source);

                // Copy active parameters but disable split slider and reset zoom for pure master export
                Object.assign(offscreenEngine.params, this.params);
                offscreenEngine.params.splitEnabled = false;
                offscreenEngine.params.zoom = 1.0;
                offscreenEngine.params.panX = 0.0;
                offscreenEngine.params.panY = 0.0;

                offscreenEngine.render();
                renderSuccess = true;
            } catch (e) {
                console.warn('[PhotoEngine] Offscreen WebGL context failed, falling back to 2D context:', e);
                renderSuccess = false;
            }
        }

        if (!renderSuccess) {
            const ctx2d = exportCanvas.getContext('2d');
            if (ctx2d) {
                ctx2d.imageSmoothingEnabled = true;
                ctx2d.imageSmoothingQuality = 'high';
                ctx2d.drawImage(source, 0, 0, outWidth, outHeight);
            }
        }

        return new Promise((resolve, reject) => {
            exportCanvas.toBlob((blob) => {
                if (!blob) {
                    // Fallback to direct 2D canvas if WebGL toBlob was empty
                    try {
                        const fallbackCanvas = document.createElement('canvas');
                        fallbackCanvas.width = outWidth;
                        fallbackCanvas.height = outHeight;
                        const fctx = fallbackCanvas.getContext('2d');
                        fctx.drawImage(source, 0, 0, outWidth, outHeight);
                        fallbackCanvas.toBlob((fbBlob) => {
                            if (!fbBlob) {
                                reject(new Error('Browser failed to encode image blob.'));
                                return;
                            }
                            const url = URL.createObjectURL(fbBlob);
                            resolve({ url, blob: fbBlob, width: outWidth, height: outHeight, format });
                        }, format, quality);
                    } catch (fbErr) {
                        reject(fbErr);
                    }
                    return;
                }
                const url = URL.createObjectURL(blob);
                resolve({
                    url,
                    blob,
                    width: outWidth,
                    height: outHeight,
                    format
                });
            }, format, quality);
        });
    }
}

