# Guess the Cube

A small static web app for training your sense of perspective.

1. You're shown one face of a cube (blue) in a random 3D orientation, drawn in true perspective.
2. You sketch the rest of the cube freehand: the other 8 edges, including the hidden ones. The cube always extends *away* from you.
3. Press **Reveal** to see the real cube (green; dashed edges are hidden) over your sketch, along with a score from 0 to 100.
4. Press **Next cube** and go again. Your scores are saved in your browser. Open **Stats** to see rounds played, your average, best and last-10 average, plus a chart of your score per round, for all time or just this session.

Controls: draw with mouse, finger or pen · **Enter/Space** reveal / next · **Ctrl/Cmd+Z** undo · **C** clear.

The icon buttons at the top right open **Info** (ⓘ), which explains how to play, and **Settings** (⚙), which has:

- **Score hidden edges** (on by default). Turn it off to be scored only on the edges you could actually see. Hidden edges are still shown dashed on reveal. Each mode keeps its own stats.
- **Reset stats**, which clears the history for both modes.

## Scoring

Your strokes are compared with the edges you had to guess (all 8, or only the visible ones if **Score hidden edges** is off) using a symmetric chamfer distance:

- **Precision:** the average distance from your strokes to the nearest cube edge. Stray lines cost points; retracing the given face doesn't.
- **Recall:** the average distance from points along the real edges to your strokes. Edges you leave out cost points.

The mean of the two is compared with the error of a "null guess", a sketch that adds nothing to the given face. Matching that error scores 0, and a perfect trace scores 100. This keeps scores fair between heavily foreshortened cubes and deep ones. The null-guess error is floored at 15% of the given face's edge length (`MIN_ZERO_SCORE_FRACTION` in `js/score.js`), so very shallow cubes aren't scored harshly.

## Running locally

It's plain HTML/CSS/JS with no build step. Because it uses ES modules, serve it over HTTP instead of opening the file directly:

```sh
python -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

Push to GitHub, then go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and pick `main` with folder `/ (root)`. The site will be at `https://<user>.github.io/<repo>/`.
