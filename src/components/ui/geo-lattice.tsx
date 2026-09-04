// Eight-point star (khatam) lattice — the app's one signature surface treatment, used at low
// opacity behind auth screens and the landing hero. Pure geometry, no logo investment
// (DESIGN.md §12: placeholder triangle stays until MSSN supplies the real mark).
// id: pass a unique value when more than one instance renders on the same page.
export function GeoLattice({
  className,
  id = "geo-lattice",
}: {
  className?: string;
  id?: string;
}) {
  return (
    <svg aria-hidden="true" className={className}>
      <defs>
        <pattern id={id} width="72" height="72" patternUnits="userSpaceOnUse">
          <rect
            x="20"
            y="20"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <rect
            x="20"
            y="20"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            transform="rotate(45 36 36)"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
