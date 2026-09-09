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

## Recording

Film export requires WebCodecs and supported H.264/AAC encoders. Keep the tab visible and allow encoding to finish. Audio is synthesized locally. No film frames or audio are uploaded by the game.

## Deployment

Import the repository into Vercel using the Vite preset, build command `npm run build`, and output directory `dist`. No environment variables are required. Alternatively, host `dist/` on any static HTTPS host.

`vercel.json` supplies security headers. Confirm headers and gameplay on your own deployment. This repository does not include deployment credentials, project IDs, or an automated deploy workflow.

## Maintenance

CI checks formatting, tests, build, publication boundaries, and production dependency advisories. Dependency advisories and browser support can change. `mp4-muxer` is deprecated upstream; it is retained for the current recording implementation, and migration should include playback and codec regression checks.
