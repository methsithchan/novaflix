
// Check if Supabase script is loaded
if (typeof supabase === 'undefined') {
    console.error('Supabase SDK not loaded. Make sure to include the CDN link in your HTML.');
}

if (typeof CONFIG === 'undefined') {
    console.error('CONFIG object is missing. Make sure config.js is loaded.');
} else {
    console.log('Initializing Supabase with URL:', CONFIG.SUPABASE_URL);
}

const { createClient } = supabase;

// Trim values to avoid errors from accidental whitespace
const supabaseUrl = CONFIG.SUPABASE_URL ? CONFIG.SUPABASE_URL.trim() : '';
const supabaseKey = CONFIG.SUPABASE_ANON_KEY ? CONFIG.SUPABASE_ANON_KEY.trim() : '';

const supabaseClient = createClient(supabaseUrl, supabaseKey);
