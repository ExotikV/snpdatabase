import type { ReactNode } from "react";

type AlertVariant = "success" | "error" | "info";

type AlertProps = {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
};

const variantClasses: Record<AlertVariant, string> = {
  success:
    "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]",
  error: "border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-fg)]",
  info: "border-border bg-[var(--info-bg)] text-foreground",
};

export function Alert({ variant, children, className = "" }: AlertProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${variantClasses[variant]} ${className}`}
      role="alert"
    >
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-muted">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </div>
  );
}
