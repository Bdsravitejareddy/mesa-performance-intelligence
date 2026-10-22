// Reasoning on demand: the insight shows first; the explanation opens only when asked for.
export function Why({ children, label = "Why?" }: { children: React.ReactNode; label?: string }) {
  return <details className="why"><summary><span>{label}</span></summary><div className="why-body">{children}</div></details>;
}
