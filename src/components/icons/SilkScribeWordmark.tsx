import React from "react";
import bannerSrc from "../../assets/banner-ui.webp";

const BANNER_ASPECT_RATIO = 2992 / 1273;

const SilkScribeWordmark = ({
  width,
  height,
  className,
  imageClassName,
  fit = "contain",
}: {
  width?: number;
  height?: number;
  className?: string;
  imageClassName?: string;
  fit?: "contain" | "cover";
}) => {
  const resolvedHeight = height ?? 44;
  const resolvedWidth =
    width ?? Math.round(resolvedHeight * BANNER_ASPECT_RATIO);

  return (
    <div
      className={`block ${className ?? ""}`}
      style={{ width: resolvedWidth, height: resolvedHeight }}
    >
      <img
        src={bannerSrc}
        alt="SilkScribe"
        className={`h-full w-full ${
          fit === "cover" ? "object-cover" : "object-contain"
        } ${imageClassName ?? ""}`}
      />
    </div>
  );
};

export default SilkScribeWordmark;
