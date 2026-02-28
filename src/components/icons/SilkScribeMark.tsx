import React from "react";
import iconSrc from "../../assets/silkscribe-icon.png";

const SilkScribeMark = ({
  width,
  height,
}: {
  width?: number | string;
  height?: number | string;
}) => (
  <img
    src={iconSrc}
    alt="SilkScribe logo"
    width={width ?? 126}
    height={height ?? 135}
    className="object-contain"
  />
);

export default SilkScribeMark;
