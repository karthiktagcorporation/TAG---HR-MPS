import { cn } from '@/lib/utils';

// TAG brand palette
const GREY = '#6E6F71';
const GREY_LIGHT = '#D7DAE0';
const RED = '#C0322A';

/**
 * TAG brand mark — grey "T"/"G", red "A" doubling as an upward arrow,
 * matching the official "TAG · POWER TO PEOPLE" logo.
 *
 * To use the raster/vector asset instead, drop `logo.svg`/`logo.png` into
 * /public and set `VITE_LOGO_URL` — the <img> path below takes over.
 */
function TagMark({ height, light, withTagline }: { height: number; light?: boolean; withTagline?: boolean }) {
  const letterGrey = light ? GREY_LIGHT : GREY;
  const vbH = withTagline ? 150 : 120;
  return (
    <svg
      height={height}
      viewBox={`0 0 240 ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="TAG — Power to People"
      style={{ display: 'block' }}
    >
      <g fontFamily="Inter, Arial, sans-serif" fontWeight={800} fontSize={118} textAnchor="middle">
        <text x="42" y="100" fill={letterGrey}>T</text>
        <text x="118" y="100" fill={RED}>A</text>
        <text x="198" y="100" fill={letterGrey}>G</text>
      </g>
      {/* white upward arrow inside the A */}
      <g fill="#FFFFFF">
        <polygon points="118,40 100,66 112,66 112,96 124,96 124,66 136,66" />
      </g>
      {withTagline && (
        <g fontFamily="Inter, Arial, sans-serif" fontWeight={700} fontSize={20} letterSpacing="4">
          <text x="14" y="140" fill={RED}>POWER</text>
          <text x="104" y="140" fill={letterGrey}>TO PEOPLE</text>
        </g>
      )}
    </svg>
  );
}

export function Logo({
  size = 36,
  showText = true,
  textClassName,
  variant = 'default',
}: {
  size?: number;
  showText?: boolean;
  textClassName?: string;
  variant?: 'default' | 'light';
}) {
  const customUrl = import.meta.env.VITE_LOGO_URL as string | undefined;
  const light = variant === 'light';

  return (
    <div className="flex items-center gap-3">
      {customUrl ? (
        <img src={customUrl} alt="TAG" height={size} style={{ height: size, width: 'auto' }} />
      ) : (
        <TagMark height={size} light={light} />
      )}
      {showText && (
        <div className={cn('leading-tight border-l pl-3', light ? 'border-white/20' : 'border-border', textClassName)}>
          <div className={cn('text-base font-extrabold tracking-tight', light ? 'text-white' : 'text-foreground')}>
            MPS
          </div>
          <div className={cn('text-[10px] font-medium uppercase tracking-wider', light ? 'text-white/70' : 'text-muted-foreground')}>
            Manpower Plan vs Actual
          </div>
        </div>
      )}
    </div>
  );
}

/** Full stacked lockup with the POWER TO PEOPLE tagline — used on the login screen. */
export function LogoLockup({ height = 96, light }: { height?: number; light?: boolean }) {
  const customUrl = import.meta.env.VITE_LOGO_URL as string | undefined;
  if (customUrl) return <img src={customUrl} alt="TAG — Power to People" style={{ height, width: 'auto' }} />;
  return <TagMark height={height} light={light} withTagline />;
}
