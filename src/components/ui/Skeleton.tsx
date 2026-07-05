import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: "sm" | "md" | "lg" | "pill";
}

const roundedClasses = {
  sm: "rounded-[var(--ss-radius-sm)]",
  md: "rounded-[var(--ss-radius-md)]",
  lg: "rounded-[var(--ss-radius-lg)]",
  pill: "rounded-full",
};

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  rounded = "pill",
  ...props
}) => (
  <div
    aria-hidden="true"
    className={`relative overflow-hidden bg-ss-bg-surface-alt before:absolute before:inset-0 before:-translate-x-full before:animate-[ss-skeleton-shimmer_1.45s_ease-in-out_infinite] before:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--ss-bg-elevated)_64%,transparent),transparent)] ${roundedClasses[rounded]} ${className}`}
    {...props}
  />
);
