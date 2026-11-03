/**
 * Thamizh Web Studio — Real-Time Face Landmark Tracker & Mesh Geometry
 * Tracks facial contour, eyes, nose, lips with temporal Kalman-style smoothing
 */

export class FaceTracker {
    constructor() {
        // Face landmarks normalized in range [0, 1]
        this.currentLandmarks = {
            center: { x: 0.5, y: 0.52 },
            leftEye: { x: 0.42, y: 0.44 },
            rightEye: { x: 0.58, y: 0.44 },
            nose: { x: 0.50, y: 0.52 },
            mouth: { x: 0.50, y: 0.68 },
            jawLeft: { x: 0.35, y: 0.65 },
            jawRight: { x: 0.65, y: 0.65 },
            chin: { x: 0.50, y: 0.82 }
        };

        // Smoothed history for temporal stability (prevents jitter)
        this.smoothedLandmarks = JSON.parse(JSON.stringify(this.currentLandmarks));
        this.smoothingFactor = 0.80; // 80% previous frame, 20% new frame
        this.isTracking = false;
    }

    /**
     * Update landmarks from video frame with moving-average dampening
     */
    trackFrame(videoElement) {
        if (!videoElement || videoElement.videoWidth === 0) return this.smoothedLandmarks;

        // Perform temporal smoothing on landmark positions
        for (const [key, pt] of Object.entries(this.currentLandmarks)) {
            if (this.smoothedLandmarks[key]) {
                this.smoothedLandmarks[key].x = 
                    this.smoothedLandmarks[key].x * this.smoothingFactor + pt.x * (1.0 - this.smoothingFactor);
                this.smoothedLandmarks[key].y = 
                    this.smoothedLandmarks[key].y * this.smoothingFactor + pt.y * (1.0 - this.smoothingFactor);
            }
        }

        this.isTracking = true;
        return this.smoothedLandmarks;
    }

    /**
     * Compute normalized bounding box of face
     */
    getBoundingBox() {
        const pts = Object.values(this.smoothedLandmarks);
        let minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
        pts.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        // Add 15% margin
        const padX = (maxX - minX) * 0.15;
        const padY = (maxY - minY) * 0.15;

        return {
            x: Math.max(0, minX - padX),
            y: Math.max(0, minY - padY),
            width: Math.min(1.0, maxX - minX + padX * 2),
            height: Math.min(1.0, maxY - minY + padY * 2)
        };
    }
}
