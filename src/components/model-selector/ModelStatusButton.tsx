import React from "react";

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

interface ModelStatusButtonProps {
  status: ModelStatus;
  displayText: string;
  isDropdownOpen: boolean;
  onClick: () => void;
  className?: string;
}

const ModelStatusButton: React.FC<ModelStatusButtonProps> = ({
  status,
  displayText,
  isDropdownOpen,
  onClick,
  className = "",
}) => {
  const getStatusColor = (status: ModelStatus): string => {
    switch (status) {
      case "ready":
        return "bg-ss-state-success";
      case "loading":
        return "bg-ss-brand-highlight animate-pulse";
      case "downloading":
        return "bg-ss-brand-secondary animate-pulse";
      case "extracting":
        return "bg-ss-state-info animate-pulse";
      case "error":
        return "bg-ss-state-danger";
      case "unloaded":
        return "bg-ss-text-tertiary/60";
      case "none":
        return "bg-ss-state-danger";
      default:
        return "bg-ss-text-tertiary/60";
    }
  };

  return (
    <button
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-[var(--ss-radius-pill)] border border-ss-border-subtle bg-ss-bg-surface-alt px-3 py-2 text-ss-text-secondary transition-[border-color,background-color,color] duration-150 hover:border-ss-brand-secondary/35 hover:text-ss-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35 ${className}`}
      title={`Model status: ${displayText}`}
    >
      <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
      <span className="max-w-32 truncate text-sm font-medium">{displayText}</span>
      <svg
        className={`h-3 w-3 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
};

export default ModelStatusButton;
