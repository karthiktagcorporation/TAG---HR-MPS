/**
 * TAG Corporation logo — uses the official artwork (not a redrawn approximation),
 * displayed the same way as the other TAG apps (BOM Checker / Patrol): the full
 * lockup (mark + "POWER TO PEOPLE") rendered plainly at its natural aspect ratio.
 *
 * Canonical source files live in `/brand` and are mirrored to:
 *   /public/TAG-logo.png       full lockup (mark + tagline), 1600x847 (~1.889:1)
 *   /public/tag-logo-mark.png  mark only (cropped, no tagline), 1600x645 (~2.481:1)
 *
 * Override at runtime with VITE_LOGO_URL (replaces the full lockup only).
 * The mark is grey + red on a light background; on dark surfaces pass `chip`
 * to wrap it in a white card so the grey letters keep their contrast.
 */
const FULL_SRC = (import.meta.env.VITE_LOGO_URL as string | undefined) ?? '/TAG-logo.png';
const MARK_SRC = '/tag-logo-mark.png';

function ChipWrap({ chip, children }: { chip?: boolean; children: React.ReactNode }) {
  if (!chip) return <>{children}</>;
  return <div className="flex items-center justify-center rounded-xl bg-white px-3 py-2 shadow-sm">{children}</div>;
}

/**
 * App logo — the full official lockup, exactly like the TAG BOM / Patrol apps.
 * `size` is the rendered height in px. `showText={false}` switches to the
 * compact mark (no tagline) for tight spots like a collapsed sidebar.
 */
export function Logo({
  size = 40,
  showText = true,
  chip = false,
}: {
  size?: number;
  showText?: boolean;
  chip?: boolean;
  /** kept for call-site compatibility; the official artwork is never recolored */
  textClassName?: string;
  light?: boolean;
}) {
  return (
    <ChipWrap chip={chip}>
      <img
        src={showText ? FULL_SRC : MARK_SRC}
        alt="TAG — Power to People"
        style={{ height: size, width: 'auto' }}
        className="block"
      />
    </ChipWrap>
  );
}

/** Full official lockup — used on the login screen. `height` is in px. */
export function LogoLockup({ height = 96, chip = true }: { height?: number; chip?: boolean }) {
  return (
    <ChipWrap chip={chip}>
      <img src={FULL_SRC} alt="TAG — Power to People" style={{ height, width: 'auto' }} className="block" />
    </ChipWrap>
  );
}
