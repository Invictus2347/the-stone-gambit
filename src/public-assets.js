// Explicit production allowlist: never publish Blender projects, backups,
// downloaded source models, recordings, credentials, or development reports.
export const publicAssets = [
  'favicon.svg',
  'credits.txt',
  'fonts/manrope-400.ttf',
  'fonts/manrope-600.ttf',
  'fonts/cormorant-500.ttf',
  'fonts/Cormorant-OFL.txt',
  'fonts/Manrope-OFL.txt',
  'textures/limestone-dust-v2.png',
  'textures/limestone-albedo.png',
  ...['p', 'n', 'b', 'q', 'k'].map((type) => `models/combat-v4/${type}.glb`),
  'models/rook-v5/r.glb',
  ...['p', 'n', 'b', 'r', 'q', 'k'].map((type) => `models/hero/${type}-fracture.glb`),
];
