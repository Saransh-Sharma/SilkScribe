import React from "react";
import iconSrc from "../../assets/menu-bar-icon-ui.webp";

const SilkScribeMark = ({
  width,
  height,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) => (
  <img
    src={iconSrc}
    alt="SilkScribe logo"
    width={width ?? 126}
    height={height ?? width ?? 126}
    className={`object-contain ${className ?? ""}`}
  />
);

export default SilkScribeMark;
