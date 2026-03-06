/**
 * DomApp logo — stylized Cyrillic "П" (doorway/arch) matching the app icon.
 * Renders as an inline SVG for crisp display at any size.
 */
export default function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
    >
      {/* Shield / house shape background */}
      <path
        d="M50 4L12 20v30c0 24 16 40 38 46 22-6 38-22 38-46V20L50 4z"
        fill="url(#shield-gradient)"
        stroke="#3b82f6"
        strokeWidth="4"
      />
      {/* Inner white area */}
      <path
        d="M50 12L20 25v25c0 20 13 33 30 38 17-5 30-18 30-38V25L50 12z"
        fill="white"
        fillOpacity="0.95"
      />
      {/* П letter — doorway shape */}
      <path
        d="M30 36h40v8H62v24h-8V44H46v24h-8V44H30v-8z"
        fill="#1e293b"
      />
      <defs>
        <linearGradient id="shield-gradient" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
    </svg>
  );
}
