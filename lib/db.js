
const db = {
    // --- Watch Later ---

    async addToWatchLater(user, item) {
        if (!user) return { error: 'User not logged in' };

        // Prepare item data to store (keep it minimal but sufficient for display)
        const itemData = {
            id: item.id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            media_type: item.media_type || 'movie',
            vote_average: item.vote_average,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date
        };

        const { data, error } = await supabaseClient
            .from('user_library')
            .upsert({
                user_id: user.id,
                item_id: item.id.toString(), // Ensure ID is string for consistency
                type: 'watch_later',
                data: itemData,
                updated_at: new Date()
            }, { onConflict: 'user_id, item_id, type' })
            .select();

        return { data, error };
    },

    async removeFromWatchLater(user, itemId) {
        if (!user) return { error: 'User not logged in' };

        const { data, error } = await supabaseClient
            .from('user_library')
            .delete()
            .match({ user_id: user.id, item_id: itemId.toString(), type: 'watch_later' });

        return { data, error };
    },

    async getWatchLater(user) {
        if (!user) return { data: [], error: 'User not logged in' };

        const { data, error } = await supabaseClient
            .from('user_library')
            .select('data')
            .eq('user_id', user.id)
            .eq('type', 'watch_later')
            .order('updated_at', { ascending: false });

        if (error) return { data: [], error };

        // Extract the actual item data
        const items = data.map(row => row.data);
        return { data: items, error: null };
    },

    // --- Continue Watching ---

    async updateContinueWatching(user, item, progress) {
        if (!user) return { error: 'User not logged in' };

        const itemData = {
            id: item.id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            media_type: item.media_type || 'movie',
            season: item.season, // For TV
            episode: item.episode, // For TV
            progress: progress, // e.g., { time: 120, duration: 3600, percentage: 3.3 }
        };

        const { data, error } = await supabaseClient
            .from('user_library')
            .upsert({
                user_id: user.id,
                item_id: item.id.toString(),
                type: 'continue_watching',
                data: itemData,
                updated_at: new Date()
            }, { onConflict: 'user_id, item_id, type' })
            .select();

        return { data, error };
    },

    async getContinueWatching(user) {
        if (!user) return { data: [], error: 'User not logged in' };

        const { data, error } = await supabaseClient
            .from('user_library')
            .select('data')
            .eq('user_id', user.id)
            .eq('type', 'continue_watching')
            .order('updated_at', { ascending: false });

        if (error) return { data: [], error };

        const items = data.map(row => row.data);
        return { data: items, error: null };
    },

    async removeFromContinueWatching(user, itemId) {
        if (!user) return { error: 'User not logged in' };

        const { data, error } = await supabaseClient
            .from('user_library')
            .delete()
            .match({ user_id: user.id, item_id: itemId.toString(), type: 'continue_watching' });

        return { data, error };
    },

    // --- Private Content ---

    async getPrivateContent(userEmail) {
        if (!userEmail) return { data: [], error: 'User email required' };

        // Fetch items where allowed_emails contains the userEmail
        const { data, error } = await supabaseClient
            .from('private_content')
            .select('*')
            .contains('allowed_emails', [userEmail])
            .order('created_at', { ascending: false });

        return { data, error };
    },

    async getAllPrivateContent() {
        // For Admin Portal
        const { data, error } = await supabaseClient
            .from('private_content')
            .select('*')
            .order('created_at', { ascending: false });
        return { data, error };
    },

    async upsertPrivateContent(contentItem) {
        const { data, error } = await supabaseClient
            .from('private_content')
            .upsert(contentItem)
            .select();
        return { data, error };
    },

    async deletePrivateContent(id) {
        const { data, error } = await supabaseClient
            .from('private_content')
            .delete()
            .eq('id', id);
        return { data, error };
    }
};
