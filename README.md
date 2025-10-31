# Celli City

A collection of WebGL experiments for navigating between the macro city exterior, a loft-side observation window, and a micro-scale city replica.

## Bootstrapping the demos

Each demo is delivered as a static HTML file under the `demos/` directory. Run a lightweight development server from the repository root and then open the pages in your browser.

### Option 1: Python 3

```bash
python -m http.server 8000
```

Then visit:

- [http://localhost:8000/demos/master.html](http://localhost:8000/demos/master.html) &mdash; orchestrates the full exterior → loft → micro-city flow.

### Option 2: Node.js

```bash
npx http-server . -p 8000
```

After the server starts, browse to the same URLs listed above.

> **Tip:** Once the server is running you can also open [`index.html`](http://localhost:8000/index.html) as a landing page if you add one in future iterations.

## Controls & diagnostics

The `demos/master.html` page ships with:

- `Space` to advance the orchestration stage (use `Shift+Space` to reverse).
- `A` to toggle the automatic cycling between stages.
- A lil-gui diagnostics panel to toggle subsystems, monitor render target resolution, and read JavaScript heap usage when the browser exposes `performance.memory`.

No build tooling is required; modern evergreen browsers can load the modules directly from CDNs.
