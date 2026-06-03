// --- 1. F1 Servers Data (Extracted from f1servers.js) ---
// f1Servers is already defined in f1servers.js


// --- 2. Main App Logic ---
function f1App() {
    return {
        // State
        f1LiveData: {
            sessionKey: null,
            drivers: [],
            positions: [],
            laps: [],
            stints: [],
            raceSessions: [],
            nextRace: null, // Specific object for the countdown
        },
        f1Highlights: [],
        loadingHighlights: false,
        countdown: { days: 0, hours: 0, minutes: 0, seconds: 0 },

        // Modal State
        showInfoModal: false,
        isPlayingInModal: false,
        isDirectVideo: false,
        modalPlayerUrl: '',
        hls: null,

        // Config
        selectedF1Server: localStorage.getItem('f1Server') || 'skySportsF1HD',
        availableF1Servers: f1Servers,
        youtubeF1ApiKey: CONFIG.YOUTUBE_API_KEY,
        F1_CHANNEL_ID: 'UCB_qr75-ydFVKSF9Dmo6izg',
        openF1BaseUrl: 'https://api.openf1.org/v1',

        // Season State
        selectedYear: 2026,
        availableYears: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018],

        init() {
            console.log("F1 App Initialized");
            this.fetchF1Highlights();
            this.fetchOpenF1Data();

            // 1. Fetch Next Race (Global / Future) independent of view
            this.fetchNextRace();

            // 2. Fetch Selected Season (View)
            this.fetchRaceSchedule(this.selectedYear);

            // Start Countdown Interval
            setInterval(() => this.updateCountdown(), 1000);

        },

        // --- Logic Methods ---

        async fetchOpenF1Data() {
            try {
                const sessionRes = await fetch(`${this.openF1BaseUrl}/sessions?meeting_key=latest&session_name=Race`);
                const sessions = await sessionRes.json();
                if (sessions && sessions.length > 0) {
                    this.f1LiveData.sessionKey = sessions[0].session_key;
                }
            } catch (error) {
                console.error('Error fetching OpenF1 data:', error);
            }
        },

        async fetchNextRace() {
            // Always fetch 2026 or future data to find the upcoming race
            // We use the manual 2026 schedule as our "gold source" for the future
            // If we were in 2026, we might want to check an API, but for now this logic holds.
            const futureRaces = this.getManual2026Schedule();

            const normalizedRaces = futureRaces.map(race => ({
                session_key: `f1_2026_${race.round}`,
                location: race.Circuit.Location.locality,
                country_name: race.Circuit.Location.country,
                circuit_short_name: race.Circuit.circuitName,
                date_start: `${race.date}T${race.time || "12:00:00Z"}`,
                session_name: 'Race',
                round: race.round
            }));

            const now = new Date();
            this.f1LiveData.nextRace = normalizedRaces.find(session => new Date(session.date_start) > now) || normalizedRaces[0];
            this.updateCountdown();
        },

        async fetchRaceSchedule(year) {
            this.selectedYear = parseInt(year);
            this.f1LiveData.raceSessions = []; // Clear current list while loading

            // Special Case for 2026 (Manual Fallback / Future)
            if (this.selectedYear === 2026) {
                await this.load2026Schedule();
                return;
            }

            try {
                // Fetch from Jolpica (Ergast Mirror) for past/current seasons
                const res = await fetch(`https://api.jolpi.ca/ergast/f1/${this.selectedYear}/races.json`);
                const data = await res.json();
                const races = data.MRData.RaceTable.Races;

                this.f1LiveData.raceSessions = races.map(race => {
                    const timeStr = race.time || "12:00:00Z";

                    // Normalize circuit name for display
                    // Some older data might have slightly different structures, but standard Ergast is consistent.
                    return {
                        session_key: `f1_${this.selectedYear}_${race.round}`,
                        location: race.Circuit.Location.locality, // e.g. "Melbourne"
                        country_name: race.Circuit.Location.country, // e.g. "Australia"
                        circuit_short_name: race.Circuit.circuitName,
                        date_start: `${race.date}T${timeStr}`,
                        session_name: 'Race',
                        round: race.round,
                        race_name: race.raceName // Added for Replay Search query
                    };
                });

            } catch (error) {
                console.error(`Error fetching ${this.selectedYear} schedule:`, error);
                this.$dispatch('show-toast', { message: `Failed to load ${this.selectedYear} season.`, type: 'error' });
            }
        },

        async load2026Schedule() {
            try {
                const res = await fetch(`${CONFIG.F1_SUPABASE_URL}/functions/v1/getAllRaces?year=2026`);
                const races = await res.json();
                if (Array.isArray(races) && races.length > 0) {
                    this.f1LiveData.raceSessions = races.map(race => ({
                        session_key: `f1_2026_${race.round}`,
                        location: race.Circuit.Location.locality,
                        country_name: race.Circuit.Location.country,
                        circuit_short_name: race.Circuit.circuitName,
                        date_start: `${race.date}T${race.time || "12:00:00Z"}`,
                        session_name: 'Race',
                        round: race.round,
                        race_name: race.raceName
                    }));
                    return;
                }
            } catch (error) {
                console.warn('getAllRaces 2026 failed, using manual schedule:', error);
            }

            const manualRaces = this.getManual2026Schedule();
            this.f1LiveData.raceSessions = manualRaces.map(race => ({
                session_key: `f1_2026_${race.round}`,
                location: race.Circuit.Location.locality,
                country_name: race.Circuit.Location.country,
                circuit_short_name: race.Circuit.circuitName,
                date_start: `${race.date}T${race.time || "12:00:00Z"}`,
                session_name: 'Race',
                round: race.round,
                race_name: race.raceName
            }));
        },

        // Helper: Official 2026 Calendar (Dates confirmed by FIA)
        getManual2026Schedule() {
            return [
                { round: "1", date: "2026-03-08", time: "04:00:00Z", raceName: "Australian Grand Prix", Circuit: { circuitName: "Albert Park", Location: { locality: "Melbourne", country: "Australia" } } },
                { round: "2", date: "2026-03-15", time: "07:00:00Z", raceName: "Chinese Grand Prix", Circuit: { circuitName: "Shanghai Int. Circuit", Location: { locality: "Shanghai", country: "China" } } },
                { round: "3", date: "2026-03-29", time: "05:00:00Z", raceName: "Japanese Grand Prix", Circuit: { circuitName: "Suzuka Circuit", Location: { locality: "Suzuka", country: "Japan" } } },
                { round: "4", date: "2026-04-12", time: "15:00:00Z", raceName: "Bahrain Grand Prix", Circuit: { circuitName: "Bahrain Int. Circuit", Location: { locality: "Sakhir", country: "Bahrain" } } },
                { round: "5", date: "2026-04-19", time: "17:00:00Z", raceName: "Saudi Arabian Grand Prix", Circuit: { circuitName: "Jeddah Corniche", Location: { locality: "Jeddah", country: "Saudi Arabia" } } },
                { round: "6", date: "2026-05-03", time: "20:00:00Z", raceName: "Miami Grand Prix", Circuit: { circuitName: "Miami Int. Autodrome", Location: { locality: "Miami", country: "USA" } } },
                { round: "7", date: "2026-05-24", time: "18:00:00Z", raceName: "Canadian Grand Prix", Circuit: { circuitName: "Circuit Gilles Villeneuve", Location: { locality: "Montreal", country: "Canada" } } },
                { round: "8", date: "2026-06-07", time: "13:00:00Z", raceName: "Monaco Grand Prix", Circuit: { circuitName: "Circuit de Monaco", Location: { locality: "Monte Carlo", country: "Monaco" } } },
                { round: "9", date: "2026-06-14", time: "13:00:00Z", raceName: "Spanish Grand Prix", Circuit: { circuitName: "Catalunya", Location: { locality: "Barcelona", country: "Spain" } } },
                { round: "10", date: "2026-06-28", time: "13:00:00Z", raceName: "Austrian Grand Prix", Circuit: { circuitName: "Red Bull Ring", Location: { locality: "Spielberg", country: "Austria" } } },
                { round: "11", date: "2026-07-05", time: "14:00:00Z", raceName: "British Grand Prix", Circuit: { circuitName: "Silverstone", Location: { locality: "Silverstone", country: "UK" } } },
                { round: "12", date: "2026-07-19", time: "13:00:00Z", raceName: "Belgian Grand Prix", Circuit: { circuitName: "Spa-Francorchamps", Location: { locality: "Spa", country: "Belgium" } } },
                { round: "13", date: "2026-07-26", time: "13:00:00Z", raceName: "Hungarian Grand Prix", Circuit: { circuitName: "Hungaroring", Location: { locality: "Budapest", country: "Hungary" } } },
                { round: "14", date: "2026-08-23", time: "13:00:00Z", raceName: "Dutch Grand Prix", Circuit: { circuitName: "Zandvoort", Location: { locality: "Zandvoort", country: "Netherlands" } } },
                { round: "15", date: "2026-09-06", time: "13:00:00Z", raceName: "Italian Grand Prix", Circuit: { circuitName: "Monza", Location: { locality: "Monza", country: "Italy" } } },
                { round: "16", date: "2026-09-13", time: "13:00:00Z", raceName: "Madrid Grand Prix", Circuit: { circuitName: "Madrid Street Circuit", Location: { locality: "Madrid", country: "Spain" } } }, // New Race!
                { round: "17", date: "2026-09-26", time: "11:00:00Z", raceName: "Azerbaijan Grand Prix", Circuit: { circuitName: "Baku City Circuit", Location: { locality: "Baku", country: "Azerbaijan" } } },
                { round: "18", date: "2026-10-11", time: "12:00:00Z", raceName: "Singapore Grand Prix", Circuit: { circuitName: "Marina Bay", Location: { locality: "Marina Bay", country: "Singapore" } } },
                { round: "19", date: "2026-10-25", time: "19:00:00Z", raceName: "United States Grand Prix", Circuit: { circuitName: "COTA", Location: { locality: "Austin", country: "USA" } } },
                { round: "20", date: "2026-11-01", time: "20:00:00Z", raceName: "Mexico City Grand Prix", Circuit: { circuitName: "Hermanos Rodriguez", Location: { locality: "Mexico City", country: "Mexico" } } },
                { round: "21", date: "2026-11-08", time: "17:00:00Z", raceName: "São Paulo Grand Prix", Circuit: { circuitName: "Interlagos", Location: { locality: "São Paulo", country: "Brazil" } } },
                { round: "22", date: "2026-11-21", time: "06:00:00Z", raceName: "Las Vegas Grand Prix", Circuit: { circuitName: "Las Vegas Strip", Location: { locality: "Las Vegas", country: "USA" } } },
                { round: "23", date: "2026-11-29", time: "16:00:00Z", raceName: "Qatar Grand Prix", Circuit: { circuitName: "Lusail", Location: { locality: "Lusail", country: "Qatar" } } },
                { round: "24", date: "2026-12-06", time: "13:00:00Z", raceName: "Abu Dhabi Grand Prix", Circuit: { circuitName: "Yas Marina", Location: { locality: "Abu Dhabi", country: "UAE" } } }
            ];
        },

        getNextRace() {
            // Fallback to internal method if called directly in UI, though we prefer pushing to state
            return this.f1LiveData.nextRace;
        },

        updateCountdown() {
            const target = this.f1LiveData.nextRace; // USE STATE
            if (!target) {
                // Try getting it if state isn't set yet
                const next = this.getNextRace();
                if (!next) {
                    this.countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
                    return;
                }
                // If getNextRace() returned something but state wasn't set, use it locally
                // But ideally fetchNextRace() handles this.
            }

            // Re-assign target in case it was null initially and getNextRace found one
            const finalTarget = this.f1LiveData.nextRace || this.getNextRace();

            if (!finalTarget) return;

            const raceDate = new Date(finalTarget.date_start).getTime();
            const now = new Date().getTime();
            const distance = raceDate - now;

            if (distance > 0) {
                this.countdown.days = Math.floor(distance / (1000 * 60 * 60 * 24));
                this.countdown.hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                this.countdown.minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                this.countdown.seconds = Math.floor((distance % (1000 * 60)) / 1000);
            } else {
                this.countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
            }
        },

        // --- Highlights Logic ---

        async fetchF1Highlights() {
            this.loadingHighlights = true;
            const CHANNEL_ID = this.F1_CHANNEL_ID;
            const API_KEY = this.youtubeF1ApiKey;

            try {
                // Fetch RSS via Proxy
                const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
                const rssRes = await fetch(proxyUrl);
                const rssText = await rssRes.text();

                const parser = new DOMParser();
                const xml = parser.parseFromString(rssText, "text/xml");
                const entries = Array.from(xml.querySelectorAll("entry"));

                let videos = entries.map(entry => {
                    const videoId = entry.querySelector('videoId')?.textContent || entry.querySelector('yt\\:videoId')?.textContent;
                    return {
                        id: videoId,
                        title: entry.querySelector("title")?.textContent,
                        publishedAt: entry.querySelector("published")?.textContent,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    };
                }).filter(v => v.id);

                // Fetch Details for Duration
                const videosToFetch = videos.slice(0, 15);
                const ids = videosToFetch.map(v => v.id).join(",");

                if (ids) {
                    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?id=${ids}&part=contentDetails,statistics&key=${API_KEY}`;
                    const detailsRes = await fetch(detailsUrl);
                    const detailsData = await detailsRes.json();

                    this.f1Highlights = videosToFetch.map(video => {
                        const apiData = detailsData.items?.find(i => i.id === video.id);
                        if (!apiData) return null;
                        const duration = apiData.contentDetails?.duration || 'PT0S';
                        // Filter Shorts (simple logic: usually less than 1 min, but checking for 'M' in duration string is safer for >1min videos)
                        if (!duration.includes('M') && !duration.includes('H')) return null;

                        return {
                            ...video,
                            duration: duration,
                            viewCount: apiData.statistics?.viewCount || '0'
                        };
                    }).filter(Boolean);
                }
            } catch (error) {
                console.error("Error fetching highlights:", error);
                // Mock data in case of failure
                this.f1Highlights = [
                    { id: 'j5p_XyB9aQg', title: '2024 Abu Dhabi Grand Prix | Race Highlights', thumbnail: 'https://img.youtube.com/vi/j5p_XyB9aQg/maxresdefault.jpg', publishedAt: new Date().toISOString(), viewCount: '4M', duration: 'PT15M' }
                ];
            } finally {
                this.loadingHighlights = false;
            }
        },

        playYouTubeVideo(videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
        },

        // --- Streaming Logic ---

        openF1StreamPlayer() {
            const selectedServer = this.availableF1Servers.find(s => s.id === this.selectedF1Server) || this.availableF1Servers[0];
            const f1StreamUrl = selectedServer.url;

            let isDirect = false;
            if (f1StreamUrl.includes('.m3u8')) {
                // Logic for HLS if needed, but for now assuming direct dispatch
                isDirect = true;
            }

            // Dispatch event to Global App Scope
            this.$dispatch('play-f1-stream', { url: f1StreamUrl, isDirect: isDirect });
            this.$dispatch('show-toast', { message: `Launching ${selectedServer.name}...`, type: 'success' });
        },

        playDirectHLS(url) {
            this.isDirectVideo = true;
            this.modalPlayerUrl = ''; // Clear iframe url

            const video = document.getElementById('modalPlayerVideo');
            if (!video) return;

            if (Hls.isSupported()) {
                if (this.hls) this.hls.destroy();
                this.hls = new Hls();
                this.hls.loadSource(url);
                this.hls.attachMedia(video);
                this.hls.on(Hls.Events.MANIFEST_PARSED, function () { video.play(); });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', function () { video.play(); });
            }
        },

        closeInfoModal() {
            this.showInfoModal = false;
            this.isPlayingInModal = false;
            this.modalPlayerUrl = '';
            document.body.style.overflow = '';

            // Stop Players
            const video = document.getElementById('modalPlayerVideo');
            if (video) { video.pause(); video.src = ''; }
            if (this.hls) { this.hls.destroy(); this.hls = null; }

            const iframe = document.getElementById('modalPlayerIframeNtflx');
            if (iframe) iframe.src = 'about:blank';
        },

        // --- Helper Functions ---
        formatViewCount(count) {
            const num = parseInt(count);
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return count;
        },

        formatUploadDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return '1 day ago';
            if (diffDays < 7) return `${diffDays} days ago`;
            return `${Math.floor(diffDays / 30)} months ago`;
        },

        parseDuration(duration) {
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (!match) return '0:00';
            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);
            if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        },

        // Scroll Logic
        initScrollState(rowId) { },
        scrollRow(rowId, direction) {
            const rE = document.getElementById(rowId);
            if (rE) rE.scrollBy({ left: rE.clientWidth * 0.8 * direction, behavior: 'smooth' });
        },

        // --- Replay Logic ---
        showReplayModal: false,
        availableReplays: [],
        selectedReplayRace: null,
        replayBaseUrl: (CONFIG.F1_REPLAY_SUPABASE_URL || CONFIG.F1_SUPABASE_URL) + '/functions/v1',
        loadingReplays: false,

        async loadReplays(race) {
            console.log("loadReplays called for:", race);

            // Safeguard: Check if race is in the future
            const raceDate = new Date(race.date_start);
            const now = new Date();
            console.log("Date Check:", raceDate, ">", now, "?", raceDate > now);

            if (raceDate > now) {
                this.$dispatch('show-toast', { message: "Race hasn't happened yet!", type: 'error' });
                return;
            }

            this.loadingReplays = true;
            this.selectedReplayRace = race;
            this.availableReplays = [];
            this.showReplayModal = true;

            try {
                let query = race.race_name;
                if (!query) query = `${race.location} Grand Prix`;

                const encodedQuery = encodeURIComponent(query);
                const year = new Date(race.date_start).getFullYear();

                const response = await fetch(`${this.replayBaseUrl}/getReplays?q=${encodedQuery}&year=${year}`);
                const data = await response.json();

                this.availableReplays = data.filter(r => {
                    const yearMatch = r.year ? parseInt(r.year) === year : true;
                    return (r.iframe_url || r.hls_url) && yearMatch;
                });

                if (this.availableReplays.length === 0) {
                    this.$dispatch('show-toast', { message: 'No replays found for this race yet.', type: 'error' });
                }

            } catch (error) {
                console.error('Error fetching replays:', error);
                this.$dispatch('show-toast', { message: 'Failed to load replays', type: 'error' });
            } finally {
                this.loadingReplays = false;
            }
        },

        playReplay(replay) {
            this.showReplayModal = false;
            const url = replay.hls_url || replay.iframe_url;
            if (!url) return;
            const isDirect = !!(replay.hls_url && replay.hls_url.includes('.m3u8'));
            this.$dispatch('play-f1-stream', { url, isDirect });
        },

        closeReplayModal() {
            this.showReplayModal = false;
            this.availableReplays = [];
            this.selectedReplayRace = null;
        }
    };
}
