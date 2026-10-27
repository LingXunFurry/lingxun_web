# Lingxun Loading Run

Created for this website on 2026-10-26, using the built-in image generation tool.
The user explicitly authorized adapting their Codex pet for the loading screen.
No third-party character art or new runtime dependency was added.

References (user-owned original files, unchanged):
- `lingxun-spritesheet.webp` from the user's Codex pet output directory: pose and outfit reference.
- `lingxun-canonical-base.png`: identity and color reference.
- `lingxun-contact-sheet.png`: supplied contact sheet, not embedded in the website.

Current output: `lingxun-run-32-v5.webp`, 32 poses, each exactly 160x160, strip 5120x160,
52,442 bytes. Playback is 32 CSS steps over 0.84 seconds. Direct homepage entry and
homepage refresh use the cover and a two-second minimum. Internal navigation, history
navigation and subpages do not play or fetch the animation or impose the minimum delay.
Navigation Timing distinguishes refresh from internal navigation; session storage and
history state provide a fallback for browsers without it. No content is cached.
Reduced-motion users see a static frame whenever the homepage cover is shown.

The earlier `lingxun-run-16-v1.webp` was rejected for unnatural motion and is not used.
The second generated whole-cycle attempt was also rejected before integration.
The final animation uses a fixed cutout rig instead of independently redrawing limbs:
the near/far arms, thighs, shins and feet have permanent source images and depth order.
Two-bone inverse kinematics keeps leg lengths constant, plants contact feet on the
same ground line and includes a brief flight phase. The torso, face and equipment use
the exact same source artwork in all frames. Only positions and rotations change.
Revision 3 adds an approximately 12-degree forward torso lean, coupled shoulder/hip
motion, landing compression and toe-off heel rise. The support toe stays on the
ground while the ankle rises, with a continuous transition into the flight arc.
Revision 4 adds independent elbow flexion from the same immutable arm image, narrower
shoulder swing, steady torso motion, constant-speed support-foot travel and a Hermite
recovery path with matching entry/exit velocities. The two limb identities and their
depth order never change. Revision 5 widens the near/far thighs from 18/16 to 25/23
pixels and shins from 15/14 to 22/20. Boots grow from 25x20 to 28x22 backwards and
upwards, preserving the original contact toe and ground line. The existing source
parts, joint paths, torso lean and limb order are unchanged. No new image generation
was used for this width adjustment. V1 through V4 remain available for rollback.

Qualitative motion reference: [Muybridge, Plate 71: Running (National Gallery of Art)](https://www.nga.gov/artworks/166573-plate-number-71-running).
This reference is not downloaded, embedded or used as website artwork.

Preparation: `scripts/prepare_loading_rig.cjs` and `scripts/loading-rig.mjs`.
Nearest-neighbor rasterization, shared 128-color palette, hard alpha edges, lossless WebP.
The rig source is preserved locally in `.design/lingxun-tavern/lingxun-loading-rig-atlas-v2.png`;
the current 32-frame review sheet is `lingxun-rig-cycle-review-v5.png` in the same directory.
No source pet image was overwritten. Image generation was used for rig extraction,
not for the final joint interpolation. Existing Sharp and test-only Playwright perform packing.

## Generation Prompt

Final rig prompt: adapt the exact referenced right-facing pixel dragon into isolated,
compatible cutout parts on transparent alpha: fixed head/torso/belt/shorts/shoulder armor;
near and far bent arms; near and far thigh, shin and foot parts; and a separate trailing
tail. Preserve identity, colors, outfit and pixel clusters. No animation pose redraws,
extra limbs, changed equipment, labels, grid, background or shadow. The final limb
motion is generated deterministically from those same parts, avoiding limb identity swaps.

The rejected whole-cycle prompt is retained below for provenance:

Use case: identity-preserve sprite animation edit. Create a refined loading-animation
sprite sheet of the user's exact pixel-art dragon adventurer Lingxun, based on the
existing pet sprite sheet (motion and costume) and canonical portrait (identity).
Expand running-right into 16 distinct sequential frames. Preserve deep steel-blue
and white body, red eyes and facial markings, yellow/gold horn and crest tips, long
dragon tail, white tunic, crossed leather straps, belt, shoulder armor, dark shorts,
bracers and boots; preserve the stout proportions and pixel clusters.
Use a transparent 4x4 square sheet, equal cells ordered left-to-right then top-to-bottom.
Lock body scale, camera, hip center and lighting. Smooth two-foot running stride with
contact, compression, passing, push-off and flight, counter-swinging arms, trailing tail
and slight natural bounce. Last frame loops into first. Full body, clear margins.
No text, labels, grid, checkerboard, green background, motion blur, ghosting,
crossfades, changed outfit, extra limbs, new character or wolf identity.
