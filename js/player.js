/**
 * Utilities for the Novaflix custom player (used by app.js).
 */
const NovaPlayerUtils = {
    formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}`;
    },

    progressPercent(current, duration) {
        if (!duration || !Number.isFinite(duration)) return 0;
        return Math.min(100, Math.max(0, (current / duration) * 100));
    },
};
