type BadgeVariant = "default" | "success" | "warning" | "error" | "muted" | "accent";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-muted-bg text-foreground border-border",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-[var(--error-bg)] text-[var(--error-fg)] border-[var(--error-border)]",
  muted: "bg-muted-bg text-muted border-border",
  accent: "bg-accent-muted text-foreground border-accent/20",
};

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}

export function statusBadgeVariant(
  status: string,
): BadgeVariant {
  switch (status.toLowerCase()) {
    case "sent":
      return "success";
    case "failed":
      return "error";
    case "pending":
      return "warning";
    default:
      return "muted";
  }
}
