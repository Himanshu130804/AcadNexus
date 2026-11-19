import React, { useMemo } from "react";
import { generateQrMatrix, qrSvgPath } from "../../utils/qrCode";
import "./QrCode.css";

/** Scannable QR code rendered as inline SVG (no external dependency or network request). */
export default function QrCode({ value, size = 176, label = "QR code" }) {
  const rendered = useMemo(() => { try { return qrSvgPath(generateQrMatrix(value)); } catch { return null; } }, [value]);
  if (!rendered) return <p className="qr-error" role="alert">Unable to generate a QR code for this link.</p>;
  return <svg className="qr-code" width={size} height={size} viewBox={`0 0 ${rendered.size} ${rendered.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={rendered.size} height={rendered.size} fill="#ffffff" />
    <path d={rendered.path} fill="#000000" />
  </svg>;
}
