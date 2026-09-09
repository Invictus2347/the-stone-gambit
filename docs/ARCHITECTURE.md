# Architecture

Vanilla JavaScript ES modules, Three.js, chess.js, and Vite. No application server, database, authentication service, or model API is required.

## Move lifecycle

1. The 3D picker or Move board submits a square selection.
2. `main.js` validates the move against the shared chess.js position.
3. `scene.js` animates movement and, for captures, a combat sequence.
4. The scene reconciles with the authoritative position and removes temporary debris.
5. `engine-worker.js` searches for the computer reply without blocking the UI.

The HTML board never maintains a separate rules state. Animation is presentation, not the authority for move legality.

| Module                                | Responsibility                                         |
| ------------------------------------- | ------------------------------------------------------ |
| `main.js`                             | UI, game state, mode transitions                       |
| `chess-engine.js`, `engine-worker.js` | Rules helpers and depth-two alpha-beta opponent        |
| `move-board.js`                       | Accessible square controls and legal destinations      |
| `scene.js`                            | Rendering, picking, cameras, pieces, captures, cleanup |
| `combat.js`, `rook-combat.js`         | Attack choreography                                    |
| `limb-ik.js`, `combat-skin.js`        | Limb constraints and skeletal deformation              |
| `materials.js`, `audio.js`            | Stone surfaces and synthesized sound                   |
| `film*.js`, `offline-film.js`         | Film studies, titles, timeline, MP4 encoding           |
| `playback-state.js`                   | Exit/reset state restoration                           |
| `public-assets.js`                    | Explicit runtime asset allowlist                       |

All listed modules are under `src/`. `combat-review.js` supports development inspection; production builds do not expose the development control object or URL review controls.

## Build boundary

Vite emits only allowlisted public assets alongside bundled application files. The production site is static. Film export encodes in the browser and downloads a Blob; there is no upload endpoint.
