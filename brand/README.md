# TAG Corporation — Brand Assets

Canonical, reusable brand assets for TAG Corporation applications. These are the **official artwork**
(not a redrawn approximation) — reuse the files in this folder for any future TAG app.

## Files

| File | Size | Use |
|------|------|-----|
| `TAG-logo.png` | 1600 × 847 (~1.889:1) | Full lockup — **TAG** mark + **POWER TO PEOPLE** tagline. Default logo. |
| `tag-logo-mark.png` | 1600 × 645 (~2.481:1) | Mark only (TAG with the red arrow), cropped from the original, no tagline. For tight/compact placements (sidebars, favicons). |

Both are PNGs with a transparent-safe white background. Scale by **height** and let width follow
the aspect ratio above — do not stretch/skew.

## Colours

| Token | Hex | Used for |
|-------|-----|----------|
| TAG Grey | `#6E6F71` | The **T** and **G**, and "TO PEOPLE" |
| TAG Red | `#C8322B` | The **A** / upward arrow, and "POWER" |
| White | `#FFFFFF` | The arrow negative space inside the **A**, and the logo background |

## Usage notes

- The logo uses **grey + red on a light/white background**. On dark backgrounds, place it inside a white container (rounded card/chip) so the grey letters keep their contrast — do **not** recolour the mark.
- Keep clear space around the logo equal to at least the height of the **A**.
- Don't stretch, skew, or recolour.
- For a favicon, crop a square around the **A** glyph (see `frontend/public/favicon.png` in TAG - MPS for a worked example).

## Using in a web app

```html
<img src="/TAG-logo.png" alt="TAG — Power to People" height="80" />
```

In the TAG - MPS project the assets are mirrored at `frontend/public/TAG-logo.png` and
`frontend/public/tag-logo-mark.png`, and rendered by `frontend/src/components/Logo.tsx`
(`<Logo />` for the compact mark, `<LogoLockup />` for the full lockup with tagline).
To override at runtime, set `VITE_LOGO_URL` (replaces the full lockup only).

For a **new** TAG app: copy this `brand/` folder in, mirror the two PNGs into the new
app's public/static assets directory, and reuse the colour tokens above in the theme config.

> **Note (Windows):** filenames here are intentionally exact-case (`TAG-logo.png`, not
> `tag-logo.png`). Windows' filesystem is case-insensitive but some dev-server tooling
> (e.g. Vite) indexes `public/` case-sensitively, so a mismatched-case duplicate can silently
> 404 into an SPA fallback. Always reference assets with their exact on-disk casing.
