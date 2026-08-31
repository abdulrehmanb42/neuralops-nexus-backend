// Galaxy backdrop: soft nebula glows layered behind the constellation.
// Pure CSS gradients — zero runtime cost, theme-aware via tokens.
export function Nebula({ dim }: { dim?: boolean }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${dim ? "opacity-60" : ""}`}>
      <div className="absolute -left-40 -top-40 size-[560px] rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_65%)] blur-2xl" />
      <div className="absolute -right-52 top-24 size-[640px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--live)_12%,transparent),transparent_65%)] blur-2xl" />
      <div className="absolute -bottom-56 left-1/3 size-[700px] rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_60%)] blur-3xl" />
    </div>
  );
}
