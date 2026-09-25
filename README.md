# Current

A minimal live visual field shaped by the wind presently moving through San Diego.

## Publish on GitHub Pages

1. Create a new public GitHub repository, for example `current`.
2. Upload `index.html`, `style.css`, and `app.js` from this folder to the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main`, folder `/(root)`, then save.
6. GitHub will provide the public address after deployment.

No build step, API key, or backend is required.

## Controls

- **Begin** or `Space`: start the piece.
- `Space` after beginning: pause or resume the field.
- **i**: show information and attribution.
- `Esc`: close the information panel.

## Data

The piece fetches current wind speed, direction, gusts, temperature, and day/night state for San Diego from Open-Meteo. It refreshes every 15 minutes.

Open-Meteo attribution is included in the information panel. Review its current terms before commercial use: https://open-meteo.com/

## Change the location

Edit the `LOCATION` constant near the top of `app.js`:

```js
const LOCATION = {
  name: "San Diego, California",
  lat: 32.7157,
  lon: -117.1611,
  timezone: "America/Los_Angeles"
};
```

Also change the visible location text in `index.html`.
