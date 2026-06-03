// Alpine.js Store for Context Menu
document.addEventListener('alpine:init', () => {
    Alpine.store('contextMenu', { show: false, x: 0, y: 0, item: null });
});

function contextMenuHandler() {
    return {
        copyToClipboard(text) {
            if (!text) return;
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.$dispatch('show-toast', { message: 'Copied to clipboard!', type: 'success' });
            } catch (err) {
                this.$dispatch('show-toast', { message: 'Failed to copy', type: 'error' });
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textarea);
        }
    }
}


function app() {
    return {

        activeTab: 'live', // For F1 view

        // F1 Data
        providers: [
            { id: 'skySports', name: 'Sky Sports', icon: '🏎️' },
            { id: 'f1Tv', name: 'F1 TV', icon: '🏁' },
            { id: 'other', name: 'Other Sources', icon: '📺' }
        ],
        selectedProvider: localStorage.getItem('f1Provider') || 'skySports',
        // F1 Server Configuration
        selectedF1Server: localStorage.getItem('f1Server') || 'skySportsF1HD',
        availableF1Servers: typeof f1Servers !== 'undefined' ? f1Servers : [],
        channels: { skySports: [], f1Tv: [], others: [] },
        currentStreamUrl: null,
        currentStreamTitle: '',
        hls: null,
        years: Array.from({ length: new Date().getFullYear() - 2015 + 1 }, (_, i) => (new Date().getFullYear() - i).toString()),
        selectedYear: new Date().getFullYear().toString(),
        races: [],
        selectedRace: null,
        availableReplays: [],
        showReplayList: false,
        loadingReplays: false,
        currentReplayUrl: null,
        currentReplayTitle: '',
        showLivePlayerModal: false,
        supabase: null,

        // YouTube API for F1 Highlights
        youtubeF1ApiKey: CONFIG.YOUTUBE_API_KEY, // YouTube API key for F1 highlights
        F1_CHANNEL_ID: 'UCB_qr75-ydFVKSF9Dmo6izg', // Official Formula 1 YouTube channel
        f1Highlights: [],
        loadingHighlights: false,

        apiKey: CONFIG.TMDB_API_KEY, // Ensure this is your actual TMDB API key
        youtubeApiKey: CONFIG.YOUTUBE_API_KEY, // Replace if you use YouTube API for trailers directly
        content: [], bannerMovie: null, currentTab: 'movies', language: localStorage.getItem('selectedLanguage') || 'en',
        currentPage: 1, totalPages: 1, genres: [], searchQuery: '', searchResults: [], isSearching: false,
        mobileMenu: false, bannerHoverTimeout: null, bannerTrailerLoaded: false, showWatchLater: false,
        watchLaterItems: [], watchLaterCount: 0, showClearConfirm: false,
        continueWatchingItems: [], MAX_CONTINUE_WATCHING: 12,
        showInfoModal: false, modalContent: null, modalSelectedSeason: 1, modalSelectedEpisode: null,
        episodesForModal: [], loadingEpisodes: false, loadingModal: false, isPlayingInModal: false, isDirectVideo: false, modalPlayerUrl: '',
        activeSourceConfig: null, detailedItemsCache: {}, scrollStates: {},
        isVideoJs: false, videoJsPlayer: null,
        isEmbed: false, embedCode: '',
        modalCloseTimeout: null, // Track delayed modal reset timeout
        // REPLACE THIS EMAIL WITH THE USER'S EMAIL
        targetUserEmail: 'user@example.com',
        addedForYouItems: [], // Dynamic content from DB
        user: null,


        // Mobile Specific State
        mobileDetailOpen: false,
        mobileDetailOpen: false,
        closingMobileDetail: false,
        mobileDetailContent: null, // Initialize to prevent "defined" errors

        openProfilePage() {
            window.location.href = 'settings.html';
        },

        escapeHtml(value) {
            const div = document.createElement('div');
            div.textContent = value == null ? '' : String(value);
            return div.innerHTML;
        },

        sanitizeMediaUrl(value) {
            if (!value) return '';

            try {
                const url = new URL(String(value).trim(), window.location.origin);
                if (!['https:', 'http:', 'blob:'].includes(url.protocol)) return '';
                return url.href;
            } catch (error) {
                console.warn('Blocked invalid media URL:', value);
                return '';
            }
        },

        extractIframeSrc(value) {
            if (!value) return '';

            const source = String(value).trim();
            if (!source.startsWith('<iframe')) {
                return this.sanitizeMediaUrl(source);
            }

            const template = document.createElement('template');
            template.innerHTML = source;
            const iframe = template.content.querySelector('iframe');
            return this.sanitizeMediaUrl(iframe ? iframe.getAttribute('src') : '');
        },

        // Scroll handler with debouncing for performance
        scrollTimeout: null,
        handleScroll() {
            // Debounce scroll events to reduce CPU usage
            if (this.scrollTimeout) return;

            this.scrollTimeout = setTimeout(() => {
                const header = document.getElementById('header');
                if (header) {
                    header.classList.toggle('black-bg', window.scrollY > 10);
                }
                this.scrollTimeout = null;
            }, 16); // ~60fps
        },


        // Featured Content for Mobile Hero (Mapped from Banner or First Item)
        get featuredContent() {
            return this.bannerMovie || (this.content.length > 0 ? this.content[0] : null);
        },

        openMobileDetail(item) {
            try {
                if (!item || !item.id) {
                    console.error("openMobileDetail: Invalid item passed", item);
                    return;
                }

                // Deep copy to avoid Proxy issues and weird reactivity bugs
                this.mobileDetailContent = JSON.parse(JSON.stringify(item));

                // Ensure media_type is set (infer if missing)
                if (!this.mobileDetailContent.media_type) {
                    this.mobileDetailContent.media_type = item.first_air_date ? 'tv' : 'movie';
                }

                // Initialize safe defaults for nested properties to prevent template crashes
                this.mobileDetailContent.images = this.mobileDetailContent.images || { logos: [] };
                this.mobileDetailContent.videos = this.mobileDetailContent.videos || { results: [] };

                // Clear any previous arrays
                this.mobileSeasons = [];
                this.mobileEpisodes = [];
                this.mobileTrailers = [];
                this.mobileSelectedSeason = 1;

                this.mobileDetailOpen = true;
                this.closingMobileDetail = false;
                document.body.style.overflow = 'hidden';

                // Check if this is a PURE private item (no TMDB ID) - ID starts with 'private_'
                const isPurePrivate = String(this.mobileDetailContent.id).startsWith('private_');
                const privateData = this.mobileDetailContent.original_private_item;

                if (isPurePrivate && privateData) {
                    console.log("openMobileDetail: Pure private item detected, skipping TMDB fetch");

                    // Apply private data directly
                    this.mobileDetailContent.credits = { cast: [], crew: [] };

                    // Apply Cast
                    const castSource = privateData.cast_members || privateData.cast;
                    if (castSource && castSource.length > 0) {
                        this.mobileDetailContent.credits.cast = castSource.map((name, index) => ({ id: index, name: name, profile_path: null }));
                    }

                    // Apply Logo
                    if (privateData.logo_path) this.mobileDetailContent.logo_path = privateData.logo_path;

                    // Apply Backdrop  
                    if (privateData.backdrop_path) this.mobileDetailContent.backdrop_path = privateData.backdrop_path;

                    // Apply Trailer
                    // Apply Trailers (Multiple)
                    const trailers = privateData.trailer_urls && privateData.trailer_urls.length > 0
                        ? privateData.trailer_urls
                        : (privateData.trailer_url ? [privateData.trailer_url] : []);

                    if (trailers.length > 0) {
                        this.mobileDetailContent.videos = this.mobileDetailContent.videos || { results: [] };

                        trailers.forEach((url, index) => {
                            const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                            if (ytMatch && ytMatch[1]) {
                                this.mobileDetailContent.videos.results.push({
                                    id: 'custom-trailer-' + index,
                                    key: ytMatch[1],
                                    name: index === 0 ? 'Official Trailer' : `Trailer ${index + 1}`,
                                    site: 'YouTube',
                                    type: 'Trailer'
                                });
                            }
                        });
                        this.mobileTrailers = this.mobileDetailContent.videos.results;
                    }

                    return; // Skip TMDB fetch
                }

                // For items WITH TMDB ID, fetch extended details
                this.fetchMobileExtendedDetails(this.mobileDetailContent.id, this.mobileDetailContent.media_type);
            } catch (e) {
                console.error("CRITICAL ERROR IN openMobileDetail:", e);
                // Manually trigger the global error handler for visibility
                window.dispatchEvent(new ErrorEvent('error', {
                    error: e,
                    message: e.message + " (Critical in openMobileDetail)",
                    lineno: 0,
                    filename: 'app.js'
                }));
            }
        },


        async fetchMobileExtendedDetails(id, type) {
            if (!this.apiKey || !id) return;
            // Removed season/1 from append_to_response to rely on explicit fetch
            const append = '&append_to_response=videos,images,credits';
            const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${this.apiKey}&language=en-US${append}`;

            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

                const data = await res.json();

                // Merge data carefully so we don't lose existing properties if API partial fails
                this.mobileDetailContent = { ...this.mobileDetailContent, ...data };
                this.mobileDetailContent.media_type = type; // Ensure type is preserved

                // --- MERGE PRIVATE DATA OVERRIDES ---
                const privateData = this.mobileDetailContent.original_private_item;
                if (privateData && typeof privateData === 'object') {
                    console.log("Mobile: Applying private data overrides from original_private_item", privateData);

                    // Apply Cast Override
                    const castSource = privateData.cast_members || privateData.cast;
                    if (castSource && castSource.length > 0) {
                        this.mobileDetailContent.credits = this.mobileDetailContent.credits || { cast: [], crew: [] };
                        this.mobileDetailContent.credits.cast = castSource.map((name, index) => ({ id: index, name: name, profile_path: null }));
                        console.log("Mobile: Cast overridden with", castSource);
                    }

                    // Apply Logo Override
                    if (privateData.logo_path) {
                        this.mobileDetailContent.logo_path = privateData.logo_path;
                    }

                    // Apply Backdrop Override
                    if (privateData.backdrop_path) {
                        this.mobileDetailContent.backdrop_path = privateData.backdrop_path;
                    }

                    // Apply Trailer Override -> Add to video results
                    // Apply Trailers (Multiple)
                    const trailers = privateData.trailer_urls && privateData.trailer_urls.length > 0
                        ? privateData.trailer_urls
                        : (privateData.trailer_url ? [privateData.trailer_url] : []);

                    if (trailers.length > 0) {
                        this.mobileDetailContent.videos = this.mobileDetailContent.videos || { results: [] };
                        [...trailers].reverse().forEach((url, index) => {
                            const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                            if (ytMatch && ytMatch[1]) {
                                this.mobileDetailContent.videos.results.unshift({
                                    id: 'custom-trailer-' + index,
                                    iso_639_1: 'en',
                                    key: ytMatch[1],
                                    name: 'Official Trailer',
                                    site: 'YouTube',
                                    type: 'Trailer'
                                });
                            }
                        });
                        console.log("Mobile: Trailers overridden with", trailers);
                    }
                }
                // -----------------------------------

                // Trailers (now includes any custom trailer we just added)
                if (this.mobileDetailContent.videos && this.mobileDetailContent.videos.results) {
                    this.mobileTrailers = this.mobileDetailContent.videos.results.filter(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Featurette'));
                }

                // Seasons (TV Only)
                if (type === 'tv' && data.seasons) {
                    this.mobileSeasons = data.seasons.filter(s => s.season_number > 0); // Exclude "Specials" (Season 0)
                    this.mobileSelectedSeason = 1;

                    // FORCE FETCH SEASON 1
                    if (this.mobileSeasons.length > 0) {
                        // Default to 1, or the first available if 1 isn't there (unlikely for most shows but possible)
                        const firstSeason = this.mobileSeasons.find(s => s.season_number === 1) ? 1 : this.mobileSeasons[0].season_number;
                        this.mobileSelectedSeason = firstSeason;
                        console.log("Fetching episodes for season:", firstSeason);
                        await this.fetchMobileSeasonEpisodes(id, firstSeason);
                    }
                }
            } catch (e) {
                console.error("Error fetching mobile details:", e);
                // Keep the modal open but maybe show error toast?
                // The partial content (title, poster) should still be visible thanks to the deep copy init.
            }
        },

        async fetchMobileSeasonEpisodes(tvId, seasonNum) {
            console.log(`Fetching episodes: TV ${tvId}, Season ${seasonNum}`);
            this.mobileLoadingEpisodes = true;
            this.mobileEpisodes = []; // Clear previous
            this.mobileSelectedSeason = seasonNum;
            const url = `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${this.apiKey}&language=en-US`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.episodes) {
                    this.mobileEpisodes = data.episodes;
                    console.log("Episodes fetched:", this.mobileEpisodes.length);
                } else {
                    this.mobileEpisodes = [];
                }
            } catch (e) {
                console.error("Error fetching episodes:", e);
                this.mobileEpisodes = [];
            } finally {
                this.mobileLoadingEpisodes = false;
            }
        },

        playMobileContent(content, episode = null) {
            if (!content) return;

            // DO NOT Close mobile detail to show player - keep it open in background
            // this.mobileDetailOpen = false; 

            // Ensure a source is selected
            if (!this.activeSourceConfig) {
                if (this.sources && this.sources.length > 0) {
                    this.activeSourceConfig = this.sources[0];
                } else {
                    this.activeSourceConfig = { id: 'vidora', name: 'Vidora', urls: { movie: 'https://vidora.me/embed/movie/{id}', tv: 'https://vidora.me/embed/tv/{id}/{season}/{episode}' } };
                }
            }

            // Trigger playback mechanism
            // We use playFromModal because it handles the logic of setting up the iframe/player overlay
            // We need to ensure we pass the correct season/episode logic
            if (content.media_type === 'tv' && episode) {
                this.playFromModal(content, this.mobileSelectedSeason, episode.episode_number);
            } else {
                // Movie logic
                this.playFromModal(content);
            }
        },

        playFeatured() {
            const item = this.featuredContent;
            if (item) {
                this.playContent(item.id, item.media_type);
            }
        },

        playContent(id, type) {
            // Re-use existing play logic, possibly redirecting to the modal player
            const item = this.detailedItemsCache[id] || (this.content.find(c => c.id === id)) || this.mobileDetailContent;
            if (item) {
                // Determine if we should treat this as a mobile play or desktop play
                // If mobile menu is active or we are in mobile view, maybe use mobile logic?
                // For now, let's Stick to the original logic for desktop/featured: open the info modal.

                // Close mobile detail if open (logic from before, though now we have separate mobile function)
                if (this.mobileDetailOpen) {
                    this.playMobileContent(item);
                    return;
                }

                // Open standard modal and auto-play
                this.openInfoModal(item);

                // Auto-play trigger
                setTimeout(() => {
                    if (type === 'movie' && this.showInfoModal) {
                        this.playFromModal(item);
                    }
                }, 500);
            }
        },

        // Global Player Handler for F1 (via Event Bus)
        playGlobalVideo(url, isDirect = false) {
            console.log("Playing Global Video:", url);
            this.showInfoModal = true;
            this.isPlayingInModal = true;
            this.isDirectVideo = isDirect;
            this.isVideoJs = false; // Reset VideoJs flag
            this.modalPlayerUrl = isDirect ? '' : url;
            document.body.style.overflow = 'hidden';

            // Dispose VideoJS if exists to prevent conflicts
            if (this.videoJsPlayer) {
                this.videoJsPlayer.dispose();
                this.videoJsPlayer = null;
            }

            if (isDirect && url && url.includes('.m3u8')) {
                this.$nextTick(() => {
                    const video = document.getElementById('modalPlayerVideo');
                    if (!video) return;
                    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                        if (this.hls) this.hls.destroy();
                        this.hls = new Hls();
                        this.hls.loadSource(url);
                        this.hls.attachMedia(video);
                        this.hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), { once: true });
                    }
                });
            }
        },

        playPrivateVideo(item) {
            console.log("Playing Private Video:", item.title);

            // Check for Iframe Embed
            if (item.video_url && item.video_url.trim().startsWith('<iframe')) {
                const embedUrl = this.extractIframeSrc(item.video_url);
                if (!embedUrl) {
                    this.$dispatch('show-toast', { message: 'Invalid embed URL blocked.', type: 'error' });
                    return;
                }

                this.showInfoModal = true;
                this.isPlayingInModal = true;
                this.isDirectVideo = false;
                this.isVideoJs = false;
                this.isEmbed = false;
                this.embedCode = '';
                this.modalPlayerUrl = embedUrl;
                document.body.style.overflow = 'hidden';
                return;
            }

            const videoUrl = this.sanitizeMediaUrl(item.video_url);
            if (!videoUrl) {
                this.$dispatch('show-toast', { message: 'Invalid video URL blocked.', type: 'error' });
                return;
            }

            this.showInfoModal = true;
            this.isPlayingInModal = true;
            this.isDirectVideo = false; // We use the specific VideoJs container
            this.isVideoJs = true;
            this.isEmbed = false;
            this.embedCode = '';
            document.body.style.overflow = 'hidden';

            this.$nextTick(() => {
                this.initVideoJsPlayer(videoUrl);
            });
        },

        initVideoJsPlayer(url) {
            // CRITICAL FIX: Use native HTML5 video instead of Video.js for better compatibility
            // Video.js was causing issues on Windows devices, but native playback works perfectly

            if (this.videoJsPlayer) {
                this.videoJsPlayer.dispose();
                this.videoJsPlayer = null;
            }

            console.log(`Initializing native video player with URL: ${url}`);

            // Small timeout to ensure DOM is ready
            setTimeout(() => {
                const videoElement = document.getElementById('hls-player');
                if (!videoElement) {
                    console.error('Video element not found!');
                    this.$dispatch('show-toast', { message: 'Video player error. Please refresh.', type: 'error' });
                    return;
                }

                // Use native HTML5 video - no Video.js needed for simple MP4 files
                videoElement.src = url;
                videoElement.load();

                // Attempt autoplay
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.error('Autoplay failed:', error);
                        // Autoplay blocked by browser - user needs to click play
                    });
                }

                // Add error listener
                videoElement.onerror = (e) => {
                    console.error('Video playback error:', e);
                    const errorMsg = videoElement.error ?
                        `Video error: ${videoElement.error.message || 'Unknown error'}` :
                        'Video failed to load';
                    this.$dispatch('show-toast', { message: errorMsg, type: 'error' });
                };
            }, 100);
        },

        async checkAndBuildAddedForYou(retries = 10) {
            console.log(`checkAndBuildAddedForYou called. User present: ${!!this.user}`);

            if (!this.user) {
                // If user is missing but we have retries left, wait and try again.
                // Increased to 10 retries (5 seconds) to handle slower devices/networks.
                if (retries > 0) {
                    console.log(`User not found, retrying checkAndBuildAddedForYou in 500ms... (${retries} retries left)`);
                    setTimeout(() => this.checkAndBuildAddedForYou(retries - 1), 500);
                    return;
                }

                const container = document.getElementById('added-for-you-container');
                if (container) container.innerHTML = '';
                return;
            }

            // Fetch from DB using email
            try {
                const { data, error } = await db.getPrivateContent(this.user.email);

                if (error) { throw error; }

                if (data && data.length > 0) {
                    this.addedForYouItems = data.map(item => ({
                        ...item,
                        // If TMDB ID exists, use it as ID for modal to work with standard callbacks
                        // Otherwise construct a private ID
                        id: item.tmdb_id ? parseInt(item.tmdb_id) : 'private_' + item.id,
                        original_private_item: item, // Keep ref to original to access video_url later
                        media_type: item.media_type || 'movie'
                    }));

                    // Pre-populate cache so openInfoModal can find these items immediately
                    this.addedForYouItems.forEach(item => {
                        this.detailedItemsCache[item.id] = item;
                    });

                    this.buildAddedForYouRow();
                } else {
                    console.log("No private content found for user.");
                    const container = document.getElementById('added-for-you-container');
                    if (container) container.innerHTML = '';
                }
            } catch (err) {
                console.error("Error in checkAndBuildAddedForYou:", err);
            }
        },

        buildAddedForYouRow() {
            const container = document.getElementById('added-for-you-container');
            const rowElementId = 'added-for-you-scroll-row';
            if (!container) return;

            const itemsHTML = this.addedForYouItems.map(item => {
                const title = this.escapeHtml(item.title);
                // Use provided poster or fallback
                let posterPath = 'https://placehold.co/342x513/101010/FFF?text=Added+For+You';
                if (item.poster_path) {
                    posterPath = item.poster_path.startsWith('http') ? item.poster_path : (item.poster_path.startsWith('/') ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : item.poster_path);
                }
                posterPath = this.sanitizeMediaUrl(posterPath) || 'https://placehold.co/342x513/101010/FFF?text=Added+For+You';

                return `
                <div class="movie-item group cursor-pointer" @click="window.appInstance.handlePrivateItemClick('${item.id}')">
                    <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#222]">
                        <img src="${posterPath}" class="movie-item-img w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy" alt="${title}">
                        
                        <!-- Liquid Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p class="text-white font-bold leading-tight transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-black drop-shadow-md">
                                ${title}
                            </p>
                            <div class="flex items-center gap-2 mt-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                                <span class="text-[10px] bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">Private</span>
                                <span class="text-[10px] text-gray-300 border border-white/30 px-2 py-0.5 rounded-full backdrop-blur-sm">Play</span>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            const sectionHTML = `
        <div class="movies-section my-6 relative group/section animate-fade-in-up">
            <h2 class="movie-section-heading text-white">Added For You</h2>
            <div class="movies-row custom-scrollbar py-3" id="${rowElementId}">
                ${itemsHTML}
                <div class="flex-shrink-0 w-1"></div> </div>
        </div>`;
            container.innerHTML = sectionHTML;
            this.initScrollState(rowElementId);
        },

        handlePrivateItemClick(itemId) {
            // Find the item
            const item = this.addedForYouItems.find(i => i.id == itemId);
            if (item) {
                this.openInfoModal(item);
            }
        },

        // Computed property for selected F1 server name
        get selectedF1ServerName() {
            const server = this.availableF1Servers.find(s => s.id === this.selectedF1Server);
            return server ? server.name : 'Sky Sports F1 HD';
        },


        async signOut() {
            await auth.signOut();
            this.user = null;
            this.watchLaterItems = [];
            this.continueWatchingItems = [];
            window.location.reload();
        },

        async toggleWatchLater(item) {
            // Always update local storage first for immediate UI feedback
            const exists = this.watchLaterItems.some(i => i.id === item.id);
            if (exists) {
                this.watchLaterItems = this.watchLaterItems.filter(i => i.id !== item.id);
            } else {
                this.watchLaterItems.unshift(item);
            }
            this.watchLaterCount = this.watchLaterItems.length;
            localStorage.setItem('watchLater', JSON.stringify(this.watchLaterItems));

            // If logged in, sync with cloud
            if (this.user) {
                if (exists) {
                    await db.removeFromWatchLater(this.user, item.id);
                } else {
                    await db.addToWatchLater(this.user, item);
                }
            }
        },

        async doClearWatchLater() {
            // Clear Local
            this.watchLaterItems = [];
            this.watchLaterCount = 0;
            localStorage.removeItem('watchLater');
            this.showClearConfirm = false;

            // Clear Cloud if logged in
            if (this.user) {
                // Ideally we'd have a clearAll function in db.js but for now let's just clear local view and warn.
                // Since we don't have a batch delete, we rely on the local clear for now.
                // TODO: Implement batch delete in db.js for full sync
            }
        },


        // F1 Banner State (Updated to working URLs in the previous step)
        f1Banners: [
            { id: 1, title: '2025 F1 Season Opener: The Battle Begins', overview: 'Witness the first Grand Prix of the season live. Coverage includes practice, qualifying, and the final race.', backdrop: 'https://i.imgur.com/GzB1y4w.jpeg' },
            { id: 2, title: 'Formula 1 Live Stream', overview: 'Catch every lap, every overtake, and every moment of the race weekend from Sky Sports F1.', backdrop: 'https://i.imgur.com/pYtXm5d.jpeg' },
            { id: 3, title: 'Mid-Season Review: Champions and Challengers', overview: 'Expert analysis and highlights from the most dramatic races of the year so far. Featuring top drivers and team principals.', backdrop: 'https://i.imgur.com/Hn2M6oW.jpeg' },
            { id: 4, title: 'F1 Testing: Pre-Season Analysis', overview: 'Exclusive testing coverage and expert predictions before the first Grand Prix.', backdrop: 'https://i.imgur.com/qR8v21D.jpeg' },
        ],
        selectedF1Banner: null, // Holds the current static banner data

        // NEW STATE FOR AD BLOCKER POPUP
        showAdBlockerPopup: localStorage.getItem('adBlockerPopupDismissed') !== 'true',

        // Mobile Specific Data
        trendingMovies: [], // Distinct from 'content' to preserve desktop state if needed
        mobileAnimatedMovies: [],
        mobileActionMovies: [],
        mobileTrendingShows: [],
        mobileSciFiShows: [],
        mobileAnimatedShows: [],

        // Search Page Data
        searchCategories: [
            { id: 1, name: 'Action', genreId: 28, gradient: 'linear-gradient(135deg, #FF512F 0%, #DD2476 100%)' },
            { id: 2, name: 'Sci-Fi', genreId: 878, gradient: 'linear-gradient(135deg, #4A00E0 0%, #8E2DE2 100%)' },
            { id: 3, name: 'Comedy', genreId: 35, gradient: 'linear-gradient(135deg, #FFD89B 0%, #19547B 100%)' },
            { id: 4, name: 'Drama', genreId: 18, gradient: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)' },
            { id: 5, name: 'Romance', genreId: 10749, gradient: 'linear-gradient(135deg, #FF758C 0%, #FF7EB3 100%)' },
            { id: 6, name: 'Horror', genreId: 27, gradient: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)' },
            { id: 7, name: 'Animation', genreId: 16, gradient: 'linear-gradient(135deg, #FA8BFF 0%, #2BD2FF 100%)' },
            { id: 8, name: 'Documentary', genreId: 99, gradient: 'linear-gradient(135deg, #5F72BD 0%, #9b23ea 100%)' },
            { id: 9, name: 'Thriller', genreId: 53, gradient: 'linear-gradient(135deg, #000000 0%, #434343 100%)' },
            { id: 10, name: 'Kids & Family', genreId: 10751, gradient: 'linear-gradient(135deg, #FFA8A8 0%, #FCFF00 100%)' }
        ],
        searchCategoryResults: [],
        activeSearchCategory: null,
        showCategoryPage: false,
        activeCategoryGradient: '',
        categoryCriticallyAcclaimed: [],

        handleContextMenu(event, itemId) {
            console.log(`handleContextMenu called for itemId: ${itemId} `, event);
            const item = this.detailedItemsCache[itemId];
            if (item) {
                this.$store.contextMenu.item = JSON.parse(JSON.stringify(item)); // Deep copy
                this.$store.contextMenu.x = event.pageX;
                this.$store.contextMenu.y = event.pageY;
                this.$store.contextMenu.show = true;
            } else {
                console.warn(`Item ID ${itemId} not found in cache for context menu.`);
                this.$dispatch('show-toast', { message: 'Context menu error: Item details missing.', type: 'error' });
            }
        },
        initScrollState(rowId) { this.$nextTick(() => { try { const rE = document.getElementById(rowId); if (rE) { if (typeof this.scrollStates[rowId] === 'undefined') this.scrollStates[rowId] = { canScrollLeft: false, canScrollRight: false }; this.updateScrollState(rowId); if (!rE.hasAttribute('data-scroll-listener-added')) { rE.addEventListener('scroll', () => this.updateScrollState(rowId), { passive: true }); rE.setAttribute('data-scroll-listener-added', 'true') } } } catch (e) { console.error(`Error in initScrollState for ${rowId}: `, e) } }); },
        updateScrollState(rowId) { try { const rE = document.getElementById(rowId); if (rE) { const aS = rE.scrollLeft < 1, aE = rE.scrollLeft >= rE.scrollWidth - rE.clientWidth - 1; if (!this.scrollStates[rowId]) this.scrollStates[rowId] = {}; this.scrollStates[rowId].canScrollLeft = !aS; this.scrollStates[rowId].canScrollRight = !aE && (rE.scrollWidth > rE.clientWidth) } } catch (e) { console.error(`Error in updateScrollState for ${rowId}: `, e) } },
        scrollRow(rowId, direction) { const rE = document.getElementById(rowId); if (rE) { const sA = rE.clientWidth * .8; rE.scrollBy({ left: sA * direction, behavior: 'smooth' }); setTimeout(() => this.updateScrollState(rowId), 150) } }, // Increased timeout slightly for smoother updates
        isScrolledToStart(rowId) { return this.scrollStates[rowId] ? !this.scrollStates[rowId].canScrollLeft : true },
        isScrolledToEnd(rowId) { return this.scrollStates[rowId] ? !this.scrollStates[rowId].canScrollRight : true },

        async init() {
            console.log("App init started. Current tab:", this.currentTab); window.appInstance = this;

            // Initialize Supabase for F1
            const SUPABASE_URL = CONFIG.F1_SUPABASE_URL;
            const SUPABASE_KEY = CONFIG.F1_SUPABASE_KEY;
            this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

            // Fetch initial F1 data
            this.fetchChannels(); // Call without await to not block other init
            this.fetchF1Highlights(); // Fetch YouTube highlights

            // Auth Init
            // Auth Init
            this.user = await auth.getUser();
            this.checkAndBuildAddedForYou(); // Check on init
            auth.onAuthStateChange((event, session) => {
                this.user = session?.user || null;
                this.checkAndBuildAddedForYou(); // Check on auth change
            });

            // Select a random F1 banner on init
            const randomIndex = Math.floor(Math.random() * this.f1Banners.length);
            this.selectedF1Banner = this.f1Banners[randomIndex];

            // Always load from LocalStorage first (fast render & offline support)
            const sWL = localStorage.getItem('watchLater');
            if (sWL) {
                try { this.watchLaterItems = JSON.parse(sWL); this.watchLaterCount = this.watchLaterItems.length; }
                catch (e) { console.error("Error parsing watchLater", e); this.watchLaterItems = []; this.watchLaterCount = 0; }
            }

            const sCW = localStorage.getItem('continueWatching');
            if (sCW) {
                try { this.continueWatchingItems = JSON.parse(sCW); }
                catch (e) { console.error("Error parsing continueWatching", e); this.continueWatchingItems = []; }
            }

            // If logged in, fetch from Cloud and merge/update
            if (this.user) {
                // Load from Cloud
                const { data: wlData } = await db.getWatchLater(this.user);
                if (wlData && wlData.length > 0) {
                    // Merge strategy: Cloud wins or Union?
                    // For simplicity and consistency, let's say Cloud is the source of truth if available.
                    // But we also want to keep local items that might not be in cloud yet?
                    // Let's just use Cloud data to update Local state for now to ensure sync.
                    this.watchLaterItems = wlData;
                    this.watchLaterCount = this.watchLaterItems.length;
                    localStorage.setItem('watchLater', JSON.stringify(this.watchLaterItems));
                }

                const { data: cwData } = await db.getContinueWatching(this.user);
                if (cwData && cwData.length > 0) {
                    this.continueWatchingItems = cwData;
                    localStorage.setItem('continueWatching', JSON.stringify(this.continueWatchingItems));
                }
            }

            if (this.continueWatchingItems.length > 0) this.buildContinueWatchingRow();

            const uDSId = localStorage.getItem('defaultSource');
            if (typeof availableSources !== 'undefined' && availableSources.length > 0) { // Ensure availableSources is defined
                if (uDSId) this.activeSourceConfig = availableSources.find(s => s.id === uDSId && !s.isApiResponse);
                if (!this.activeSourceConfig) this.activeSourceConfig = availableSources.find(s => s.id === 'vidora' && !s.isApiResponse) || availableSources.find(s => !s.isApiResponse) || availableSources[0];
            }
            if (!this.activeSourceConfig || !this.activeSourceConfig.urls) { console.error("CRITICAL: No valid activeSourceConfig."); this.$dispatch('show-toast', { message: 'Streaming source error. Please check settings.', type: 'error' }); this.activeSourceConfig = { id: 'error_no_source', name: 'No Source Configured', urls: { movie: '', tv: '' } } } console.log("Active source:", this.activeSourceConfig ? this.activeSourceConfig.id : 'None');

            try {
                await this.fetchGenres(); // Fetch genres first as they might be needed by other functions
                await this.fetchAndBuildContent(); // This will also call buildMovieRows and potentially fetchTrendingTVShows
            } catch (e) {
                console.error("Error during initial load sequence:", e);
                this.$dispatch('show-toast', { message: 'Failed to load initial content. Check console.', type: 'error' });
                this.buildBannerSection(null); // Show placeholder banner
                this.buildMovieRows(); // Attempt to build rows, might show empty message
            }

            const hdr = document.getElementById('header'); if (hdr) window.addEventListener('scroll', () => hdr.classList.toggle('black-bg', window.scrollY > 10));


            // Mobile menu and search listeners
            this.$watch('mobileMenu', value => {
                if (value) document.body.style.overflow = 'hidden';
                else document.body.style.overflow = '';
            });
            this.$watch('searchQuery', value => {
                this.isSearching = value.length > 0;
                if (this.isSearching) this.performSearch();
            });
            // Search category page watcher
            this.$watch('showCategoryPage', value => {
                if (value) document.body.style.overflow = 'hidden';
                else document.body.style.overflow = '';
            });

            // Mobile Initialization
            if (window.innerWidth < 768) {
                this.fetchMobileData();
            }

            console.log("App init finished.");
        },

        async fetchMobileData() {
            // Fetch Trending Movies for Mobile Top 10
            try {
                const response = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${this.apiKey}`);
                const data = await response.json();
                this.trendingMovies = data.results || [];
                // Ensure they are in cache
                this.trendingMovies.forEach(item => {
                    item.media_type = 'movie';
                    this.detailedItemsCache[item.id] = item;
                });

                // FOR TESTING: Populate Continue Watching if empty so user sees the row
                if (this.continueWatchingItems.length === 0 && this.trendingMovies.length > 0) {
                    this.continueWatchingItems.push({
                        ...this.trendingMovies[0],
                        backdrop_path: this.trendingMovies[0].backdrop_path || this.trendingMovies[0].poster_path // Fallback if needed
                    });
                }

                // Fetch Animated Movies (Genre ID 16)
                const animRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&with_genres=16&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`);
                const animData = await animRes.json();
                this.mobileAnimatedMovies = animData.results || [];
                this.mobileAnimatedMovies.forEach(item => { item.media_type = 'movie'; this.detailedItemsCache[item.id] = item; });

                // Fetch Action Movies (Genre ID 28) - Strict
                const actionRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&with_genres=28&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`);
                const actionData = await actionRes.json();
                this.mobileActionMovies = actionData.results || [];
                this.mobileActionMovies.forEach(item => { item.media_type = 'movie'; this.detailedItemsCache[item.id] = item; });

                // Fetch Trending TV Shows
                const tvTrendRes = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${this.apiKey}`);
                const tvTrendData = await tvTrendRes.json();
                this.mobileTrendingShows = tvTrendData.results || [];
                this.mobileTrendingShows.forEach(item => { item.media_type = 'tv'; this.detailedItemsCache[item.id] = item; });

                // Fetch Sci-Fi & Fantasy TV (Genre ID 10765)
                const sciFiRes = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.apiKey}&with_genres=10765&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`);
                const sciFiData = await sciFiRes.json();
                this.mobileSciFiShows = sciFiData.results || [];
                this.mobileSciFiShows.forEach(item => { item.media_type = 'tv'; this.detailedItemsCache[item.id] = item; });

                // Fetch Animated Series (Genre ID 16)
                const animTVRes = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.apiKey}&with_genres=16&sort_by=popularity.desc&include_adult=false&include_video=false&page=1`);
                const animTVData = await animTVRes.json();
                this.mobileAnimatedShows = animTVData.results || [];
                this.mobileAnimatedShows.forEach(item => { item.media_type = 'tv'; this.detailedItemsCache[item.id] = item; });

            } catch (e) {
                console.error("Error fetching mobile trending:", e);
            }
        },

        // NEW FUNCTION TO DISMISS POPUP
        dismissAdBlockerPopup() {
            this.showAdBlockerPopup = false;
            localStorage.setItem('adBlockerPopupDismissed', 'true');
        },

        async fetchAndBuildContent() {
            console.log(`Fetching content for tab: ${this.currentTab}, page: ${this.currentPage} `);
            let apiUrl = '', mediaTypeForContent = this.currentTab === 'movies' ? 'movie' : 'tv';

            const trendingTVContainer = document.getElementById('trending-tv-shows-container');
            const dynamicRowsContainer = document.getElementById('dynamic-content-rows');
            if (dynamicRowsContainer) dynamicRowsContainer.innerHTML = '<div class="placeholder-message p-8 text-center">Loading content...</div>';
            if (trendingTVContainer && this.currentTab !== 'shows') trendingTVContainer.innerHTML = ''; // Clear trending if not on shows tab

            if (this.currentTab === 'movies') apiUrl = `https://api.themoviedb.org/3/movie/popular?api_key=${this.apiKey}&language=${this.language}&page=${this.currentPage}&include_adult=false`;
            else if (this.currentTab === 'shows') apiUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${this.apiKey}&language=${this.language}&page=${this.currentPage}&include_adult=false&with_networks=213&sort_by=popularity.desc`; // Example: Netflix shows
            else if (this.currentTab === 'f1' || this.currentTab === 'mylist' || this.currentTab === 'search') {
                // F1, My List, and Search views are handled by x-show/local data, no dynamic content fetching needed here
                return;
            }
            else { console.error("Unknown tab:", this.currentTab); if (dynamicRowsContainer) dynamicRowsContainer.innerHTML = '<div class="placeholder-message p-8 text-center">Invalid section selected.</div>'; this.buildBannerSection(null); return }

            try {
                const response = await fetch(apiUrl); console.log(`API Response for ${this.currentTab}: ${response.status}`);
                if (!response.ok) { const eD = await response.json().catch(() => ({ status_message: `HTTP ${response.status}` })); throw new Error(eD.status_message || `API Error ${response.status}`) }
                const data = await response.json();
                this.content = (data.results || []).map(i => ({ ...i, media_type: mediaTypeForContent }));
                this.totalPages = data.total_pages > 500 ? 500 : (data.total_pages || 1);
                this.content.forEach(i => { if (i.id) this.detailedItemsCache[i.id] = { ...(this.detailedItemsCache[i.id] || {}), ...i } });
            } catch (e) {
                console.error(`Error in fetchAndBuildContent (${this.currentTab}):`, e);
                this.$dispatch('show-toast', { message: e.message || 'Failed to load content.', type: 'error' });
                this.content = []; this.totalPages = 1;
            }

            if (this.content.length > 0 && this.currentPage === 1) await this.updateBannerWithRandomItem();
            else if (this.currentPage === 1) this.buildBannerSection(null); // Show placeholder if no content for banner

            // Only build movie rows for movies tab, not for shows tab (user requested removal of "Popular Series" row)
            if (this.currentTab !== 'shows') {
                this.buildMovieRows(); // This will build based on this.content
            } else {
                // FIX: Clear the "Loading content..." text since we aren't building standard rows for TV Shows
                const dynamicRowsContainer = document.getElementById('dynamic-content-rows');
                if (dynamicRowsContainer) dynamicRowsContainer.innerHTML = '';
            }

            if (this.currentTab === 'shows') await this.fetchTrendingTVShows(); // Fetch trending only for TV shows tab
        },

        async fetchTrendingTVShows() {
            console.log("Fetching Trending TV Shows...");
            const url = `https://api.themoviedb.org/3/trending/tv/week?api_key=${this.apiKey}&language=${this.language}&page=1`;
            const container = document.getElementById('trending-tv-shows-container');
            if (container) container.innerHTML = '<div class="placeholder-message p-8 text-center">Loading trending shows...</div>';

            try {
                const response = await fetch(url);
                if (!response.ok) { const eD = await response.json().catch(() => ({ status_message: `HTTP ${response.status}` })); throw new Error(eD.status_message || `Trending TV API Error ${response.status}`) }
                const data = await response.json();
                const trendingShows = (data.results || []).map(i => ({ ...i, media_type: 'tv' })).slice(0, 20); // Limit to 20
                trendingShows.forEach(i => { if (i.id) this.detailedItemsCache[i.id] = { ...(this.detailedItemsCache[i.id] || {}), ...i } });
                console.log(`Fetched ${trendingShows.length} trending TV shows.`);
                this.buildTrendingTVShowsRow(trendingShows);
            } catch (e) {
                console.error('Error fetching trending TV shows:', e);
                this.$dispatch('show-toast', { message: e.message || 'Failed to fetch trending shows.', type: 'error' });
                if (container) container.innerHTML = '<div class="placeholder-message p-8 text-center">Could not load trending shows.</div>';
            }
        },

        buildTrendingTVShowsRow(shows) {
            const container = document.getElementById('trending-tv-shows-container');
            const rowElementId = 'trending-tv-scroll-row';
            if (!container) { console.error("#trending-tv-shows-container not found!"); return }
            if (!shows || shows.length === 0) { container.innerHTML = ''; if (this.scrollStates[rowElementId]) delete this.scrollStates[rowElementId]; return }

            const itemsHTML = shows.map(item => {
                const title = item.name || item.title || 'Untitled TV Show';
                const posterPath = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'https://placehold.co/342x513/181818/4D4D4D?text=N/A';
                if (item.id) this.detailedItemsCache[item.id] = { ...this.detailedItemsCache[item.id], ...item };

                return `
                <div class="movie-item group cursor-pointer" @click="window.appInstance.openInfoModalById(${item.id})">
                    <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#222]">
                        <img src="${posterPath}" class="movie-item-img w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy" alt="${title.replace(/"/g, '&quot;')}">
                        
                        <!-- Liquid Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p class="text-white font-bold leading-tight transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-black drop-shadow-md">
                                ${title.replace(/"/g, '&quot;')}
                            </p>
                            <div class="flex items-center gap-2 mt-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                                <span class="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-bold">Play</span>
                                <span class="text-[10px] text-gray-300 border border-white/30 px-2 py-0.5 rounded-full backdrop-blur-sm">Info</span>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            const sectionHTML = `
        <div class="movies-section my-6 relative group/section">
            <h2 class="movie-section-heading">Trending TV Shows</h2>
            <div class="movies-row custom-scrollbar py-3" id="${rowElementId}">
                ${itemsHTML}
                <div class="flex-shrink-0 w-1"></div> </div>
            <button @click="scrollRow('${rowElementId}',-1)" :disabled="isScrolledToStart('${rowElementId}')" aria-label="Scroll Left" class="scroll-arrow absolute left-1 sm:left-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
            <button @click="scrollRow('${rowElementId}',1)" :disabled="isScrolledToEnd('${rowElementId}')" aria-label="Scroll Right" class="scroll-arrow absolute right-1 sm:right-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
        </div>`;
            container.innerHTML = sectionHTML;
            this.initScrollState(rowElementId);
        },

        // ... (rest of the functions remain the same as the previous correct version)

        async fetchGenres() {
            const movieUrl = `https://api.themoviedb.org/3/genre/movie/list?api_key=${this.apiKey}&language=${this.language}`;
            const tvUrl = `https://api.themoviedb.org/3/genre/tv/list?api_key=${this.apiKey}&language=${this.language}`;
            try {
                const [movieResponse, tvResponse] = await Promise.all([fetch(movieUrl), fetch(tvUrl)]);
                const movieData = movieResponse.ok ? await movieResponse.json() : { genres: [] };
                const tvData = tvResponse.ok ? await tvResponse.json() : { genres: [] };
                const combinedGenres = [...(movieData.genres || []), ...(tvData.genres || [])];
                // Remove duplicates by ID
                this.genres = combinedGenres.filter((genre, index, self) =>
                    index === self.findIndex((g) => g.id === genre.id)
                );
                console.log("Fetched genres:", this.genres.length);
            } catch (error) {
                console.error('Error fetching genres:', error); this.genres = [];
                this.$dispatch('show-toast', { message: 'Could not load genre information.', type: 'error' });
            }
        },
        getGenreNames(genreIds) {
            if (!genreIds || !this.genres || !this.genres.length) return 'N/A';
            return genreIds.map(id => {
                const genre = this.genres.find(g => g.id === id);
                return genre ? genre.name : null;
            }).filter(Boolean).join(', ') || 'N/A';
        },
        getMaturityRating(item) {
            if (!item) return 'N/A';
            if (item.adult) return '18+';
            if (item.media_type === 'tv' && item.content_ratings && item.content_ratings.results) {
                const usRatingObj = item.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                if (usRatingObj && usRatingObj.rating && usRatingObj.rating.trim() !== "") return usRatingObj.rating;
            }
            if (item.media_type === 'movie' && item.release_dates && item.release_dates.results) {
                const usRelease = item.release_dates.results.find(r => r.iso_3166_1 === 'US');
                if (usRelease && usRelease.release_dates && usRelease.release_dates.length > 0) {
                    const ratingOrder = [3, 5, 4]; // Premiere, Theatrical (limited), Theatrical
                    for (const type of ratingOrder) {
                        const releaseDateEntry = usRelease.release_dates.find(rd => rd.type === type && rd.certification && rd.certification.trim() !== "");
                        if (releaseDateEntry) return releaseDateEntry.certification;
                    }
                    const anyCertification = usRelease.release_dates.find(rd => rd.certification && rd.certification.trim() !== "");
                    if (anyCertification) return anyCertification.certification;
                }
            }
            if (item.media_type === 'tv') return 'TV-MA'; // Default for TV if no specific US rating
            return 'NR'; // Not Rated or Not Available
        },
        async updateBannerWithRandomItem() {
            let retries = 0; const maxRetries = 5;
            while (retries < maxRetries) {
                if (!this.content || this.content.length === 0) { this.buildBannerSection(null); return; }
                const randomIndex = Math.floor(Math.random() * this.content.length);
                const randomItemSummary = this.content[randomIndex];
                const mediaTypeForBanner = randomItemSummary.media_type || (this.currentTab === 'movies' ? 'movie' : 'tv');
                const success = await this.fetchBannerMovieDetails(randomItemSummary.id, mediaTypeForBanner);
                if (success) return;
                retries++;
            }
            // Fallback to first item if random fails after retries
            if (!this.bannerMovie && this.content && this.content.length > 0) {
                const firstItem = this.content[0];
                const mediaTypeForBanner = firstItem.media_type || (this.currentTab === 'movies' ? 'movie' : 'tv');
                await this.fetchBannerMovieDetails(firstItem.id, mediaTypeForBanner);
            } else if (!this.bannerMovie) { this.buildBannerSection(null); } // Still no banner, show placeholder
        },
        async fetchBannerMovieDetails(itemId, itemType) {
            if (!itemId || !itemType) { this.buildBannerSection(null); return false; }
            const url = `https://api.themoviedb.org/3/${itemType}/${itemId}?api_key=${this.apiKey}&append_to_response=images,videos,credits,external_ids,content_ratings,release_dates&language=${this.language}`;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch banner details (status: ${response.status}) for ${itemType}/${itemId}`);
                const data = await response.json();
                if (data && data.id && (data.backdrop_path || data.poster_path) && (data.title || data.name)) {
                    this.bannerMovie = data; this.bannerMovie.media_type = itemType;
                    // Ensure genres are populated if missing from detailed fetch but present in summary
                    if ((!this.bannerMovie.genres || this.bannerMovie.genres.length === 0) && this.bannerMovie.genre_ids && this.genres.length > 0) {
                        this.bannerMovie.genres = this.bannerMovie.genre_ids.map(id => this.genres.find(g => g.id === id)).filter(Boolean);
                    }
                    this.buildBannerSection(this.bannerMovie); return true;
                } else { this.buildBannerSection(null); return false; } // No valid data to build banner
            } catch (error) {
                console.error(`Error fetching banner details for ${itemType}/${itemId}:`, error);
                this.buildBannerSection(null); return false; // Show placeholder on error
            }
        },
        initiateBannerTrailerPlay() {
            if (this.currentTab === 'f1') return; // Disable hover play for F1 page
            if (window.innerWidth < 768) return; // Disable on mobile
            if (this.bannerHoverTimeout) clearTimeout(this.bannerHoverTimeout);
            if (this.bannerMovie && (this.bannerMovie.videos || this.bannerMovie.id)) {
                this.bannerHoverTimeout = setTimeout(() => this.playBannerTrailer(), 1000); // 1s delay
            }
        },
        cancelBannerTrailerPlayAndClear() {
            if (this.currentTab === 'f1') return; // Disable hover play for F1 page
            if (this.bannerHoverTimeout) clearTimeout(this.bannerHoverTimeout);
            this.clearBannerTrailer();
        },
        async playBannerTrailer() {
            if (!this.bannerMovie || !this.bannerMovie.id || this.bannerTrailerLoaded || this.currentTab === 'f1') return;
            if (window.innerWidth < 768) return; // double check for mobile
            const bannerSection = document.getElementById('banner-section');
            if (!bannerSection) return;

            let videos;
            // Custom trailer for Stranger Things
            if (this.bannerMovie.id === 66732) {
                videos = [{ key: 'e0Eo0D038rQ', site: 'YouTube', type: 'Trailer', official: true }];
            } else {
                // Fetch videos from TMDB for other content
                videos = this.bannerMovie.videos?.results;
                if (!videos) {
                    const videosUrl = `https://api.themoviedb.org/3/${this.bannerMovie.media_type}/${this.bannerMovie.id}/videos?api_key=${this.apiKey}&language=en`;
                    try {
                        const response = await fetch(videosUrl);
                        const videoData = await response.json();
                        videos = videoData.results;
                        if (this.bannerMovie.videos === undefined) this.bannerMovie.videos = videoData;
                    } catch (e) { console.error("Error fetching videos for banner trailer", e); videos = []; }
                }
            }

            const officialTrailer = videos?.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official);
            const trailer = officialTrailer || videos?.find(v => v.site === 'YouTube' && v.type === 'Trailer');
            if (trailer && trailer.key) {
                bannerSection.classList.add('trailer-active');
                const trailerOverlay = document.getElementById('banner-trailer-overlay');
                if (trailerOverlay) {
                    trailerOverlay.innerHTML = `<iframe id="banner-iframe" src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&iv_load_policy=3&loop=1&playlist=${trailer.key}&modestbranding=1&enablejsapi=1&origin=${window.location.origin}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Banner Trailer"></iframe>`;

                    // Remove existing button if any
                    const existingBtn = document.getElementById('banner-audio-btn');
                    if (existingBtn) existingBtn.remove();

                    // Create and append audio button to bannerSection so it sits on top of z-index layers
                    const btn = document.createElement('button');
                    btn.id = 'banner-audio-btn';
                    btn.className = "absolute bottom-32 right-12 z-[60] p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full border border-white/20 text-white transition group pointer-events-auto cursor-pointer";
                    btn.onclick = () => window.appInstance.toggleBannerAudio();
                    btn.innerHTML = `
                        <svg id="icon-muted" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                        <svg id="icon-unmuted" class="w-6 h-6 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    `;
                    bannerSection.appendChild(btn);

                    this.bannerTrailerLoaded = true;
                    this.isBannerMuted = true; // Track state
                }
            } else { bannerSection.classList.remove('trailer-active'); }
        },
        toggleBannerAudio() {
            const iframe = document.getElementById('banner-iframe');
            const btn = document.getElementById('banner-audio-btn');
            if (!iframe) return;

            this.isBannerMuted = !this.isBannerMuted;
            const command = this.isBannerMuted ? 'mute' : 'unMute';
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command }), '*');

            if (btn) {
                const iconMuted = btn.querySelector('#icon-muted');
                const iconUnmuted = btn.querySelector('#icon-unmuted');
                if (this.isBannerMuted) {
                    iconMuted.classList.remove('hidden');
                    iconUnmuted.classList.add('hidden');
                } else {
                    iconMuted.classList.add('hidden');
                    iconUnmuted.classList.remove('hidden');
                }
            }
        },
        clearBannerTrailer() {
            const bannerSection = document.getElementById('banner-section');
            if (bannerSection) bannerSection.classList.remove('trailer-active');
            const trailerOverlay = document.getElementById('banner-trailer-overlay');
            if (trailerOverlay) trailerOverlay.innerHTML = ''; // Clear iframe to stop audio

            // Remove audio button
            const btn = document.getElementById('banner-audio-btn');
            if (btn) btn.remove();

            this.bannerTrailerLoaded = false;
            this.isBannerMuted = true;
        },
        async searchContentDropdown() {
            if (!this.searchQuery || this.searchQuery.trim().length < 2) {
                this.searchResults = []; this.isSearching = false; return;
            }
            this.isSearching = true;
            const url = `https://api.themoviedb.org/3/search/multi?api_key=${this.apiKey}&query=${encodeURIComponent(this.searchQuery.trim())}&language=${this.language}&page=1&include_adult=false`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                this.searchResults = (data.results || [])
                    .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path) // Ensure it's a movie/show with a poster
                    .slice(0, 7); // Limit to 7 results
                // Cache search results for modal opening
                this.searchResults.forEach(item => {
                    if (item.id && !this.detailedItemsCache[item.id]) {
                        this.detailedItemsCache[item.id] = item;
                    } else if (item.id) { // Update if already exists
                        this.detailedItemsCache[item.id] = { ...this.detailedItemsCache[item.id], ...item };
                    }
                });
            } catch (error) {
                console.error('Error searching content for dropdown:', error); this.searchResults = [];
                this.$dispatch('show-toast', { message: 'Search failed.', type: 'error' });
            } finally {
                // Set isSearching to false only if query is too short, otherwise keep true until results are shown or not.
                // This logic might need adjustment based on desired UX for "No results found" message.
                if (this.searchQuery.trim().length < 2) { this.isSearching = false; }
            }
        },
        async openCategoryPage(genreId, genreName, gradient) {
            console.log(`Opening category page: ${genreName} (Genre ID: ${genreId})`);
            this.activeSearchCategory = genreName;
            this.activeCategoryGradient = gradient;
            this.searchCategoryResults = [];
            this.categoryCriticallyAcclaimed = [];
            this.showCategoryPage = true;

            try {
                // Fetch both movies and TV shows for the genre (trending)
                const [moviesRes, tvRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&with_genres=${genreId}&sort_by=popularity.desc&include_adult=false&page=1`),
                    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${this.apiKey}&with_genres=${genreId}&sort_by=popularity.desc&include_adult=false&page=1`)
                ]);

                const moviesData = await moviesRes.json();
                const tvData = await tvRes.json();

                // Combine and mark media types
                const movies = (moviesData.results || []).slice(0, 10).map(item => ({ ...item, media_type: 'movie' }));
                const tvShows = (tvData.results || []).slice(0, 8).map(item => ({ ...item, media_type: 'tv' }));

                this.searchCategoryResults = [...movies, ...tvShows];

                // Fetch critically acclaimed (high rated) content
                const criticallyAcclaimedRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${this.apiKey}&with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=1000&include_adult=false&page=1`);
                const criticallyAcclaimedData = await criticallyAcclaimedRes.json();
                this.categoryCriticallyAcclaimed = (criticallyAcclaimedData.results || []).slice(0, 10).map(item => ({ ...item, media_type: 'movie' }));

                // Cache results
                [...this.searchCategoryResults, ...this.categoryCriticallyAcclaimed].forEach(item => {
                    if (item.id) this.detailedItemsCache[item.id] = item;
                });

                console.log(`Found ${this.searchCategoryResults.length} trending and ${this.categoryCriticallyAcclaimed.length} acclaimed results for ${genreName}`);
            } catch (error) {
                console.error('Error loading category page:', error);
                this.$dispatch('show-toast', { message: 'Failed to load category content.', type: 'error' });
                this.searchCategoryResults = [];
                this.categoryCriticallyAcclaimed = [];
            }
        },
        changePage(page) {
            if (page < 1 || (this.totalPages > 0 && page > this.totalPages)) return;
            this.currentPage = page; this.fetchAndBuildContent();
            const moviesCont = document.getElementById('movies-cont');
            if (moviesCont) { window.scrollTo({ top: moviesCont.offsetTop - 80, behavior: 'smooth' }); }
            else { window.scrollTo({ top: 0, behavior: 'smooth' }); }
        },
        async openInfoModal(itemSummary) {
            // Redirect to mobile detail if on mobile view
            if (window.innerWidth < 768) {
                this.openMobileDetail(itemSummary);
                return;
            }
            console.log("openInfoModal received itemSummary:", JSON.parse(JSON.stringify(itemSummary)));
            if (!itemSummary || typeof itemSummary.id === 'undefined') {
                console.error("openInfoModal: Invalid itemSummary provided or ID is missing.", itemSummary);
                this.$dispatch('show-toast', { message: 'Cannot load details: Invalid item data.', type: 'error' });
                return;
            }


            // CRITICAL FIX: Reset ALL modal states immediately to prevent race conditions
            // Clear any pending delayed reset from previous close
            if (this.modalCloseTimeout) {
                clearTimeout(this.modalCloseTimeout);
                this.modalCloseTimeout = null;
            }

            // This prevents issues when reopening modal after playback
            this.isPlayingInModal = false;
            this.modalPlayerUrl = '';
            this.isVideoJs = false;
            this.isEmbed = false;
            this.embedCode = '';
            this.isDirectVideo = false;
            // DON'T set modalContent = null here! Keep old content while loading new
            // This prevents blank screen while fetching
            this.loadingModal = true; // Add loading flag instead
            this.episodesForModal = [];
            this.modalSelectedSeason = 1;
            this.modalSelectedEpisode = null;


            // Now show the modal (it will show old content or loading state)
            this.showInfoModal = true;
            document.body.style.overflow = 'hidden';

            if (itemSummary.original_private_item && !itemSummary.tmdb_id) {
                // CASE: Private Item with NO TMDB ID (Custom Content)
                console.log("openInfoModal: Opening private item (Custom Content). Skipping TMDB fetch.");

                // Construct basic modal content
                this.modalContent = {
                    ...itemSummary,
                    genres: [],
                    videos: { results: [] },
                    credits: { cast: [], crew: [] },
                    similar: { results: [] },
                    media_type: itemSummary.media_type || 'movie',
                    runtime: null,
                    release_date: itemSummary.year ? `${itemSummary.year}-01-01` : (itemSummary.release_date || itemSummary.created_at),
                    vote_average: itemSummary.vote_average || 0,
                    // Ensure these are explicitly set if available
                    cast: itemSummary.cast_members || [],
                    logo_path: itemSummary.logo_path || null,
                    trailer_url: itemSummary.trailer_url || null,
                    trailer_urls: itemSummary.trailer_urls || [],
                    backdrop_path: itemSummary.backdrop_path || null
                };

                // Map 'cast_members' array to 'credits.cast' object structure for dual support (some UI parts might use credits.cast)
                if (this.modalContent.cast && this.modalContent.cast.length > 0) {
                    this.modalContent.credits.cast = this.modalContent.cast.map((name, index) => ({ id: index, name: name, profile_path: null }));
                }

                // Handle Trailer URLs (Multiple) -> Convert to videos.results format for UI
                const trailers = this.modalContent.trailer_urls && this.modalContent.trailer_urls.length > 0
                    ? this.modalContent.trailer_urls
                    : (this.modalContent.trailer_url ? [this.modalContent.trailer_url] : []);

                if (trailers.length > 0) {
                    trailers.forEach((url, index) => {
                        const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                        if (ytMatch && ytMatch[1]) {
                            this.modalContent.videos.results.push({
                                id: 'custom-trailer-' + index,
                                iso_639_1: 'en',
                                key: ytMatch[1],
                                name: index === 0 ? 'Official Trailer' : `Trailer ${index + 1}`,
                                site: 'YouTube',
                                type: 'Trailer'
                            });
                        }
                    });
                }
                // Ensure detailedItemsCache is updated so player can find it
                this.detailedItemsCache[itemSummary.id] = this.modalContent;

                // Reset episode states for movies
                this.episodesForModal = [];
                this.modalSelectedSeason = 1;
                this.modalSelectedEpisode = null;

                // Done loading
                this.loadingModal = false;
                return;
            }

            try {
                // Determine media_type. If it's missing from itemSummary, try to infer or default.
                const mediaType = itemSummary.media_type || (itemSummary.title && !itemSummary.first_air_date && !itemSummary.name ? 'movie' : 'tv');
                if (!mediaType) { // Should not happen if itemSummary is from TMDB search/discover
                    throw new Error("Cannot determine media type for item ID: " + itemSummary.id);
                }
                console.log(`openInfoModal: Determined mediaType as '${mediaType}' for item ID ${itemSummary.id}`);

                let appendToResponseItems = ['credits', 'images', 'videos', 'external_ids', 'similar'];
                if (mediaType === 'tv') { appendToResponseItems.push('content_ratings', 'aggregate_credits'); }
                else { appendToResponseItems.push('release_dates'); } // For movies
                const appendToResponseStr = appendToResponseItems.join(',');
                const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${itemSummary.id}?api_key=${this.apiKey}&append_to_response=${appendToResponseStr}&language=${this.language}`;

                console.log("Fetching full details from:", detailsUrl);
                const response = await fetch(detailsUrl);
                if (!response.ok) throw new Error(`Failed to fetch details (TMDB status: ${response.status}) for ${mediaType}/${itemSummary.id}`);

                let detailedData = await response.json();
                detailedData.media_type = mediaType; // Ensure media_type is part of the detailed data

                // Merge private item data if it exists (e.g., this was a TMDB item added to private library)
                if (itemSummary.original_private_item) {
                    detailedData.original_private_item = true;
                    // Merge Metadata Overrides
                    if (itemSummary.title) detailedData.title = itemSummary.title;
                    if (itemSummary.name) detailedData.name = itemSummary.name;
                    if (itemSummary.overview) detailedData.overview = itemSummary.overview;
                    if (itemSummary.backdrop_path) detailedData.backdrop_path = itemSummary.backdrop_path;
                    if (itemSummary.poster_path) detailedData.poster_path = itemSummary.poster_path;
                    if (itemSummary.logo_path) detailedData.logo_path = itemSummary.logo_path;
                    if (itemSummary.year) detailedData.release_date = `${itemSummary.year}-01-01`;

                    // Merge Cast (Overrides TMDB Cast if present)
                    if (itemSummary.cast_members && itemSummary.cast_members.length > 0) {
                        detailedData.credits = detailedData.credits || { cast: [], crew: [] };
                        detailedData.credits.cast = itemSummary.cast_members.map((name, index) => ({
                            id: index,
                            name: name,
                            profile_path: null
                        }));
                        detailedData.cast = itemSummary.cast_members; // Direct support
                    }

                    // Merge Trailer (Appends or Overrides?) -> Let's append custom trailer to videos
                    // Merge Trailers (Multiple)
                    const customTrailers = itemSummary.trailer_urls && itemSummary.trailer_urls.length > 0
                        ? itemSummary.trailer_urls
                        : (itemSummary.trailer_url ? [itemSummary.trailer_url] : []);

                    if (customTrailers.length > 0) {
                        detailedData.videos = detailedData.videos || { results: [] };

                        // Add in reverse order so the first one ends up at the very start (unshift)
                        // Or iterate normal and unshift one by one (result: last one is first).
                        // Better: iterate reverse to keep order [1, 2, 3] -> unshift 3, unshift 2, unshift 1 -> [1, 2, 3]
                        [...customTrailers].reverse().forEach((url, index) => {
                            const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                            if (ytMatch && ytMatch[1]) {
                                detailedData.videos.results.unshift({
                                    id: 'custom-trailer-' + index, // Note: index here is from reverse loop, but unique enough
                                    iso_639_1: 'en',
                                    key: ytMatch[1],
                                    name: 'Official Trailer', // Simple name, or maybe enumerate?
                                    site: 'YouTube',
                                    type: 'Trailer'
                                });
                            }
                        });
                    }
                }

                console.log("Full details fetched for modalContent:", JSON.parse(JSON.stringify(detailedData)));

                // Populate genres if they are missing in detailedData but available in itemSummary or global genres list
                if ((!detailedData.genres || detailedData.genres.length === 0) && itemSummary.genre_ids && this.genres.length > 0) {
                    detailedData.genres = itemSummary.genre_ids.map(id => this.genres.find(g => g.id === id) || { id: id, name: "Unknown" });
                } else if (!detailedData.genres) {
                    detailedData.genres = [];
                }

                if (mediaType === 'tv') {
                    // Filter seasons: only those with season_number > 0 and some episodes
                    detailedData.seasons_list = detailedData.seasons ? detailedData.seasons.filter(s => s.season_number > 0 && s.episode_count > 0) : [];
                    if (detailedData.seasons_list.length > 0) {
                        this.modalSelectedSeason = detailedData.seasons_list[0].season_number; // Default to first valid season
                    } else if (detailedData.number_of_seasons > 0) { // If API says there are seasons but provides no details
                        this.modalSelectedSeason = 1; // Default to season 1
                        // Create a placeholder seasons_list if TMDB doesn't provide one but indicates seasons exist
                        detailedData.seasons_list = Array.from({ length: detailedData.number_of_seasons }, (_, i) => ({ season_number: i + 1, name: `Season ${i + 1}`, episode_count: 0 /* unknown */ }));
                    } else { // No seasons at all
                        this.modalSelectedSeason = 1; detailedData.seasons_list = [];
                    }
                    this.modalContent = detailedData; // Set modalContent after processing seasons
                    // Fetch episodes only if there are seasons to fetch for
                    if (detailedData.seasons_list.length > 0 || detailedData.number_of_seasons > 0) { // Second condition for placeholder seasons
                        await this.fetchEpisodesForModal(detailedData.id, this.modalSelectedSeason);
                    } else { this.episodesForModal = []; this.modalSelectedEpisode = null; }
                } else { // Movie
                    this.modalContent = detailedData; this.episodesForModal = [];
                    this.modalSelectedSeason = 1; this.modalSelectedEpisode = null; // Not applicable but set defaults
                }
                // Update cache with full details
                if (this.modalContent && this.modalContent.id) {
                    this.detailedItemsCache[this.modalContent.id] = JSON.parse(JSON.stringify(this.modalContent));
                }

                // Done loading
                this.loadingModal = false;

            } catch (error) {
                console.error("Error in openInfoModal:", error);
                this.$dispatch('show-toast', { message: `Could not load details: ${error.message || 'Unknown error'}.`, type: 'error' });
                this.loadingModal = false; // Reset loading state on error
                this.closeInfoModal(); // Close modal on error
            }
        },
        openInfoModalById(itemId) {
            console.log(`openInfoModalById called with itemId: ${itemId}`);
            const item = this.detailedItemsCache[itemId];
            if (item) {
                console.log("Item found in cache for openInfoModalById:", JSON.parse(JSON.stringify(item)));
                this.openInfoModal(item); // Pass the cached (potentially summary) item
            } else {
                // Fallback: try to fetch minimal info if not in cache then open modal
                // This is a basic fallback, ideally items are always in cache from row builds
                console.warn(`Item ID ${itemId} not found in detailedItemsCache. Attempting a quick fetch.`);
                // Determine media type if possible (this is tricky without more info)
                // For now, just show an error. A more robust solution would require knowing the media_type.
                this.$dispatch('show-toast', { message: 'Details not available for this item. Please refresh.', type: 'error' });
            }
        },
        closeInfoModal() {
            console.log("closeInfoModal called.");

            if (this.isDirectVideo) {
                this.stopStream(); // Handle HLS cleanup
                return; // stopStream handles closing the modal state
            }

            if (this.videoJsPlayer) {
                this.videoJsPlayer.dispose();
                this.videoJsPlayer = null;
            }
            this.isVideoJs = false;
            this.isEmbed = false;
            this.embedCode = '';

            // If we are in mobile mode, we only need to close the player overlay
            if (this.mobileDetailOpen) {
                if (this.isPlayingInModal) {
                    const modalPlayerIframe = document.getElementById('modalPlayerIframeNtflx');
                    if (modalPlayerIframe) {
                        console.log("Stopping player by setting src to about:blank");
                        modalPlayerIframe.src = 'about:blank';
                    }
                    this.isPlayingInModal = false;
                    this.modalPlayerUrl = '';
                    // Ensure body scroll is restored IF needed, but mobile detail usually keeps it locked?
                    // Actually mobile detail handles its own scroll.
                }
                return; // Stay in mobile detail view
            }

            // Standard Desktop Logic
            this.showInfoModal = false;
            document.body.style.overflow = '';
            if (this.isPlayingInModal) {
                const modalPlayerIframe = document.getElementById('modalPlayerIframeNtflx');
                if (modalPlayerIframe) {
                    console.log("Stopping player by setting src to about:blank");
                    modalPlayerIframe.src = 'about:blank'; // Stop video playback
                }
            }
            this.isPlayingInModal = false;
            this.modalPlayerUrl = '';

            // Delay resetting modalContent to allow animations to finish smoothly
            this.modalCloseTimeout = setTimeout(() => {
                if (!this.showInfoModal) { // Check if modal is still closed
                    this.modalContent = null; this.episodesForModal = [];
                    this.modalSelectedSeason = 1; this.modalSelectedEpisode = null;
                }
                this.modalCloseTimeout = null; // Clear timeout reference
            }, 300); // Match transition duration
        },
        async fetchEpisodesForModal(showId, seasonNumber) {
            console.log(`fetchEpisodesForModal called for showId: ${showId}, seasonNumber: ${seasonNumber}`);
            // Ensure modalContent is set and matches the showId before proceeding
            if (!showId || !seasonNumber || !this.modalContent || this.modalContent.id !== parseInt(showId)) {
                console.warn("fetchEpisodesForModal: Pre-conditions not met or showId mismatch.", { showId, seasonNumber, modalContentId: this.modalContent?.id });
                this.loadingEpisodes = false; return;
            }
            this.loadingEpisodes = true; this.episodesForModal = []; // Clear previous episodes
            this.modalSelectedSeason = parseInt(seasonNumber); // Update selected season
            try {
                const episodesUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${this.modalSelectedSeason}?api_key=${this.apiKey}&language=${this.language}`;
                console.log("Fetching episodes from:", episodesUrl);
                const response = await fetch(episodesUrl);
                if (!response.ok) throw new Error(`Failed to fetch episodes (status: ${response.status})`);
                const data = await response.json();
                this.episodesForModal = data.episodes || [];
                console.log(`Fetched ${this.episodesForModal.length} episodes for S${this.modalSelectedSeason}`);
                // Set default selected episode if episodes are found
                if (this.episodesForModal.length > 0) {
                    // If current modalSelectedEpisode is not in the new list, default to the first one
                    if (!this.modalSelectedEpisode || !this.episodesForModal.find(ep => ep.episode_number === this.modalSelectedEpisode)) {
                        this.modalSelectedEpisode = this.episodesForModal[0].episode_number;
                    }
                } else { this.modalSelectedEpisode = null; } // No episodes, no selected episode
            } catch (error) {
                console.error(`Error fetching S${this.modalSelectedSeason} episodes for show ${showId}:`, error);
                this.episodesForModal = []; // Clear on error
                this.$dispatch('show-toast', { message: `Could not load S${this.modalSelectedSeason} episodes.`, type: 'error' });
            } finally { this.loadingEpisodes = false; }
        },
        getSourceEmbedUrl(sourceConfig, type, params) {
            console.log("getSourceEmbedUrl called with sourceConfig:", JSON.parse(JSON.stringify(sourceConfig)), "type:", type, "params:", params);
            if (!sourceConfig || !sourceConfig.urls || typeof sourceConfig.urls[type] !== 'string' || !sourceConfig.urls[type]) {
                console.error("getSourceEmbedUrl: Invalid sourceConfig or URL template missing for type:", type, sourceConfig);
                return ''; // Return empty string if config is bad
            }
            let url = sourceConfig.urls[type];
            // Replace placeholders like {id}, {season}, {episode}
            Object.keys(params).forEach(key => {
                const placeholder = `{${key}}`;
                // Ensure global replacement and handle special characters in placeholder if any (though not expected for id/season/episode)
                url = url.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), encodeURIComponent(params[key]));
            });
            // Specific logic for Vidora source to add autoplay
            if (sourceConfig.id === 'vidora' && !url.includes('autoplay=1') && !url.includes('autoPlay=1')) { // Check for both casings
                url += (url.includes('?') ? '&' : '?') + 'autoplay=1';
            }
            console.log("Constructed embed URL:", url);
            return url;
        },
        playFromModal(item, season, episode) {
            console.log("playFromModal initiated with item:", JSON.parse(JSON.stringify(item)), "season:", season, "episode:", episode);
            if (!item || typeof item.id === 'undefined') {
                console.error("playFromModal: Invalid item provided.", item);
                this.$dispatch('show-toast', { message: 'Cannot play: Item data is missing.', type: 'error' });
                return;
            }
            if (item.original_private_item && item.original_private_item.video_url) {
                // This is a private video! Override standard play logic
                console.log("Playing Private Video via Modal:", item.title);

                // CRITICAL FIX: Set modalContent BEFORE playing so it's available when user closes player
                this.modalContent = JSON.parse(JSON.stringify(item));

                this.playPrivateVideo({
                    title: item.title,
                    video_url: item.original_private_item.video_url
                });
                return;
            }

            if (!this.activeSourceConfig || !this.activeSourceConfig.urls) {
                console.error("playFromModal: Active source configuration is invalid or missing.", JSON.parse(JSON.stringify(this.activeSourceConfig)));
                this.$dispatch('show-toast', { message: 'Video source not configured properly. Check settings.', type: 'error' });
                return;
            }

            this.modalContent = JSON.parse(JSON.stringify(item));
            const mediaType = item.media_type;
            if (!mediaType) {
                console.error("playFromModal: media_type is missing from item.", item);
                this.$dispatch('show-toast', { message: 'Cannot determine content type.', type: 'error' });
                return;
            }

            let params = { id: item.id };
            if (mediaType === 'tv') {
                params.season = season || this.modalSelectedSeason || 1;
                let episodeToPlay = episode || this.modalSelectedEpisode;
                if (!episodeToPlay && this.episodesForModal && this.episodesForModal.length > 0) {
                    episodeToPlay = this.episodesForModal[0].episode_number;
                } else if (!episodeToPlay) {
                    episodeToPlay = 1;
                }
                params.episode = episodeToPlay;
                this.modalSelectedEpisode = episodeToPlay;
                console.log(`Playing TV show: ID=${params.id}, S${params.season}E${params.episode}`);
            } else {
                console.log(`Playing movie: ID=${params.id}`);
            }

            const playerEmbedUrl = this.getSourceEmbedUrl(this.activeSourceConfig, mediaType, params);

            if (playerEmbedUrl) {
                // 1. Temporarily hide the player (Alpine handles DOM element removal)
                this.isPlayingInModal = false;

                // 2. Use $nextTick to wait for the DOM to update
                this.$nextTick(() => {
                    // 3. Set the new URL for the iframe.
                    this.modalPlayerUrl = playerEmbedUrl;

                    // 4. Set isPlayingInModal back to true to re-render the player with the new URL
                    this.isPlayingInModal = true;

                    // Only show the desktop modal container if we are NOT in mobile mode
                    if (!this.mobileDetailOpen) {
                        this.showInfoModal = true;
                    }
                });

                this.updateContinueWatching(item);
                console.log("Modal states set for playback: isPlayingInModal=true");
            } else {
                const sourceName = this.activeSourceConfig ? this.activeSourceConfig.name : 'the selected';
                console.error(`Could not generate embed URL for ${sourceName} source. Type: ${mediaType}, Params: ${JSON.stringify(params)}`);
                this.$dispatch('show-toast', { message: `Error preparing video player for ${sourceName} source.`, type: 'error' });
            }
        },
        // F1 Stream Player - Uses the selected F1 server from settings
        openF1StreamPlayer() {
            const selectedServer = this.availableF1Servers.find(s => s.id === this.selectedF1Server);
            const f1StreamUrl = selectedServer ? selectedServer.url : 'https://ihatestreams.xyz/embed/1a0edc01-8363-11f0-b385-bc2411b21e0d';
            const serverName = selectedServer ? selectedServer.name : 'F1 Live Stream';

            this.isPlayingInModal = false;
            this.modalContent = { id: 999999, title: serverName, media_type: 'live_sport' }; // Use a high fake ID to prevent TMDB conflicts
            this.modalPlayerUrl = 'about:blank';
            this.showInfoModal = true;
            document.body.style.overflow = 'hidden';

            this.$nextTick(() => {
                this.modalPlayerUrl = f1StreamUrl;
                this.isPlayingInModal = true;
            });

            this.$dispatch('show-toast', { message: `Launching ${serverName}...`, type: 'success' });
        },
        // F1 Recap Player - Launches YouTube embed for recaps
        playF1Recap(videoKey, title) {
            if (!videoKey) {
                this.$dispatch('show-toast', { message: 'Video key is missing.', type: 'error' });
                return;
            }

            const youtubeUrl = `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&controls=1&showinfo=0&rel=0&modestbranding=1`;

            this.isPlayingInModal = false;
            // Use a unique ID based on the key to prevent conflicts
            this.modalContent = { id: 'yt-' + videoKey, title: title, media_type: 'f1_recap' };
            this.modalPlayerUrl = 'about:blank';
            this.showInfoModal = true;
            document.body.style.overflow = 'hidden';

            this.$nextTick(() => {
                this.modalPlayerUrl = youtubeUrl;
                this.isPlayingInModal = true;
            });

            this.$dispatch('show-toast', { message: `Playing: ${title}`, type: 'success' });
        },
        toggleWatchLater(item) {
            if (!item || typeof item.id === 'undefined') {
                this.$dispatch('show-toast', { message: 'Cannot process item for My List.', type: 'error' }); return;
            }
            const mediaType = item.media_type || (item.title && !item.first_air_date ? 'movie' : 'tv'); // Infer if necessary
            const index = this.watchLaterItems.findIndex(i => i.id === item.id && i.media_type === mediaType);
            if (index === -1) { // Add to list
                this.watchLaterItems.push({
                    id: item.id, title: item.title || item.name, name: item.name || item.title,
                    poster_path: item.poster_path, vote_average: item.vote_average,
                    overview: item.overview, media_type: mediaType,
                    release_date: item.release_date, first_air_date: item.first_air_date,
                    // Add other relevant fields if needed for display in "My List"
                });
            } else { // Remove from list
                this.watchLaterItems.splice(index, 1);
            }
            this.watchLaterCount = this.watchLaterItems.length;
            localStorage.setItem('watchLater', JSON.stringify(this.watchLaterItems));
        },
        isInWatchLater(input) {
            if (!input) return false;
            // Handle both full item object and direct ID (for flexibility)
            const itemId = typeof input === 'object' ? input.id : input;
            if (!itemId) return false;

            // If just an ID is passed, we can only check by ID (we might miss duplicates with different media_types if that happens, but better than crashing)
            // Ideally should always pass full item.
            if (typeof input !== 'object') {
                return this.watchLaterItems.some(i => i.id == itemId);
            }

            const mediaType = input.media_type || (input.title && !input.first_air_date ? 'movie' : 'tv');
            return this.watchLaterItems.some(i => i.id === itemId && i.media_type === mediaType);
        },
        doClearWatchLater() {
            this.watchLaterItems = []; this.watchLaterCount = 0;
            localStorage.removeItem('watchLater'); this.showClearConfirm = false;
            this.$dispatch('show-toast', { message: 'My List cleared!', type: 'success' });
        },
        updateContinueWatching(playedItemFullDetails) { // Expects full details for better row building
            if (!playedItemFullDetails || !playedItemFullDetails.id) {
                console.error("updateContinueWatching: Invalid item data received.", playedItemFullDetails);
                return;
            }

            // 1. Update Local State
            const existingIndex = this.continueWatchingItems.findIndex(i => i.id === playedItemFullDetails.id);
            if (existingIndex > -1) {
                this.continueWatchingItems.splice(existingIndex, 1);
            }
            this.continueWatchingItems.unshift(playedItemFullDetails);
            if (this.continueWatchingItems.length > this.MAX_CONTINUE_WATCHING) {
                this.continueWatchingItems.pop();
            }

            // 2. Persist to Local Storage
            localStorage.setItem('continueWatching', JSON.stringify(this.continueWatchingItems));

            // 3. Persist to Cloud (if logged in)
            if (this.user) {
                // Extract progress data (assuming playedItemFullDetails has it, or we need to pass it separately)
                // The current implementation of updateContinueWatching in db.js expects (user, item, progress).
                // However, playedItemFullDetails seems to contain the progress merged into it in the current app logic?
                // Let's check how it's called. It's called from saveProgress().
                // We'll pass the whole item as 'progress' is likely part of it or we just pass the item.
                // db.updateContinueWatching extracts what it needs.
                db.updateContinueWatching(this.user, playedItemFullDetails, playedItemFullDetails.progress);
            }

            this.buildContinueWatchingRow();
        },

        playBannerMovie() {
            if (!this.bannerMovie) return;

            // Check if we have progress for this item
            const progressItem = this.continueWatchingItems.find(i => i.id === this.bannerMovie.id);

            if (progressItem && progressItem.media_type === 'tv' && progressItem.season && progressItem.episode) {
                console.log("Resuming banner movie from:", progressItem.season, progressItem.episode);
                this.playFromModal(this.bannerMovie, progressItem.season, progressItem.episode);
            } else {
                console.log("Playing banner movie from start");
                this.playFromModal(this.bannerMovie);
            }
        },
        buildContinueWatchingRow() {
            const container = document.getElementById('continue-watching-container');
            const rowElementId = 'continue-watching-scroll-row';
            if (!container) { console.error("Container #continue-watching-container not found!"); return }
            if (!this.continueWatchingItems || this.continueWatchingItems.length === 0) { container.innerHTML = ''; if (this.scrollStates[rowElementId]) delete this.scrollStates[rowElementId]; return }

            const moviesListHTML = this.continueWatchingItems.map(item => {
                const title = item.title || item.name || 'Untitled';
                const posterPath = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'https://placehold.co/342x513/181818/4D4D4D?text=N/A';
                // Ensure item is in detailedItemsCache for context menu and other actions
                if (item.id) this.detailedItemsCache[item.id] = { ...(this.detailedItemsCache[item.id] || {}), ...item };

                return `
        <div class="movie-item group cursor-pointer" @click="window.appInstance.openInfoModalById(${item.id})">
            <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#222]">
                <img src="${posterPath}" class="movie-item-img w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy">
                
                <!-- Remove Button (Specific to Continue Watching) -->
                <button @click.stop="window.appInstance.removeContinueWatchingItem(${item.id},'${item.media_type}')" title="Remove from Continue Watching" class="absolute top-2 right-2 z-30 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>

                <!-- Liquid Overlay -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <p class="text-white font-bold leading-tight transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-black drop-shadow-md line-clamp-2">
                        ${title.replace(/"/g, '&quot;')}
                    </p>
                    <div class="flex items-center gap-2 mt-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                        <span class="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-bold">Play</span>
                        <span class="text-[10px] text-gray-300 border border-white/30 px-2 py-0.5 rounded-full backdrop-blur-sm">Info</span>
                    </div>
                </div>
            </div>
        </div>`;
            }).join('');
            const sectionHTML = `
    <div class="movies-section group/section relative">
        <h2 class="movie-section-heading">Continue Watching</h2>
        <div class="movies-row custom-scrollbar px-1" id="${rowElementId}">
            ${moviesListHTML}
            <div class="w-4 flex-shrink-0"></div>
        </div>
        <button @click="scrollRow('${rowElementId}', -1)" :disabled="isScrolledToStart('${rowElementId}')" aria-label="Scroll Left" class="scroll-arrow absolute left-1 sm:left-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed">
            <svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button @click="scrollRow('${rowElementId}', 1)" :disabled="isScrolledToEnd('${rowElementId}')" aria-label="Scroll Right" class="scroll-arrow absolute right-1 sm:right-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed">
            <svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </button>
    </div>`;
            container.innerHTML = sectionHTML;
            this.initScrollState(rowElementId);
        },
        async removeContinueWatchingItem(itemId, mediaType) {
            console.log(`Attempting to remove item from Continue Watching: ID=${itemId}, Type=${mediaType}`);
            const initialLength = this.continueWatchingItems.length;
            this.continueWatchingItems = this.continueWatchingItems.filter(
                item => !(item.id === itemId && item.media_type === mediaType)
            );
            if (this.continueWatchingItems.length < initialLength) {
                localStorage.setItem('continueWatching', JSON.stringify(this.continueWatchingItems));

                // Sync with Cloud
                if (this.user) {
                    await db.removeFromContinueWatching(this.user, itemId);
                }

                this.buildContinueWatchingRow(); // Rebuild the UI
                this.$dispatch('show-toast', { message: 'Removed from Continue Watching', type: 'success' });
                console.log(`Item ID=${itemId}, Type=${mediaType} removed. List size: ${this.continueWatchingItems.length}`);
            } else {
                console.warn(`Item ID=${itemId}, Type=${mediaType} not found in Continue Watching list.`);
            }
        },



        buildBannerSection(movie) {
            const bannerCont = document.getElementById('banner-section');
            if (!bannerCont) { console.error("Banner container #banner-section not found!"); return; }

            const backdropURL = movie?.id === 66732
                ? (window.innerWidth < 768 ? 'assets/img/stmbg.webp' : 'assets/img/stbg.webp')  // Mobile vs Desktop for Stranger Things
                : (movie?.backdrop_path
                    ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
                    : (movie?.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : 'https://placehold.co/1280x720/181818/4D4D4D?text=No+Image'));
            bannerCont.style.backgroundImage = `url('${backdropURL}')`;

            let bannerContentDiv = bannerCont.querySelector('.banner-content');
            if (!bannerContentDiv) {
                bannerContentDiv = document.createElement('div');
                bannerContentDiv.className = "banner-content container z-20 relative h-full flex flex-col justify-center pb-12";
                const fadeBottom = bannerCont.querySelector('.banner_fadeBottom');
                if (fadeBottom) bannerCont.insertBefore(bannerContentDiv, fadeBottom); else bannerCont.appendChild(bannerContentDiv);
            }

            if (!movie) {
                bannerContentDiv.innerHTML = `
                <div class="banner-placeholder" x-show="currentTab !== 'f1'">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    No featured content available.
                </div>`;
                return;
            }

            const titleText = movie.title || movie.name || "Featured Content";

            // Check if this is Stranger Things (TMDB ID: 66732) and use custom logo
            let logoFile;
            if (movie.id === 66732) {
                // Use custom Stranger Things logo
                logoFile = 'assets/icons/stlg.png';
            } else {
                // Use TMDB logo for other content
                const logoObj = movie.images?.logos?.find(logo => logo.iso_639_1 === this.language || logo.iso_639_1 === 'en' || !logo.iso_639_1) || movie.images?.logos?.[0];
                logoFile = logoObj?.file_path;
            }

            const titleHTML = logoFile
                ? (movie.id === 66732
                    ? `<img src="${window.innerWidth < 768 ? 'assets/icons/stlg-mobile.png' : 'assets/icons/stlg.png'}" 
                class="animate-fade-in-up ${window.innerWidth < 768 ? 'w-[85%] max-w-[350px]' : 'max-w-[250px] md:max-w-[400px] max-h-[150px] md:max-h-[200px]'} object-contain drop-shadow-2xl mb-6" 
                alt="${titleText.replace(/"/g, '&quot;')}" 
                onerror="this.style.display='none'; this.parentElement.innerHTML = '<h2 class=\\'banner__title text-3xl md:text-5xl font-bold text-white drop-shadow-lg\\'>' + this.alt + '</h2>';">`
                    : `<img src="https://image.tmdb.org/t/p/w500${logoFile}"
    class="animate-fade-in-up max-w-[250px] md:max-w-[400px] max-h-[160px] md:max-h-[200px] object-contain drop-shadow-2xl mb-6" alt="${titleText.replace(/"/g, '&quot;')}" onerror="this.style.display='none'; this.parentElement.innerHTML = '<h2 class=\\'banner__title text-3xl md:text-5xl font-bold text-white drop-shadow-lg\\'>' + this.alt + '</h2>';">`)
                : `<h1 class="animate-fade-in-up text-4xl md:text-6xl font-black text-white drop-shadow-2xl mb-6 tracking-tighter leading-none">${titleText}</h1>`;

            const overview = movie.overview ? (movie.overview.length > 180 ? movie.overview.slice(0, 180).trim() + '...' : movie.overview) : "No description available.";
            const year = movie.release_date?.substring(0, 4) || movie.first_air_date?.substring(0, 4) || '';
            const mediaTypeLabel = movie.media_type === 'tv' ? 'Series' : 'Movie';

            bannerContentDiv.innerHTML = `
            <div class="max-w-3xl">
                ${titleHTML}
                


                <div class="flex items-center gap-4 text-sm md:text-base text-gray-200 font-medium mb-6 animate-fade-in-up" style="animation-delay: 0.05s">
                    <span class="text-green-400 font-bold tracking-wide">${movie.vote_average ? Math.round(movie.vote_average * 10) : 0}% Match</span>
                    <span>${year}</span>
                    <span class="border border-white/30 px-2 py-0.5 rounded text-xs backdrop-blur-sm">HD</span>
                    <span class="bg-white/20 px-2 py-0.5 rounded text-xs backdrop-blur-sm">${mediaTypeLabel}</span>
                </div>

                <p class="text-gray-100 text-lg mb-8 line-clamp-3 drop-shadow-lg font-light leading-relaxed max-w-xl animate-fade-in-up" style="animation-delay: 0.1s">
                    ${overview}
                </p>

                <div class="flex items-center gap-2 animate-fade-in-up" style="animation-delay: 0.15s">
                    <button class="liquid-button primary px-8 py-3 text-lg gap-2 shadow-xl hover:bg-gray-200" 
                            @click="window.appInstance.playFromModal(window.appInstance.bannerMovie)">
                        <svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M4 2.69127C4 1.93067 4.81547 1.44851 5.48192 1.81506L22.4069 11.1238C23.0977 11.5037 23.0977 12.4963 22.4069 12.8762L5.48192 22.1849C4.81546 22.5515 4 22.0693 4 21.3087V2.69127Z"></path></svg> 
                        Play
                    </button>
                    
                    <button class="liquid-button secondary px-8 py-3 text-lg gap-2" 
                            @click="window.appInstance.openInfoModal(window.appInstance.bannerMovie)">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        More Info
                    </button>
                </div>
            </div>`;
        },

        buildMovieRows() {
            const moviesCont = document.getElementById('dynamic-content-rows');
            if (!moviesCont) { console.error("Container #dynamic-content-rows not found!"); return }
            const rowElementId = `dynamic-content-scroll-row-${this.currentTab}-${this.currentPage}`;

            if (!this.content || this.content.length === 0) {
                const msg = this.currentPage === 1 ? `No ${this.currentTab} found. Try another section or check API status.` : "No more content to load for this section.";
                moviesCont.innerHTML = `<div class="placeholder-message p-8 text-center">${msg}</div>`;
                if (this.scrollStates[rowElementId]) delete this.scrollStates[rowElementId]; return
            }

            const sectionTitle = this.searchQuery && !this.isSearching && this.searchResults.length > 0
                ? `Search Results for "${this.searchQuery}"`
                : (this.currentTab === 'movies' ? 'Trending Movies' : 'Popular Series');

            const contentToDisplay = (this.searchQuery && !this.isSearching && this.searchResults.length > 0) ? this.searchResults : this.content;

            const moviesListHTML = contentToDisplay.map(item => {
                const title = item.title || item.name || 'Untitled';
                const posterPath = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'https://placehold.co/342x513/181818/4D4D4D?text=N/A';
                if (item.id) this.detailedItemsCache[item.id] = { ...this.detailedItemsCache[item.id], ...item };

                return `
                <div class="movie-item group cursor-pointer" @click="window.appInstance.openInfoModalById(${item.id})">
                    <div class="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#222]">
                        <img src="${posterPath}" class="movie-item-img w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy">
                        
                        <!-- Liquid Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p class="text-white font-bold leading-tight transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-black drop-shadow-md">
                                ${title.replace(/"/g, '&quot;')}
                            </p>
                            <div class="flex items-center gap-2 mt-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                                <span class="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-bold">Play</span>
                                <span class="text-[10px] text-gray-300 border border-white/30 px-2 py-0.5 rounded-full backdrop-blur-sm">Info</span>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            const moviesSectionHTML = `
            <div class="movies-section group/section relative">
                <h2 class="movie-section-heading">${sectionTitle}</h2>
                <div class="movies-row custom-scrollbar px-1" id="${rowElementId}">
                    ${moviesListHTML}
                    <div class="w-4 flex-shrink-0"></div>
                </div>
                <button @click="scrollRow('${rowElementId}',-1)" :disabled="isScrolledToStart('${rowElementId}')" aria-label="Scroll Left" class="scroll-arrow absolute left-1 sm:left-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
                <button @click="scrollRow('${rowElementId}',1)" :disabled="isScrolledToEnd('${rowElementId}')" aria-label="Scroll Right" class="scroll-arrow absolute right-1 sm:right-2 top-[calc(50%+0.5rem)] md:top-[calc(50%+1rem)] transform -translate-y-1/2 z-[60] p-2 bg-black/60 text-white rounded-full opacity-0 group-hover/section:opacity-100 hover:bg-black/80 focus:opacity-100 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"><svg class="h-4 w-4 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></button>
            </div>`;

            moviesCont.innerHTML = moviesSectionHTML;
            this.initScrollState(rowElementId);
        },

        // --- F1 Logic ---


        async fetchChannels() {
            try {
                const { data, error } = await this.supabase
                    .from('channels')
                    .select('*')
                    .order('updated_at', { ascending: false });

                if (error) throw error;

                this.channels = { skySports: [], f1Tv: [], others: [] };

                data.forEach(channel => {
                    if (channel.provider === 'skySports') {
                        this.channels.skySports.push(channel);
                    } else if (channel.provider === 'f1Tv') {
                        this.channels.f1Tv.push(channel);
                    } else {
                        const title = channel.title.toLowerCase();
                        if (title.includes('sky sports f1')) {
                            this.channels.skySports.push(channel);
                        } else if (title.includes('f1 tv')) {
                            this.channels.f1Tv.push(channel);
                        } else {
                            this.channels.others.push(channel);
                        }
                    }
                });

                if (!this.selectedProvider) {
                    this.selectedProvider = localStorage.getItem('f1Provider') || 'skySports';
                }
            } catch (e) {
                console.error('Error fetching channels:', e);
            }
        },

        selectProvider(id) {
            this.selectedProvider = id;
            localStorage.setItem('f1Provider', id);
        },

        get filteredChannels() {
            if (!this.selectedProvider) return [];
            return this.channels[this.selectedProvider] || [];
        },

        // F1 Stream Logic using Main Modal
        async playBestStream() {
            if (Object.keys(this.channels).length === 0 || this.filteredChannels.length === 0) {
                await this.fetchChannels();
            }

            // Ensure a provider is selected, default to 'skySports' if none
            if (!this.selectedProvider) {
                this.selectedProvider = localStorage.getItem('f1Provider') || 'skySports';
            }

            const channels = this.filteredChannels;
            if (channels.length === 0) {
                this.$dispatch('show-toast', { message: 'No channels available for this server.', type: 'error' });
                return;
            }

            // Find the best channel (e.g., first online, then first available)
            const bestChannel = channels.find(c => c.status === 'online') || channels[0];
            this.playStream(bestChannel);
        },

        playStream(channel) {
            if (!channel || !channel.uri) {
                this.$dispatch('show-toast', { message: 'No stream URL available for this channel.', type: 'error' });
                return;
            }

            this.currentStreamTitle = `Live: ${channel.title}`;

            // Use Main Modal
            this.modalContent = {
                id: 999999, // Unique ID for live stream
                title: this.currentStreamTitle,
                media_type: 'live_sport',
                overview: `Live streaming from ${channel.title}. Quality: HD.`
            };

            this.isPlayingInModal = true;
            this.isDirectVideo = true; // Enable direct video mode
            this.showInfoModal = true;
            document.body.style.overflow = 'hidden';

            this.$nextTick(() => {
                const video = document.getElementById('modalPlayerVideo');
                if (!video) {
                    console.error("Video element 'modalPlayerVideo' not found in modal.");
                    this.$dispatch('show-toast', { message: 'Error: Video player not ready.', type: 'error' });
                    return;
                }

                if (Hls.isSupported()) {
                    if (this.hls) {
                        this.hls.destroy();
                    }
                    this.hls = new Hls();
                    this.hls.loadSource(channel.uri);
                    this.hls.attachMedia(video);
                    this.hls.on(Hls.Events.MANIFEST_PARSED, function () {
                        video.play();
                    });
                    this.hls.on(Hls.Events.ERROR, (event, data) => {
                        console.error('HLS.js error:', data);
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    this.$dispatch('show-toast', { message: 'Network error during stream. Trying to recover...', type: 'warning' });
                                    this.hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    this.$dispatch('show-toast', { message: 'Media error during stream. Trying to recover...', type: 'warning' });
                                    this.hls.recoverMediaError();
                                    break;
                                default:
                                    this.$dispatch('show-toast', { message: 'Fatal HLS error. Stream stopped.', type: 'error' });
                                    this.stopStream();
                                    break;
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = channel.uri;
                    video.addEventListener('loadedmetadata', function () {
                        video.play();
                    });
                } else {
                    this.$dispatch('show-toast', { message: 'Your browser does not support HLS video playback.', type: 'error' });
                }
            });

            this.$dispatch('show-toast', { message: 'Starting Stream...', type: 'success' });
        },

        stopStream() {
            const video = document.getElementById('modalPlayerVideo');
            if (video) {
                video.pause();
                video.src = '';
                video.load(); // Ensure the video element is completely reset
            }
            if (this.hls) {
                this.hls.destroy();
                this.hls = null;
            }

            // Reset Main Modal State
            this.isPlayingInModal = false;
            this.isDirectVideo = false;
            this.showInfoModal = false;
            document.body.style.overflow = '';
            this.modalPlayerUrl = ''; // Clear any previous modal player URL
            this.currentStreamTitle = null; // Clear F1 stream title
        },

        scrollToReplays() {
            this.activeTab = 'replays';
            this.$nextTick(() => {
                const el = document.getElementById('f1-replays-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
            });
        },

        // The original playStream and stopStream are now replaced by the new ones above.
        // The custom showLivePlayerModal state is removed as per instruction.


        // YouTube API Methods for F1 Highlights
        // ... [Existing code before fetchF1Highlights] ...

        // YouTube API Methods for F1 Highlights
        async fetchF1Highlights() {
            this.loadingHighlights = true;
            console.log('Fetching F1 highlights from YouTube RSS + API...');

            const CHANNEL_ID = this.F1_CHANNEL_ID;
            const API_KEY = this.youtubeF1ApiKey;

            try {
                // 1. Fetch RSS feed via CORS Proxy (Required for browser-side requests)
                const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;

                const rssRes = await fetch(proxyUrl);
                if (!rssRes.ok) throw new Error('RSS fetch failed');

                const rssText = await rssRes.text();

                // 2. Parse RSS XML
                const parser = new DOMParser();
                const xml = parser.parseFromString(rssText, "text/xml");
                const entries = Array.from(xml.querySelectorAll("entry"));

                if (entries.length === 0) {
                    console.warn('No videos found in RSS feed');
                    this.useMockHighlights();
                    return;
                }

                // 3. Extract basic data + video IDs
                let videos = entries.map(entry => {
                    const videoId = entry.querySelector('videoId')?.textContent ||
                        entry.querySelector('yt\\:videoId')?.textContent;
                    const mediaGroup = entry.querySelector('media\\:group');
                    const thumbnail = mediaGroup?.querySelector('media\\:thumbnail')?.getAttribute('url') ||
                        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                    return {
                        id: videoId,
                        title: entry.querySelector("title")?.textContent,
                        publishedAt: entry.querySelector("published")?.textContent,
                        thumbnail: thumbnail,
                        channelTitle: 'FORMULA 1'
                    };
                }).filter(v => v.id);

                // FILTER 1: Remove likely shorts by title keywords (optimisation)
                videos = videos.filter(v => {
                    const titleLower = v.title.toLowerCase();
                    return !titleLower.includes('#shorts') && !titleLower.includes('shorts');
                });

                // Take the most recent 15 videos to fetch details for
                const videosToFetch = videos.slice(0, 15);
                const ids = videosToFetch.map(v => v.id).join(",");

                if (!ids) {
                    this.f1Highlights = [];
                    this.loadingHighlights = false;
                    return;
                }

                // 4. Fetch stats & duration from YouTube Videos API (1 Unit Cost)
                const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` +
                    `id=${ids}&part=contentDetails,statistics&key=${API_KEY}`;

                const detailsRes = await fetch(detailsUrl);
                if (!detailsRes.ok) throw new Error('YouTube API fetch failed');

                const detailsData = await detailsRes.json();

                // 5. Merge details & FILTER 2: Exclude Shorts by Duration
                this.f1Highlights = videosToFetch.map(video => {
                    const apiData = detailsData.items?.find(i => i.id === video.id);
                    if (!apiData) return null;

                    const duration = apiData.contentDetails?.duration || 'PT0S';

                    // Exclude videos shorter than 60 seconds (Shorts don't usually have 'M' or 'H' in ISO duration)
                    // e.g., PT15S (Short) vs PT1M20S (Video)
                    if (!duration.includes('M') && !duration.includes('H')) return null;

                    return {
                        ...video,
                        duration: duration,
                        viewCount: apiData.statistics?.viewCount || '0'
                    };
                }).filter(Boolean); // Remove nulls (filtered shorts)

                console.log(`Loaded ${this.f1Highlights.length} F1 highlights (Shorts excluded).`);

            } catch (error) {
                console.error("Error fetching F1 highlights:", error);
                this.useMockHighlights();
            } finally {
                this.loadingHighlights = false;
            }
        },



        useMockHighlights() {
            // Fallback mock data if API fails
            this.f1Highlights = [
                {
                    id: 'j5p_XyB9aQg',
                    title: '2024 Abu Dhabi Grand Prix | Race Highlights',
                    thumbnail: 'https://img.youtube.com/vi/j5p_XyB9aQg/maxresdefault.jpg',
                    publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    viewCount: '4200000',
                    duration: 'PT14M20S'
                },
                {
                    id: 'b9A27Xy1Kj4',
                    title: 'Qualifying Highlights | 2024 Abu Dhabi Grand Prix',
                    thumbnail: 'https://img.youtube.com/vi/b9A27Xy1Kj4/maxresdefault.jpg',
                    publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    viewCount: '2100000',
                    duration: 'PT8M45S'
                },
                {
                    id: 'p8g_kP6JqZ8',
                    title: 'Top 10 Onboards | 2024 Abu Dhabi Grand Prix',
                    thumbnail: 'https://img.youtube.com/vi/p8g_kP6JqZ8/maxresdefault.jpg',
                    publishedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                    viewCount: '1500000',
                    duration: 'PT10M12S'
                },
                {
                    id: 'q7d_hH3JwK9',
                    title: 'Driver Press Conference | Post-Race',
                    thumbnail: 'https://img.youtube.com/vi/q7d_hH3JwK9/maxresdefault.jpg',
                    publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    viewCount: '800000',
                    duration: 'PT25M0S'
                }
            ];
        },

        formatViewCount(count) {
            const num = parseInt(count);
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
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
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
            return `${Math.floor(diffDays / 30)} months ago`;
        },

        parseDuration(duration) {
            // Parse ISO 8601 duration format (e.g., PT14M20S)
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (!match) return '0:00';

            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);

            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        },

        playYouTubeVideo(videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
        },

        formatDate(dateString) {
            if (!dateString) return 'TBA';
            const date = new Date(dateString);
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        },

        closeReplay() {
            this.currentReplayUrl = null;
        },

        formatDate(dateString) {
            const options = { month: 'long', day: 'numeric', year: 'numeric' };
            return new Date(dateString).toLocaleDateString('en-US', options);
        }
    };
}

document.addEventListener('DOMContentLoaded', function () {
    // DOM is fully loaded and parsed
});
