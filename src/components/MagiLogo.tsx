/**
 * MAGI Logo — Three interconnected nodes forming a triangle,
 * inspired by the MAGI supercomputer system from Evangelion
 * (MELCHIOR-1, BALTHASAR-2, CASPER-3).
 */
export default function MagiLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Connection lines between three nodes */}
      <line x1="16" y1="6" x2="6" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <line x1="16" y1="6" x2="26" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <line x1="6" y1="24" x2="26" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />

      {/* Inner triangle — data flow */}
      <line x1="16" y1="11" x2="10" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      <line x1="16" y1="11" x2="22" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      <line x1="10" y1="22" x2="22" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.2" />

      {/* Node 1 — top (MELCHIOR) */}
      <circle cx="16" cy="6" r="4" fill="#3b82f6" />
      <circle cx="16" cy="6" r="2" fill="#93c5fd" />

      {/* Node 2 — bottom-left (CASPER) */}
      <circle cx="6" cy="24" r="4" fill="#8b5cf6" />
      <circle cx="6" cy="24" r="2" fill="#c4b5fd" />

      {/* Node 3 — bottom-right (BALTHASAR) */}
      <circle cx="26" cy="24" r="4" fill="#f43f5e" />
      <circle cx="26" cy="24" r="2" fill="#fda4af" />

      {/* Center pulse — convergence point */}
      <circle cx="16" cy="18" r="1.5" fill="currentColor" opacity="0.25" />
    </svg>
  );
}
