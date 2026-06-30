import { cn } from '@/lib/utils';

/**
 * TAG brand logo. Placeholder mark in the same style direction as TAG - BOM CHECKER.
 * To use the real asset: drop `logo.svg`/`logo.png` into /public and set
 * `import.meta.env.VITE_LOGO_URL` or swap the <svg> below for an <img>.
 */
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
  return (
    <div className="flex items-center gap-2.5">
      {customUrl ? (
        <img src={customUrl} alt="TAG" width={size} height={size} className="rounded-lg" />
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0" aria-label="TAG logo">
          <rect width="64" height="64" rx="14" fill="#1E3A8A" />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Inter, sans-serif"
            fontSize="24"
            fontWeight="800"
            fill="#ffffff"
          >
            TAG
          </text>
          <rect x="16" y="46" width="32" height="5" rx="2.5" fill="#F97316" />
        </svg>
      )}
      {showText && (
        <div className={cn('leading-tight', textClassName)}>
          <div className={cn('text-base font-extrabold tracking-tight', variant === 'light' ? 'text-white' : 'text-foreground')}>
            TAG <span className="text-accent">- MPS</span>
          </div>
          <div className={cn('text-[10px] font-medium uppercase tracking-wider', variant === 'light' ? 'text-white/70' : 'text-muted-foreground')}>
            Manpower Plan vs Actual
          </div>
        </div>
      )}
    </div>
  );
}
