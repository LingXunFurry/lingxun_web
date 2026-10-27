# Tavern Surface Details

Original, code-authored decoration for the Lingxun website, 2026-10-26.
No downloaded artwork, character edits, AI images, external requests or dependencies.

- `tavern-wind.svg`: open curves for the wind dragon and homepage.
- `tavern-photo.svg`: offset photo mats for the gallery and photo preview.
- `tavern-notice.svg`: folded notices for posts and the bulletin preview.
- `tavern-guest.svg`: calling cards and signature strokes for friends.
- `tavern-book.svg`: open leaf edges for stories and article reading.
- `tavern-map.svg`: map folds and an unlabelled trail for future travel.
- `tavern-room.svg`: an arched window, bottle shelf and quiet lower-edge line for the hidden room.
- `paper-grain.svg`: static, tiled neutral grain with 3.5% opacity.

These are background details, not icons, maps, character art or meaningful content.
Colors are supplied by the site's separate light/dark tokens. Text, pictures and
interactive controls remain in front; decorative layers never receive pointer events.
Neither asset animates. These decorations do not alter the photo carousel or loading rules.

The local `SceneOrnament.astro` component supplies different physical-paper details
for each content type. Roman folios and the generic left metal rail have been removed.
Night outlines use muted gilding; daylight uses ink and steel-blue lines. All are
hidden from accessibility tools, non-interactive and clipped to their scene; they
do not add page sections, change content or use a third-party icon library.

Wind curves have different positions and crops on each page, alongside photo mats,
curved book edges, ruled notices with wax seals, a two-page ledger and map folds.
The homepage notes scene deliberately omits the extra wind layer. Map folds stay
on the travel side of the final scene, leaving contact information clear.
The photo-led first scene uses no registry decoration. All third-party object
icons have been removed following owner feedback; the gallery has no camera icon.
