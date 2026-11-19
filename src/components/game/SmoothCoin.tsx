export function SmoothCoin({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span
      title="Smooth Coins"
      aria-label="Smooth Coins"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-amber bg-secondary font-mono font-semibold text-amber ${className}`}
    >
      S
    </span>
  );
}
