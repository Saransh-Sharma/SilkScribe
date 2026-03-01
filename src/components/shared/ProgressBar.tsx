import React from "react";

export interface ProgressData {
  id: string;
  percentage: number;
  speed?: number;
  label?: string;
}

interface ProgressBarProps {
  progress: ProgressData[];
  className?: string;
  size?: "small" | "medium" | "large";
  showSpeed?: boolean;
  showLabel?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = "",
  size = "medium",
  showSpeed = false,
  showLabel = false,
}) => {
  const sizeClasses = {
    small: "w-16 h-1",
    medium: "w-20 h-1.5",
    large: "w-24 h-2",
  };

  const progressClasses = sizeClasses[size];

  if (progress.length === 0) {
    return null;
  }

  if (progress.length === 1) {
    // Single progress bar
    const item = progress[0];
    const percentage = Math.max(0, Math.min(100, item.percentage));

    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div
          className={`${progressClasses} overflow-hidden rounded-full bg-ss-bg-elevated`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-ss-brand-highlight to-ss-brand-secondary transition-[width] duration-200 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {(showSpeed || showLabel) && (
          <div className="min-w-fit text-xs tabular-nums text-ss-text-tertiary">
            {showLabel && item.label && (
              <span className="me-2">{item.label}</span>
            )}
            {showSpeed && item.speed !== undefined && item.speed > 0 ? (
              // eslint-disable-next-line i18next/no-literal-string
              <span>{item.speed.toFixed(1)}MB/s</span>
            ) : showSpeed ? (
              <span>Downloading...</span>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Multiple progress bars
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        {progress.map((item) => {
          const percentage = Math.max(0, Math.min(100, item.percentage));
          return (
            <div
              key={item.id}
              title={item.label || `${percentage}%`}
              className="h-1.5 w-8 overflow-hidden rounded-full bg-ss-bg-elevated"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-ss-brand-highlight to-ss-brand-secondary transition-[width] duration-200 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="min-w-fit text-xs text-ss-text-tertiary">
        {progress.length} downloading...
      </div>
    </div>
  );
};

export default ProgressBar;
