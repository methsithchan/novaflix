# Deployment Security Checklist

Use this before pushing or redeploying NovaFlix.

## Required Before Next Public Deploy

- Rotate or restrict the public API keys currently committed in `js/config.js`.
  - Supabase anon/publishable keys are expected to be public in browser apps, but they are only safe when Row Level Security is correct.
  - Restrict TMDB and YouTube API keys by allowed referrer/origin in their provider consoles.
- Re-apply the latest `sql/private_content_schema.sql` in Supabase.
  - The old policy allowed any authenticated user to manage private content.
  - The current schema stores admin emails in `app_admins` and enforces admin writes with RLS.
- In Supabase, confirm RLS is enabled on:
  - `user_library`
  - `private_content`
  - `app_admins`
- Confirm `app_admins` contains only trusted admin email addresses.
- Review OAuth and Supabase auth redirect URLs so they only include production and intentional local development origins.

## Static Hosting

- Vercel: keep `vercel.json` committed so security headers are applied.
- GitHub Pages: headers from `vercel.json` are not applied. Use Cloudflare, Netlify, or another edge/proxy if you need response headers there.
- Serve over HTTPS only.

## Manual Smoke Test

1. Open the home page and verify movies/TV/F1 sections load.
2. Sign in as a normal user and verify private content can be viewed only when the user's email is in `allowed_emails`.
3. Sign in as a non-admin user and verify `admin.html` redirects away.
4. In Supabase SQL or table editor, verify the non-admin user cannot insert/update/delete `private_content`.
5. Sign in as an admin and verify private content create/update/delete still works.

## Known Remaining Risks

- This is a browser-only app, so every key in `js/config.js` is visible to visitors.
- Several third-party CDN scripts are loaded directly. For stricter supply-chain control, pin versions and self-host the libraries.
- The app embeds third-party video/player URLs. The modal iframe is sandboxed, but embedded providers can still track users and may require broad iframe permissions to function.
