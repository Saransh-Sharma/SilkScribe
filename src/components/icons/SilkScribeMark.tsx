import React from "react";

const SilkScribeMark = ({
  width,
  height,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) => {
  const resolvedWidth = width ?? 126;
  const resolvedHeight = height ?? width ?? 126;

  return (
    <svg
      viewBox="0 0 48 48"
      width={resolvedWidth}
      height={resolvedHeight}
      className={className}
      role="img"
      aria-label="SilkScribe logo"
      fill="none"
    >
      <defs>
        <linearGradient id="silk-mark-fill" x1="8" y1="5" x2="41" y2="44">
          <stop stopColor="#D9A441" />
          <stop offset="0.46" stopColor="#B52C54" />
          <stop offset="1" stopColor="#71152F" />
        </linearGradient>
        <linearGradient id="silk-mark-glint" x1="15" y1="11" x2="31" y2="33">
          <stop stopColor="#FFF8E8" stopOpacity="0.94" />
          <stop offset="1" stopColor="#F2C665" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M24 3.75c8.5 0 15.4 6.9 15.4 15.4 0 10.55-8.68 18.7-15.4 25.1-6.72-6.4-15.4-14.55-15.4-25.1C8.6 10.65 15.5 3.75 24 3.75Z"
        fill="url(#silk-mark-fill)"
      />
      <path
        d="M24 10.3 29.8 22 24 34.8 18.2 22 24 10.3Z"
        fill="rgba(255,248,239,.18)"
        stroke="rgba(255,248,239,.78)"
        strokeWidth="1.25"
      />
      <circle cx="24" cy="22" r="2.8" fill="#FFF8EF" />
      <path
        d="M14.5 17.2c2.2-5.3 6.06-7.7 11.55-7.25"
        stroke="url(#silk-mark-glint)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default SilkScribeMark;
