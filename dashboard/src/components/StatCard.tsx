type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
