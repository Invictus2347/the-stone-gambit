# Assets and attribution

## Sculptures

**Harry Potter Chess Set**, by **PHusband**: <https://www.thingiverse.com/thing:5886018>.

The source download identifies Creative Commons Attribution; the project's retained attribution specifies [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Preserve the creator, source, license link, and modification notice when redistributing these assets.

Adaptations include scaling and centering, polygon reduction, skeletal skinning, stone materials, fracture geometry, and game animation integration. These are adapted third-party sculptures—not original AI-generated meshes.

Runtime files:

- `public/models/combat-v4/`: pawn, knight, bishop, queen, king.
- `public/models/rook-v5/`: rook.
- `public/models/hero/*-fracture.glb`: capture fragments for all six piece types.

Raw source downloads and Blender work files are not included. Obtain source models from the creator's page. The asset license does not clear third-party character or trademark rights; this is an unofficial fan experiment.

## Textures and audio

The limestone textures in `public/textures/` support procedural stone shading; the retained project credits identify OpenAI image generation for the dust texture. Generated imagery should not be represented as an exclusive ownership claim. Sound effects are synthesized with Web Audio; no movie soundtrack is bundled.

## Fonts

Cormorant Garamond and Manrope are distributed under SIL Open Font License 1.1. Full notices are included in `public/fonts/Cormorant-OFL.txt` and `public/fonts/Manrope-OFL.txt`.

## Packaging

`src/public-assets.js` lists every runtime public asset. Approximately 75 MB are included, with individual files below GitHub's standard file-size limit. Git LFS is not required. GLBs embed their buffers and images and do not reference files on the author's computer.

Keep `public/credits.txt`, font licenses, and this attribution with redistributed builds. Original application code is covered separately by the root MIT license.
