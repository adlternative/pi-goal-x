# Snake (browser demo)

A minimal Snake game in plain HTML, CSS, and JavaScript under `snake/`.

## How to run

**Option 1 — open the file**

From the repository root, open `snake/index.html` in a modern browser (double-click or drag into a window). Some browsers restrict local scripts when using the `file://` URL; if the game does not start, use Option 2.

**Option 2 — local static server**

From the repository root:

```bash
python3 -m http.server 8080 --directory snake
```

Then visit [http://localhost:8080/](http://localhost:8080/).

Alternatively, with Node.js:

```bash
npx --yes serve snake -p 8080
```

## Controls

- **Move:** arrow keys or **W** / **A** / **S** / **D**
- **Restart after game over:** **R** or **Play again**

Score increases by 1 each time the snake eats food. The run ends if the snake hits a wall or itself.
