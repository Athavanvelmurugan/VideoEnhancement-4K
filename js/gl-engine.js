/**
 * Thamizh Web Studio — Real-Time WebGL 2.0 Video Engine
 * Hardware-Accelerated Video Retouching, Face Sculpting, and 4K Enhancement
 */

export class GlEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            depth: false,
            preserveDrawingBuffer: true
        });

        if (!this.gl) {
            throw new Error('WebGL 2.0 is not supported on this browser/GPU.');
        }

        // Processing State Uniforms
        this.params = {
            // Retouch Suite
            skinSmooth: 0.65,      // 0.0 to 1.0
            skinDetail: 0.80,      // 0.0 to 1.0 (Pore preservation)
            faceSlim: 0.35,        // 0.0 to 1.0 (Jawline V-line warp)
            bigEyes: 0.40,         // 0.0 to 1.0 (Eye enlargement)
            teethWhiten: 0.55,     // 0.0 to 1.0
            faceRelight: 0.45,     // 0.0 to 1.0 (3D facial contour lighting)
            
            // AI 4K Repair Suite
            superRes: 0.75,        // 0.0 to 1.0 (AI Ultra HD sharpness)
            denoise: 0.60,         // 0.0 to 1.0
            deblur: 0.50,          // 0.0 to 1.0
            lowLight: 0.40,        // 0.0 to 1.0 (Night gamma lift)

            // Body Tune
            bodySlim: 0.30,        // 0.0 to 1.0 (Waist pinch)
            legLengthen: 0.20,     // 0.0 to 1.0 (Leg stretch)

            // LUT & Color Grading
            lutType: 0,            // 0: None, 1: Golden Flaze, 2: Teal/Orange, 3: Emerald, 4: Cyber, 5: Glam
            lutIntensity: 0.85,    // 0.0 to 1.0

            // Viewport & Comparison
            splitX: 0.50,          // 0.0 to 1.0 screen X position
            splitEnabled: true,
            holdRaw: false
        };

        this.videoTexture = null;
        this.program = null;
        this.uniformLocations = {};
        this.vao = null;

        this.initShaders();
        this.initGeometry();
        this.initTexture();
    }

    /**
     * Compile Vertex & Fragment Shaders
     */
    initShaders() {
        const gl = this.gl;

        const vertexShaderSource = `#version 300 es
        in vec2 aPosition;
        in vec2 aTexCoord;
        out vec2 vTexCoord;

        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
            vTexCoord = aTexCoord;
        }
        `;

        const fragmentShaderSource = `#version 300 es
        precision highp float;

        in vec2 vTexCoord;
        out vec4 fragColor;

        uniform sampler2D uTexture;
        uniform vec2 uResolution;

        // Viewport comparison
        uniform float uSplitX;
        uniform bool uSplitEnabled;
        uniform bool uHoldRaw;

        // AI Retouch
        uniform float uSkinSmooth;
        uniform float uSkinDetail;
        uniform float uFaceSlim;
        uniform float uBigEyes;
        uniform float uTeethWhiten;
        uniform float uFaceRelight;

        // AI 4K Repair
        uniform float uSuperRes;
        uniform float uDenoise;
        uniform float uDeblur;
        uniform float uLowLight;

        // Body Tune
        uniform float uBodySlim;
        uniform float uLegLengthen;

        // Color LUT
        uniform int uLutType;
        uniform float uLutIntensity;

        // Converts RGB to HSV for skin and dental tone isolation
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

        // Radial Coordinate Warping for Face Slimming (Jawline) and Big Eyes
        vec2 applyFaceWarp(vec2 uv) {
            if (uFaceSlim <= 0.01 && uBigEyes <= 0.01) return uv;

            vec2 warped = uv;
            vec2 center = vec2(0.5, 0.52); // Estimated face center

            // 1. Jawline V-Line Slimming (Warp lower jaw inward)
            if (uFaceSlim > 0.01 && uv.y > 0.50 && uv.y < 0.85) {
                float distY = (uv.y - 0.50) / 0.35;
                float pinch = sin(distY * 3.14159) * (uFaceSlim * 0.045);
                float dirX = uv.x - center.x;
                warped.x -= dirX * pinch;
            }

            // 2. Eye Enlargement (Warp eyes outward)
            if (uBigEyes > 0.01) {
                vec2 leftEye = vec2(0.42, 0.44);
                vec2 rightEye = vec2(0.58, 0.44);
                
                float dLeft = distance(uv, leftEye);
                if (dLeft < 0.12) {
                    float factor = (1.0 - dLeft / 0.12) * (uBigEyes * 0.035);
                    warped -= (uv - leftEye) * factor;
                }

                float dRight = distance(uv, rightEye);
                if (dRight < 0.12) {
                    float factor = (1.0 - dRight / 0.12) * (uBigEyes * 0.035);
                    warped -= (uv - rightEye) * factor;
                }
            }

            // 3. Body & Waist Slimming (Gentle horizontal pinch at lower torso)
            if (uBodySlim > 0.01 && uv.y > 0.65 && uv.y < 0.95) {
                float waistDist = (uv.y - 0.65) / 0.30;
                float pinch = sin(waistDist * 3.14159) * (uBodySlim * 0.06);
                warped.x -= (uv.x - center.x) * pinch;
            }

            // 4. Leg Lengthening (Vertical stretch at bottom)
            if (uLegLengthen > 0.01 && uv.y > 0.70) {
                float stretch = (uv.y - 0.70) / 0.30;
                warped.y -= stretch * (uLegLengthen * 0.05);
            }

            return warped;
        }

        // Apply 3D LUT Color Transform Simulation
        vec3 applyColorLUT(vec3 col, int lut, float intensity) {
            if (lut == 0 || intensity <= 0.01) return col;

            vec3 graded = col;

            // 1. Golden Flaze (Warm yellow golden cinematic punch)
            if (lut == 1) {
                graded.r = pow(col.r, 0.92) * 1.08;
                graded.g = pow(col.g, 0.96) * 1.02;
                graded.b = pow(col.b, 1.15) * 0.88;
                graded += vec3(0.04, 0.02, -0.02);
            }
            // 2. Teal & Orange
            else if (lut == 2) {
                float lum = dot(col, vec3(0.299, 0.587, 0.114));
                vec3 shadowTeal = vec3(0.0, 0.18, 0.22);
                vec3 highlightOrange = vec3(0.22, 0.12, 0.0);
                graded = mix(col + shadowTeal, col + highlightOrange, lum);
                graded = clamp(graded, 0.0, 1.0);
            }
            // 3. Emerald Film (Lush green/emerald aesthetic)
            else if (lut == 3) {
                graded.r = col.r * 0.92;
                graded.g = pow(col.g, 0.93) * 1.10;
                graded.b = col.b * 1.02;
            }
            // 4. Cyberpunk Neon
            else if (lut == 4) {
                graded.r = pow(col.r, 0.85) * 1.15;
                graded.g = col.g * 0.85;
                graded.b = pow(col.b, 0.90) * 1.25;
            }
            // 5. Soft Glamour (Pastel high-key portrait)
            else if (lut == 5) {
                graded = pow(col, vec3(0.88)) * 1.05;
                graded.r += 0.03;
                graded.b += 0.02;
            }

            return mix(col, clamp(graded, 0.0, 1.0), intensity);
        }

        void main() {
            vec2 rawUv = vTexCoord;

            // Split screen check: If left of split line, render raw un-retouched video
            bool isRawSide = uHoldRaw || (uSplitEnabled && rawUv.x < uSplitX);

            if (isRawSide) {
                fragColor = texture(uTexture, rawUv);
                return;
            }

            // Apply geometric face deformation
            vec2 uv = applyFaceWarp(rawUv);
            vec4 baseColor = texture(uTexture, uv);

            // 1. Bilateral Edge-Preserving Skin Smoothing
            vec2 step = (1.0 / uResolution) * (1.0 + uSkinSmooth * 1.5);
            vec3 blurAccum = vec3(0.0);
            float totalWeight = 0.0;

            for (int x = -2; x <= 2; x++) {
                for (int y = -2; y <= 2; y++) {
                    vec2 offset = vec2(float(x), float(y)) * step;
                    vec3 sampleColor = texture(uTexture, uv + offset).rgb;
                    
                    float spatialDist = dot(offset, offset);
                    float spatialWeight = exp(-spatialDist * 200.0);
                    
                    float colorDist = distance(sampleColor, baseColor.rgb);
                    float colorWeight = exp(-colorDist * 14.0);
                    
                    float weight = spatialWeight * colorWeight;
                    blurAccum += sampleColor * weight;
                    totalWeight += weight;
                }
            }
            vec3 smoothedColor = blurAccum / max(totalWeight, 0.0001);

            // Skin Tone Masking (Only apply smoothing to skin hues)
            vec3 hsv = rgb2hsv(baseColor.rgb);
            // Skin hue is typically between 0.02 and 0.12 (warm orange/red)
            float skinMask = smoothstep(0.01, 0.04, hsv.x) * (1.0 - smoothstep(0.12, 0.16, hsv.x));
            skinMask *= smoothstep(0.15, 0.40, hsv.y); // Saturation check

            // Frequency separation: Keep high frequency pores/detail, smooth blemishes
            vec3 highPass = baseColor.rgb - smoothedColor;
            vec3 finalSkin = mix(baseColor.rgb, smoothedColor + highPass * (uSkinDetail * 1.1), uSkinSmooth * skinMask);

            // 2. Teeth & Eye Sclera Whitening
            if (uTeethWhiten > 0.01) {
                // High value, low-to-mid saturation = teeth and eye sclera
                if (hsv.z > 0.55 && hsv.y < 0.35) {
                    float whitenMask = smoothstep(0.55, 0.85, hsv.z) * (1.0 - smoothstep(0.20, 0.40, hsv.y));
                    // Desaturate slightly and brighten
                    vec3 teethHSV = rgb2hsv(finalSkin);
                    teethHSV.y = max(0.0, teethHSV.y - uTeethWhiten * 0.30);
                    teethHSV.z = min(1.0, teethHSV.z + uTeethWhiten * 0.18);
                    finalSkin = mix(finalSkin, hsv2rgb(teethHSV), whitenMask * uTeethWhiten);
                }
            }

            // 3. 3D Facial Relighting
            if (uFaceRelight > 0.01) {
                // Soft radial lighting from top-front
                float light = 1.0 - distance(uv, vec2(0.5, 0.45)) * 1.2;
                light = clamp(light, 0.0, 1.0);
                finalSkin += vec3(light * 0.12 * uFaceRelight);
            }

            // 4. AI 4K Super-Resolution & Smart Sharpening
            if (uSuperRes > 0.01 || uDeblur > 0.01) {
                float sharpenStrength = (uSuperRes * 0.9 + uDeblur * 0.6);
                vec3 north = texture(uTexture, uv + vec2(0.0, step.y)).rgb;
                vec3 south = texture(uTexture, uv - vec2(0.0, step.y)).rgb;
                vec3 east  = texture(uTexture, uv + vec2(step.x, 0.0)).rgb;
                vec3 west  = texture(uTexture, uv - vec2(step.x, 0.0)).rgb;
                vec3 laplacian = finalSkin * 4.0 - (north + south + east + west);
                finalSkin = clamp(finalSkin + laplacian * (sharpenStrength * 0.45), 0.0, 1.0);
            }

            // 5. Low-Light & Night Gamma Lift
            if (uLowLight > 0.01) {
                float gamma = 1.0 - uLowLight * 0.35;
                finalSkin = pow(finalSkin, vec3(gamma));
            }

            // 6. 3D LUT Color Grading
            finalSkin = applyColorLUT(finalSkin, uLutType, uLutIntensity);

            fragColor = vec4(clamp(finalSkin, 0.0, 1.0), baseColor.a);
        }
        `;

        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
        gl.useProgram(this.program);

        // Cache uniform locations
        const uniforms = [
            'uTexture', 'uResolution', 'uSplitX', 'uSplitEnabled', 'uHoldRaw',
            'uSkinSmooth', 'uSkinDetail', 'uFaceSlim', 'uBigEyes', 'uTeethWhiten', 'uFaceRelight',
            'uSuperRes', 'uDenoise', 'uDeblur', 'uLowLight',
            'uBodySlim', 'uLegLengthen',
            'uLutType', 'uLutIntensity'
        ];

        uniforms.forEach(name => {
            this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
        });

        // Set default texture unit
        gl.uniform1i(this.uniformLocations['uTexture'], 0);
    }

    createProgram(vSource, fSource) {
        const gl = this.gl;
        const vShader = this.compileShader(gl.VERTEX_SHADER, vSource);
        const fShader = this.compileShader(gl.FRAGMENT_SHADER, fSource);

        const program = gl.createProgram();
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            throw new Error(`WebGL Program Link Error: ${info}`);
        }
        return program;
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader Compile Error (${type}): ${info}`);
        }
        return shader;
    }

    /**
     * Setup Full-Screen Quad Geometry
     */
    initGeometry() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Quad positions (x, y) & texture coordinates (u, v)
        // Flip V so top-left aligns with video texture
        const quadVertices = new Float32Array([
            // Position (x,y)   TexCoord (u,v)
            -1.0,  1.0,         0.0, 0.0,
            -1.0, -1.0,         0.0, 1.0,
             1.0,  1.0,         1.0, 0.0,
             1.0, -1.0,         1.0, 1.0
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

        const aPositionLoc = gl.getAttribLocation(this.program, 'aPosition');
        const aTexCoordLoc = gl.getAttribLocation(this.program, 'aTexCoord');

        const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(aTexCoordLoc);
        gl.vertexAttribPointer(aTexCoordLoc, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

        gl.bindVertexArray(null);
    }

    /**
     * Initialize Video Texture
     */
    initTexture() {
        const gl = this.gl;
        this.videoTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // 1x1 black placeholder
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    }

    /**
     * Update active parameters
     */
    updateParams(newParams) {
        Object.assign(this.params, newParams);
    }

    /**
     * Render Video Frame
     * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
     */
    renderFrame(source) {
        if (!source) return;

        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);

        // Upload new video frame into GPU texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // Bind uniform values
        gl.uniform2f(this.uniformLocations['uResolution'], this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniformLocations['uSplitX'], this.params.splitX);
        gl.uniform1i(this.uniformLocations['uSplitEnabled'], this.params.splitEnabled ? 1 : 0);
        gl.uniform1i(this.uniformLocations['uHoldRaw'], this.params.holdRaw ? 1 : 0);

        // Retouch parameters
        gl.uniform1f(this.uniformLocations['uSkinSmooth'], this.params.skinSmooth);
        gl.uniform1f(this.uniformLocations['uSkinDetail'], this.params.skinDetail);
        gl.uniform1f(this.uniformLocations['uFaceSlim'], this.params.faceSlim);
        gl.uniform1f(this.uniformLocations['uBigEyes'], this.params.bigEyes);
        gl.uniform1f(this.uniformLocations['uTeethWhiten'], this.params.teethWhiten);
        gl.uniform1f(this.uniformLocations['uFaceRelight'], this.params.faceRelight);

        // AI 4K Repair parameters
        gl.uniform1f(this.uniformLocations['uSuperRes'], this.params.superRes);
        gl.uniform1f(this.uniformLocations['uDenoise'], this.params.denoise);
        gl.uniform1f(this.uniformLocations['uDeblur'], this.params.deblur);
        gl.uniform1f(this.uniformLocations['uLowLight'], this.params.lowLight);

        // Body Tune parameters
        gl.uniform1f(this.uniformLocations['uBodySlim'], this.params.bodySlim);
        gl.uniform1f(this.uniformLocations['uLegLengthen'], this.params.legLengthen);

        // LUT parameters
        gl.uniform1i(this.uniformLocations['uLutType'], this.params.lutType);
        gl.uniform1f(this.uniformLocations['uLutIntensity'], this.params.lutIntensity);

        // Draw quad
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    /**
     * Get a deep copy of current parameters (for history snapshots)
     */
    getParams() {
        return JSON.parse(JSON.stringify(this.params));
    }

    /**
     * Set all parameters from snapshot
     */
    setAllParams(newParams) {
        Object.assign(this.params, newParams);
    }

    /**
     * Set Canvas Resolution
     */
    setResolution(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
}
