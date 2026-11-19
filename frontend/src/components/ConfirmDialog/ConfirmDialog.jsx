import React, { useEffect } from "react";
import "./ConfirmDialog.css";

// Generic accessible modal. Closing is blocked while `busy` so an operation cannot be cancelled or repeated mid-flight.
export default function ConfirmDialog({ title, children, onClose, busy = false, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`cd-dialog${wide ? " cd-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
