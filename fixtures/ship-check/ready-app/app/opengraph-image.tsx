import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <img src="https://placehold.co/120x120" alt="" width={120} height={120} />
      Acme Plumbing
    </div>,
    size,
  );
}
