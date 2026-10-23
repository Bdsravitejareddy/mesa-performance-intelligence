import type { ReactNode } from "react";
import { cueFor } from "@/lib/cues";

// A label that shows a one- or two-line meaning on hover or keyboard focus.
// focusable is off inside buttons, where a second focus stop would be invalid; hover still shows the cue.
export function Cue({ label, children, focusable = true }: { label: string; children?: ReactNode; focusable?: boolean }) {
  const cue = cueFor(label);
  if (!cue) return <>{children ?? label}</>;
  return <span className="cue" tabIndex={focusable ? 0 : undefined}>{children ?? label}<span className="cue-card" role="tooltip">{cue}</span></span>;
}
