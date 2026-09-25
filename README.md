# Current

A living field shaped by the wind presently moving through San Diego.

Current fetches live wind conditions from [Open-Meteo](https://open-meteo.com/) and translates them into a generative field of drifting filaments. Wind direction controls where the field moves; wind speed controls the pace; day and night shift the tonal character.

## Features

- **Live wind data** — direction, speed, gusts, and temperature from Open-Meteo, refreshed every 15 minutes
- **Ocean tone** — optional slow, low-pass-filtered pink noise that evokes the sound of waves
- **Line colors** — Red, Royal Red, and Burgundy
- **Bottom controls** — all controls sit at the bottom of the screen and fade away once the experience begins; move the mouse or tap to bring them back
- **Keyboard** — `Space` starts, pauses, and resumes

## Deploy

1. Upload `index.html`, `style.css`, `app.js`, and `README.md` to a public GitHub repository.
2. In **Settings → Pages**, set the source to the `main` branch and `/(root)`.
3. The site will be available at `https://<username>.github.io/current/`.

No build process, server, API key, or backend required. The weather call is made from the visitor's browser.
