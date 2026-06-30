import { cn } from '@/lib/utils';

/**
 * TAG Corporation logo.
 *
 * Canonical brand assets live in `/brand` and are mirrored to
 * `/public/tag-logo.svg` (full lockup) and `/public/tag-logo-mark.svg` (mark only).
 * Override at runtime with `VITE_LOGO_URL`.
 *
 * The mark is grey + red on a light background; on dark surfaces pass `chip`
 * to wrap it in a white card so the grey letters keep their contrast.
 */
const FULL_SRC = (import.meta.env.VITE_LOGO_URL as string | undefined) ?? '/tag-logo.svg';
const MARK_SRC = '/tag-logo-mark.svg';

function ChipWrap({ chip, children }: { chip?: boolean; children: React.ReactNode }) {
  if (!chip) return <>{children}</>;
  return <div className="flex items-center rounded-xl bg-white px-3 py-2 shadow-sm">{children}</div>;
}

/** App logo: TAG mark + the "MPS" product label. */
export function Logo({
  size = 36,
  showText = true,
  chip = false,
  textClassName,
  light = false,
}: {
  size?: number;
  showText?: boolean;
  chip?: boolean;
  textClassName?: string;
  light?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <ChipWrap chip={chip}>
        <img src={MARK_SRC} alt="TAG" style={{ height: size, width: 'auto' }} className="block" />
      </ChipWrap>
      {showText && (
        <div className={cn('border-l pl-3 leading-tight', light ? 'border-white/25' : 'border-border', textClassName)}>
          <div className={cn('text-base font-extrabold tracking-tight', light ? 'text-white' : 'text-foreground')}>MPS</div>
          <div className={cn('text-[10px] font-medium uppercase tracking-wider', light ? 'text-white/70' : 'text-muted-foreground')}>
            Manpower Plan vs Actual
          </div>
        </div>
      )}
    </div>
  );
}

/** Full official lockup (TAG mark + POWER TO PEOPLE tagline) — used on the login screen. */
export function LogoLockup({ height = 96, chip = true }: { height?: number; chip?: boolean }) {
  return (
    <ChipWrap chip={chip}>
      <img src={FULL_SRC} alt="TAG — Power to People" style={{ height, width: 'auto' }} className="block" />
    </ChipWrap>
  );
}
