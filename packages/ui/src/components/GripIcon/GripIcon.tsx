export interface GripIconProps {
  size?: number;
  className?: string;
}

/** Six-dot drag-handle affordance. No baked-in pointer-events or color —
 *  a consumer that needs `pointer-events: none` (e.g. a button wrapping it)
 *  or a specific color passes those via `className`/`currentColor`. */
export function GripIcon({ size = 14, className }: GripIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Two columns of three dots */}
      {[3, 7, 11].map((cy) =>
        [4, 10].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} fill="currentColor" />
        )),
      )}
    </svg>
  );
}
