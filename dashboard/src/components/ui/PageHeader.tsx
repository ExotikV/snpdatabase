import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          SNP Detailing
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
