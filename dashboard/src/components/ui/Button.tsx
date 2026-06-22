import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover shadow-sm border border-transparent",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-muted-bg",
  outline:
    "bg-transparent text-foreground border border-border-strong hover:bg-muted-bg",
  ghost: "bg-transparent text-muted hover:bg-muted-bg hover:text-foreground border border-transparent",
  danger:
    "bg-transparent text-red-700 border border-transparent hover:bg-red-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
