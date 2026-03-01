import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close tooltip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTooltip]);

  const toggleTooltip = () => {
    setShowTooltip(!showTooltip);
  };

  const containerClasses = grouped
    ? "px-[14px] py-3"
    : "rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-[14px] py-3 shadow-[var(--ss-shadow-card)]";

  const titleBlockClasses = disabled ? "opacity-60" : "";
  const titleClasses = "text-sm font-semibold leading-5 text-ss-text-primary";
  const descriptionClasses =
    "text-xs leading-relaxed text-ss-text-tertiary max-w-[34rem]";
  const tooltipTrigger = (
    <div
      ref={tooltipRef}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        aria-label="More information"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ss-text-tertiary transition-colors duration-150 hover:bg-ss-brand-secondary/10 hover:text-ss-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/40"
        onClick={toggleTooltip}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {showTooltip && (
        <Tooltip targetRef={tooltipRef} position={tooltipPosition}>
          <p className="text-xs leading-relaxed text-ss-text-secondary">
            {description}
          </p>
        </Tooltip>
      )}
    </div>
  );

  if (layout === "stacked") {
    if (descriptionMode === "tooltip") {
      return (
        <div className={containerClasses}>
          <div className={`mb-3 flex items-center gap-2 ${titleBlockClasses}`}>
            <h3 className={titleClasses}>{title}</h3>
            {tooltipTrigger}
          </div>
          <div className="w-full text-ss-text-primary">{children}</div>
        </div>
      );
    }

    return (
      <div className={containerClasses}>
        <div className={`mb-3 ${titleBlockClasses}`}>
          <h3 className={titleClasses}>{title}</h3>
          <p className={`mt-1 ${descriptionClasses}`}>{description}</p>
        </div>
        <div className="w-full text-ss-text-primary">{children}</div>
      </div>
    );
  }

  const horizontalContainerClasses = grouped
    ? "flex min-h-12 items-center justify-between gap-4 px-[14px] py-3"
    : "flex min-h-12 items-center justify-between gap-4 rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-[14px] py-3 shadow-[var(--ss-shadow-card)]";

  if (descriptionMode === "tooltip") {
    return (
      <div className={horizontalContainerClasses}>
        <div className={`min-w-0 flex-1 ${titleBlockClasses}`}>
          <div className="flex items-center gap-2">
            <h3 className={titleClasses}>{title}</h3>
            {tooltipTrigger}
          </div>
        </div>
        <div className="relative shrink-0 text-ss-text-primary">{children}</div>
      </div>
    );
  }

  return (
    <div className={horizontalContainerClasses}>
      <div className={`min-w-0 flex-1 ${titleBlockClasses}`}>
        <h3 className={titleClasses}>{title}</h3>
        <p className={`mt-1 ${descriptionClasses}`}>{description}</p>
      </div>
      <div className="relative shrink-0 text-ss-text-primary">{children}</div>
    </div>
  );
};
