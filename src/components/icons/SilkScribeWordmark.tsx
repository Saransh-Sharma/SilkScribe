import React from "react";
import iconSrc from "../../assets/silkscribe-icon.png";

const APP_NAME = "SilkScribe";

const SilkScribeWordmark = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  const resolvedHeight = height ?? 44;
  const textSize = Math.max(14, Math.round(resolvedHeight * 0.5));

  return (
    <div
      className={`flex items-center gap-2 ${className ?? ""}`}
      style={{ width, height: resolvedHeight }}
    >
      <img
        src={iconSrc}
        alt="SilkScribe logo"
        width={resolvedHeight}
        height={resolvedHeight}
        className="shrink-0 object-contain"
      />
      <span
        className="whitespace-nowrap font-semibold tracking-wide text-ss-text-primary"
        style={{ fontSize: textSize, lineHeight: 1 }}
      >
        {APP_NAME}
      </span>
    </div>
  );
};

export default SilkScribeWordmark;
