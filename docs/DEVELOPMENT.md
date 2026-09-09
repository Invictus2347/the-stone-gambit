# Development

## Commands

| Command                 | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `npm ci`                | Install the locked dependency tree               |
| `npm run dev`           | Start a loopback-only development server         |
| `npm test`              | Run Node's automated test suite                  |
| `npm run build`         | Create the static `dist/` site                   |
| `npm run preview`       | Serve the production build locally               |
| `npm run check`         | Formatting, tests, build, and publication checks |
| `npm run audit:anatomy` | Run the additional anatomy audit                 |

Run `npm run format` after edits. Do not commit `node_modules`, `dist`, local recordings, credentials, or deployment metadata.

## Manual verification

Automated tests do not prove visual quality. Before shipping rendering or interaction changes:

1. Select a white piece in 3D; compare legal destinations with Move board.
2. Play a legal move and wait for a legal computer reply.
3. Exercise a capture, then reset during another capture; no victim or debris should remain.
4. Check promotion, castling, and en passant with suitable positions in development.
5. Enter and exit the film, including paused inspection; normal play must resume.
6. Inspect the browser console and test a production build, not only Vite development mode.

Development exposes `window.stoneGambit` for scene inspection. Review tools are intentionally unavailable in production. See `src/main.js` for supported authoring parameters rather than relying on private runtime APIs.

## Rendering and opponent performance

Performance mode is on by default. It retains detailed models and directional shadows, but bypasses screen-space ambient occlusion, bloom, and the reflection render pass. Stationary rigid details are batched by material; attackers and defenders switch back to their original articulated parts. Shadows refresh during movement/destruction rather than on every idle frame.

The framebuffer has a bounded pixel budget and steps down after sustained slow frames. Turn off Performance mode in Settings for the heavier cinematic effects. Fullscreen layout remains unchanged. The six playable models load first; fracture assets load sequentially in the background, with an armor-fragment fallback if unavailable. Film playback/export waits for those requests to settle.

The worker varies choices within 18 centipawns of its best root score, without randomizing internal search evaluations or passing up a forced mate for variety. It receives the actual PGN so repetition history is retained. It is still a modest depth-two opponent, not a tournament engine.

Development-only `#stage` data attributes expose frame duration, draw calls, triangles, and pixel ratio for comparison. These diagnostics are stripped from production. Frame samples depend on hardware, browser load, and resolution; compare the same position and viewport, and distinguish idle from combat measurements.

## Recording details

Film export requires WebCodecs and supported H.264/AAC encoders. Keep the tab visible and allow encoding to finish. Audio is synthesized locally. No film frames or audio are uploaded by the game.

## Deployment

Import the repository into Vercel using the Vite preset, build command `npm run build`, and output directory `dist`. No environment variables are required. Alternatively, host `dist/` on any static HTTPS host.

`vercel.json` supplies security headers. Confirm headers and gameplay on your own deployment. This repository does not include deployment credentials, project IDs, or an automated deploy workflow.

## Maintenance

CI checks formatting, tests, build, publication boundaries, and production dependency advisories. Dependency advisories and browser support can change. `mp4-muxer` is deprecated upstream; it is retained for the current recording implementation, and migration should include playback and codec regression checks.
