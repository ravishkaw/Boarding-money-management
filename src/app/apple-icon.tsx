import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS (which ignores SVG icons): the same house mark as icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
        }}
      >
        <svg width="140" height="140" viewBox="0 0 64 64">
          <path
            d="M32 14 L50 29 H45 V48 H36 V38 H28 V48 H19 V29 H14 Z"
            fill="#ffffff"
          />
        </svg>
      </div>
    ),
    size,
  );
}
