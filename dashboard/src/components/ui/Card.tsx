import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function Card({ children, className = "", padding = "md" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] ${paddingClasses[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
