# TAG Corporation — Brand Assets

Canonical, reusable brand assets for TAG Corporation applications.

## Files

| File | Use |
|------|-----|
| `tag-logo.svg` | Full lockup — **TAG** mark + **POWER TO PEOPLE** tagline. Default logo. |
| `tag-logo-mark.svg` | Mark only (TAG with the red arrow), no tagline. For tight/compact placements. |

Both are vector SVGs with a transparent background and a viewBox, so they scale to any size without quality loss. Set a `width` **or** `height` and the other dimension follows automatically.

- `tag-logo.svg` aspect ratio ≈ **320 : 172** (~1.86 : 1)
- `tag-logo-mark.svg` aspect ratio ≈ **320 : 134** (~2.39 : 1)

## Colours

| Token | Hex | Used for |
|-------|-----|----------|
| TAG Grey | `#6E6F71` | The **T** and **G**, and "TO PEOPLE" |
| TAG Red | `#C8322B` | The **A** / upward arrow, and "POWER" |
| White | `#FFFFFF` | The arrow negative space inside the **A** |

## Usage notes

- The logo uses **grey + red on a light/white background**. On dark backgrounds, place it inside a white container (rounded card/chip) so the grey letters keep their contrast — do **not** recolour the mark.
- Keep clear space around the logo equal to at least the height of the **A**.
- Don't stretch, skew, or change the colours.

## Using in a web app

```html
<img src="/tag-logo.svg" alt="TAG — Power to People" height="80" />
```

In this project the assets are mirrored at `frontend/public/tag-logo.svg` and
`frontend/public/tag-logo-mark.svg`, and rendered by `frontend/src/components/Logo.tsx`
(`<Logo />`, `<LogoLockup />`). To override at runtime, set `VITE_LOGO_URL`.
