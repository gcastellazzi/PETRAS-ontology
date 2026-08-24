/*
 * The PETRAS mark: four core entities chained by DataLinks, with the three
 * service layers orbiting them. Layer colours are the ontology palette, so the
 * mark stays legible against either page theme without being re-tinted.
 */
export function PetrasLogo({ size = 34 }: { size?: number }) {
  return (
    <svg
      className="petras-logo"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="PETRAS"
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <line x1="9" y1="30" x2="17" y2="22" />
        <line x1="17" y1="22" x2="24" y2="15" />
        <line x1="24" y1="15" x2="31" y2="9" />
      </g>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.3">
        <line x1="17" y1="22" x2="9" y2="14" />
        <line x1="24" y1="15" x2="31" y2="24" />
        <line x1="24" y1="15" x2="17" y2="7" />
      </g>
      {/* service layers */}
      <circle cx="9" cy="14" r="2.4" fill="#56B6C2" />
      <circle cx="31" cy="24" r="2.4" fill="#C678DD" />
      <circle cx="17" cy="7" r="2.4" fill="#E06C75" />
      {/* core chain */}
      <circle cx="9" cy="30" r="3.4" fill="#E5C07B" />
      <circle cx="17" cy="22" r="3.4" fill="#98C379" />
      <circle cx="24" cy="15" r="3.4" fill="#61AFEF" />
      <circle cx="31" cy="9" r="3.4" fill="#D19A66" />
    </svg>
  );
}
