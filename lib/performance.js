// Performance Detection and Optimization Library for NovaFlix
// Automatically detects device capabilities and enables performance mode for low-end devices

class PerformanceManager {
    constructor() {
        this.isLowEndDevice = false;
        this.performanceMode = this.getStoredPreference();
        this.deviceScore = 0;

        this.init();
    }

    init() {
        // Detect device capabilities on first load
        this.detectDeviceCapabilities();

        // Apply performance mode if needed
        this.applyPerformanceMode();

        // Monitor performance over time
        this.monitorPerformance();
    }

    detectDeviceCapabilities() {
        let score = 100; // Start with perfect score

        // Check CPU cores (fewer cores = lower score)
        const cores = navigator.hardwareConcurrency || 2;
        if (cores <= 2) score -= 30;
        else if (cores <= 4) score -= 15;

        // Check device memory (if available)
        if (navigator.deviceMemory) {
            if (navigator.deviceMemory <= 2) score -= 30;
            else if (navigator.deviceMemory <= 4) score -= 15;
        }

        // Check connection speed
        if (navigator.connection) {
            const effectiveType = navigator.connection.effectiveType;
            if (effectiveType === '2g' || effectiveType === 'slow-2g') score -= 20;
            else if (effectiveType === '3g') score -= 10;
        }

        // Check if Windows (typically has worse GPU performance with backdrop-blur)
        const isWindows = navigator.platform.toLowerCase().includes('win');
        if (isWindows) score -= 10;

        // Check for mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            // Mobile devices handle blur differently
            const isOldMobile = !window.matchMedia('(prefers-reduced-motion)').matches &&
                window.innerWidth < 768;
            if (isOldMobile) score -= 15;
        }

        this.deviceScore = score;

        // Consider low-end if score is below 60
        this.isLowEndDevice = score < 60;

        console.log(`[Performance] Device Score: ${score}, Low-end: ${this.isLowEndDevice}`);

        return this.isLowEndDevice;
    }

    getStoredPreference() {
        // Check if user has manually set a preference
        const stored = localStorage.getItem('performanceMode');

        if (stored === 'enabled') return true;
        if (stored === 'disabled') return false;

        // Return null for auto-detect
        return null;
    }

    setPerformanceMode(enabled) {
        // User manually set preference
        this.performanceMode = enabled;
        localStorage.setItem('performanceMode', enabled ? 'enabled' : 'disabled');
        this.applyPerformanceMode();

        // Reload to apply changes fully
        window.location.reload();
    }

    applyPerformanceMode() {
        // Determine if we should enable performance mode
        const shouldEnable = this.performanceMode !== null
            ? this.performanceMode
            : this.isLowEndDevice;

        if (shouldEnable) {
            console.log('[Performance] Enabling Performance Mode');

            // Add performance mode class to body
            document.documentElement.classList.add('performance-mode');

            // Store that we're in performance mode
            sessionStorage.setItem('isPerformanceMode', 'true');
        } else {
            document.documentElement.classList.remove('performance-mode');
            sessionStorage.setItem('isPerformanceMode', 'false');
        }
    }

    monitorPerformance() {
        // Monitor frame rate and adjust if needed
        if (!window.PerformanceObserver) return;

        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    // Check for long tasks (> 50ms)
                    if (entry.duration > 50) {
                        console.warn('[Performance] Long task detected:', entry.duration.toFixed(2), 'ms');
                    }
                }
            });

            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            // Long task API not supported, ignore
        }
    }

    // Get recommendations for settings
    getRecommendations() {
        return {
            reduceBlur: this.isLowEndDevice || this.deviceScore < 65,
            reduceAnimations: this.isLowEndDevice,
            lowerImageQuality: this.isLowEndDevice || this.deviceScore < 55,
            enableVirtualScrolling: this.isLowEndDevice
        };
    }

    // Check if a specific feature should be disabled
    shouldDisableFeature(feature) {
        const recommendations = this.getRecommendations();
        return recommendations[feature] || false;
    }
}

// Initialize performance manager
window.performanceManager = new PerformanceManager();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceManager;
}
