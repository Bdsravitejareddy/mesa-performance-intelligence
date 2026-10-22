// Shown instantly on navigation while a page's data loads.
export default function Loading() {
  return <div className="app-frame" data-theme="nature" aria-busy="true" aria-label="Loading">
    <aside className="sidebar skeleton-sidebar"><span className="skeleton-block" style={{ width: 120, height: 28 }} />{Array.from({ length: 10 }, (_, index) => <span key={index} className="skeleton-block" style={{ height: 30, marginTop: 10 }} />)}</aside>
    <div className="main-column"><div className="main-content skeleton-content">
      <span className="skeleton-block" style={{ width: "34%", height: 14 }} />
      <span className="skeleton-block" style={{ width: "56%", height: 34, marginTop: 12 }} />
      <div className="skeleton-grid">{Array.from({ length: 4 }, (_, index) => <span key={index} className="skeleton-block skeleton-card" />)}</div>
      <span className="skeleton-block" style={{ height: 260, marginTop: 16 }} />
    </div></div>
  </div>;
}
