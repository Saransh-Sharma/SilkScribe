import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      onPointerDown,
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      "ss-button relative isolate overflow-hidden inline-flex items-center justify-center gap-2 border font-semibold tracking-[-0.005em] cursor-pointer select-none transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-[var(--ss-duration-hover)] ease-[var(--ss-ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35 focus-visible:ring-offset-2 focus-visible:ring-offset-ss-bg-canvas disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.975]";

    const variantClasses = {
      primary:
        "text-ss-brand-primary-ink bg-ss-action-primary border-ss-action-primary shadow-[0_10px_28px_-16px_color-mix(in_srgb,var(--ss-action-primary)_72%,transparent),inset_0_1px_0_rgba(255,255,255,.22)] hover:bg-ss-action-primary-hover hover:border-ss-action-primary-hover hover:-translate-y-px active:bg-ss-action-primary-pressed active:border-ss-action-primary-pressed",
      "primary-soft":
        "text-ss-brand-secondary bg-ss-brand-secondary/12 border-ss-brand-secondary/20 hover:bg-ss-brand-secondary/18 hover:border-ss-brand-secondary/30",
      secondary:
        "text-ss-text-primary bg-ss-bg-elevated/72 border-ss-border-default shadow-[var(--ss-shadow-hairline)] backdrop-blur-xl hover:bg-ss-bg-elevated hover:border-ss-brand-secondary/24 hover:-translate-y-px",
      danger:
        "text-white bg-ss-action-danger border-ss-action-danger shadow-[var(--ss-shadow-card)] hover:bg-ss-action-danger-hover hover:border-ss-action-danger-hover hover:-translate-y-px",
      "danger-ghost":
        "text-ss-state-danger border-transparent hover:text-ss-state-danger hover:bg-ss-state-danger/10",
      ghost:
        "text-current border-transparent hover:bg-ss-bg-surface-alt hover:border-ss-brand-secondary/25",
    };

    const sizeClasses = {
      sm: "min-h-9 px-3 text-xs rounded-[var(--ss-radius-sm)]",
      md: "min-h-10 px-4 text-sm rounded-[var(--ss-radius-md)]",
      lg: "min-h-11 px-5 text-base rounded-[var(--ss-radius-md)]",
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        onPointerDown={(event) => {
          if (!event.currentTarget.disabled) {
            const button = event.currentTarget;
            const bounds = button.getBoundingClientRect();
            const ripple = document.createElement("span");
            const diameter = Math.max(bounds.width, bounds.height) * 1.55;
            ripple.className = "ss-button-ripple";
            ripple.style.width = `${diameter}px`;
            ripple.style.height = `${diameter}px`;
            ripple.style.left = `${event.clientX - bounds.left - diameter / 2}px`;
            ripple.style.top = `${event.clientY - bounds.top - diameter / 2}px`;
            button.appendChild(ripple);
            ripple.addEventListener("animationend", () => ripple.remove(), {
              once: true,
            });
          }
          onPointerDown?.(event);
        }}
        {...props}
      >
        <span className="relative z-[1] contents">{children}</span>
      </button>
    );
  },
);

Button.displayName = "Button";
