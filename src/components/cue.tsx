import type { ReactNode } from "react";
import { cueFor } from "@/lib/cues";

// A label that shows a one- or two-line meaning on hover or keyboard focus.
export function Cue({ label, children }: { label: string; children?: ReactNode }) {
  const cue = cueFor(label);
  if (!cue) return <>{children ?? label}</>;
  return <span className="cue" tabIndex={0}>{children ?? label}<span className="cue-card" role="tooltip">{cue}</span></span>;
}
