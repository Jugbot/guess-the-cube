# Guess the Cube

A small static web app for training your sense of perspective.

https://jugbot.github.io/guess-the-cube/

The aim of the game is to complete the drawing of a cube given only one face.

## Running locally

It's plain HTML/CSS/JS with no build step. Because it uses ES modules, serve it over HTTP instead of opening the file directly:

```sh
python -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

Push to GitHub, then go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and pick `main` with folder `/ (root)`. The site will be at `https://<user>.github.io/<repo>/`.
