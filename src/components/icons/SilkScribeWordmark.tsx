/* eslint-disable i18next/no-literal-string -- Product name is invariant. */
import React from "react";
import SilkScribeMark from "./SilkScribeMark";

const SilkScribeWordmark = ({
  width,
  height,
  className,
  imageClassName,
}: {
  width?: number;
  height?: number;
  className?: string;
  imageClassName?: string;
  imageScale?: number;
  fit?: "contain" | "cover";
}) => {
  const resolvedHeight = height ?? 44;
  const resolvedWidth = width ?? Math.round(resolvedHeight * 4.8);
  const markSize = Math.max(22, Math.round(resolvedHeight * 0.78));

  return (
    <div
      className={`flex items-center gap-[0.48em] ${className ?? ""}`}
      style={{
        width: resolvedWidth,
        height: resolvedHeight,
        fontSize: Math.max(16, resolvedHeight * 0.44),
      }}
      role="img"
      aria-label="SilkScribe"
    >
      <span className={`shrink-0 ${imageClassName ?? ""}`} aria-hidden="true">
        <SilkScribeMark width={markSize} height={markSize} />
      </span>
      <span className="whitespace-nowrap text-[1.04em] font-[750] tracking-[-0.055em] text-ss-text-primary">
        Silk<span className="font-[520] text-ss-text-secondary">Scribe</span>
      </span>
    </div>
  );
};

export default SilkScribeWordmark;
