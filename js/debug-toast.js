/**
 * Remaster Enhancement — On-Screen Debug & Toast HUD
 * Provides instant on-screen visual feedback for mobile APK users.
 * Bypasses hidden adb/PC console logs so users can see exact progress and error details on phone screen.
 */

class DebugToastManager {
    constructor() {
        this.container = null;
    }

    ensureContainer() {
        if (typeof document === 'undefined') return null;
        if (!this.container || (typeof document.body?.contains === 'function' && !document.body.contains(this.container))) {
            this.container = document.getElementById('debugToastContainer');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'debugToastContainer';
                this.container.className = 'debug-toast-container';
                if (document.body && typeof document.body.appendChild === 'function') {
                    document.body.appendChild(this.container);
                }
            }
        }
        return this.container;
    }

    /**
     * Display a live on-screen toast notification
     * @param {string} message - Message to display
     * @param {'info'|'success'|'warning'|'error'} type - Toast type
     * @param {number} durationMs - How long to display
     */
    show(message, type = 'info', durationMs = 4500) {
        console.log(`[DebugToast:${type}] ${message}`);

        const container = this.ensureContainer();
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `debug-toast toast-${type}`;

        const iconMap = {
            info: '⚡',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const icon = iconMap[type] || '⚡';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Dismiss">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                toast.classList.add('toast-fadeout');
                setTimeout(() => toast.remove(), 250);
            };
        }

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('toast-fadeout');
                setTimeout(() => toast.remove(), 250);
            }
        }, durationMs);

        return toast;
    }

    info(msg, durationMs) {
        return this.show(msg, 'info', durationMs);
    }

    success(msg, durationMs) {
        return this.show(msg, 'success', durationMs || 5500);
    }

    warning(msg, durationMs) {
        return this.show(msg, 'warning', durationMs || 6000);
    }

    error(msg, durationMs) {
        return this.show(msg, 'error', durationMs || 9000);
    }
}

export const DebugToast = new DebugToastManager();
