/**
 * Thamizh Web Studio — Photo Studio Session Store (IndexedDB)
 * Persists raw image blobs, 4K AI enhanced blobs, filenames, and slider parameters
 * across browser page refreshes without size limits (supports 100MB+ Blobs).
 */

const DB_NAME = 'thamizh_photo_studio';
const DB_VERSION = 1;
const STORE_NAME = 'photo_session';
const SESSION_KEY = 'active_session';

class PhotoSessionStore {
    constructor() {
        this.dbPromise = null;
    }

    _openDB() {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB not supported in this environment'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });

        return this.dbPromise;
    }

    /**
     * Saves the current active photo session into IndexedDB.
     */
    async saveSession({ rawBlob, enhancedBlob, filename, isDeepEnhanced, params }) {
        try {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                
                const sessionData = {
                    rawBlob: rawBlob || null,
                    enhancedBlob: enhancedBlob || null,
                    filename: filename || 'Thamizh_Clarity_Portrait.jpg',
                    isDeepEnhanced: !!isDeepEnhanced,
                    params: params || {},
                    savedAt: Date.now()
                };

                const request = store.put(sessionData, SESSION_KEY);
                request.onsuccess = () => resolve(true);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('[PhotoSessionStore] Failed to save session:', err);
            return false;
        }
    }

    /**
     * Loads the stored active photo session from IndexedDB.
     */
    async loadSession() {
        try {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(SESSION_KEY);

                request.onsuccess = (e) => resolve(e.target.result || null);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('[PhotoSessionStore] Failed to load session:', err);
            return null;
        }
    }

    /**
     * Clears the active photo session from IndexedDB.
     */
    async clearSession() {
        try {
            const db = await this._openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(SESSION_KEY);

                request.onsuccess = () => resolve(true);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.warn('[PhotoSessionStore] Failed to clear session:', err);
            return false;
        }
    }
}

export const photoSessionStore = new PhotoSessionStore();

