import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

type FormFieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  inline?: boolean;
  className?: string;
};

export function FormField({
  label,
  children,
  hint,
  inline = false,
  className = "",
}: FormFieldProps) {
  if (inline) {
    return (
      <label className={`inline-flex flex-wrap items-center gap-2 text-sm text-muted ${className}`}>
        <span>{label}</span>
        {children}
      </label>
    );
  }

  return (
    <label className={`block text-sm font-medium text-foreground ${className}`}>
      {label}
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${props.className ?? ""}`} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${props.className ?? ""}`} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${fieldClass} min-h-[6rem] resize-y leading-relaxed ${props.className ?? ""}`}
      {...props}
    />
  );
}

export function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 rounded border-border-strong text-brand focus:ring-accent/30 ${props.className ?? ""}`}
      {...props}
    />
  );
}

export function inputClassName() {
  return fieldClass;
}
