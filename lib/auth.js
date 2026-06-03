
const auth = {
    async signUp(email, password, username) {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username,
                    avatar_url: '',
                },
            },
        });
        return { data, error };
    },

    async signIn(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });
        return { data, error };
    },

    async signInWithGoogle() {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/index.html'
            }
        });
        return { data, error };
    },

    async signOut() {
        const { error } = await supabaseClient.auth.signOut();
        return { error };
    },

    async getUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    onAuthStateChange(callback) {
        return supabaseClient.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
    }
};
