# NovaFlix

NovaFlix is a modern web-based streaming interface for movies, TV shows, and F1 live streams. It features a premium glassmorphic design and is optimized for both desktop and mobile devices.

> ⚠️ **Status Notice:** This project is **no longer actively maintained**. The live demo is available below, but certain dynamic features (like live streams or API integrations) may degrade over time.

## 🚀 Live Demo

Check out the deployed application here: [https://novaflix-eta.vercel.app](https://novaflix-eta.vercel.app)

## Features

- **Movies & TV Shows**: Browse and stream content powered by TMDB metadata.
- **F1 Live**: Catch live Formula 1 races from multiple providers.
- **Glassmorphic UI**: High-end visual experience with smooth transitions and ambient effects.
- **PWA Ready**: Installable as a web app on iOS and Android.
- **Admin Portal**: Manage private content and user access.
- **Performance Mode**: Optimizations for low-end devices and Windows laptops.

## Project Structure

- `/js`: Core application logic and configurations.
- `/css`: Stylesheets and performance optimizations.
- `/assets`: Images and icons used across the application.
- `/sql`: Database schemas for private content and user data.
- `/lib`: Helper libraries for authentication, database, and performance.
- `index.html`: Main application entry point.

## Setup

1. Configure Supabase credentials in `js/config.js`.
2. Serve the directory using any local web server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser.

## Deployment

The project is structured to be ready for static hosting services like GitHub Pages or Vercel.

---
Built with ❤️ by Methsith7
