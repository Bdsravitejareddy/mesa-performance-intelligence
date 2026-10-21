const colors = ["#a78bfa", "#8b5cf6", "#53d8c8", "#f0bf6b", "#eb8ea7"] as const;

type Particle = { x: number; y: number; color: (typeof colors)[number]; radius: number };

const particles: Particle[] = Array.from({ length: 118 }, (_, index) => {
  const angle = index * 2.399963229728653;
  const spread = Math.sqrt((index + 0.5) / 118);
  const wobble = 0.78 + ((Math.sin(index * 12.9898) + 1) / 2) * 0.2;
  const x = 250 + Math.cos(angle) * spread * 171 * wobble;
  const y = 180 + Math.sin(angle) * spread * 127 * (0.88 + ((Math.cos(index * 4.73) + 1) / 2) * 0.18);
  return { x, y, color: colors[index % colors.length], radius: index % 7 === 0 ? 2.6 : 1.55 };
});

const connections = particles.flatMap((particle, index) => {
  const nearest = particles
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex, distance: Math.hypot(candidate.x - particle.x, candidate.y - particle.y) }))
    .filter(({ candidateIndex, distance }) => candidateIndex > index && distance < 37)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
  return nearest.map(({ candidate }) => ({ x1: particle.x, y1: particle.y, x2: candidate.x, y2: candidate.y }));
});

export function IntelligenceVisual() {
  return (
    <div className="intelligence-visual" aria-hidden="true">
      <span className="intelligence-glow" />
      <svg viewBox="0 0 500 360" focusable="false">
        <defs>
          <radialGradient id="intelligence-cloud">
            <stop offset="0%" stopColor="#965cff" stopOpacity=".22" />
            <stop offset="70%" stopColor="#5a37b9" stopOpacity=".08" />
            <stop offset="100%" stopColor="#15121e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="250" cy="180" rx="174" ry="136" fill="url(#intelligence-cloud)" />
        <g className="intelligence-links">
          {connections.map((line, index) => <line key={index} {...line} />)}
        </g>
        <g className="intelligence-particles">
          {particles.map((particle, index) => <circle key={index} cx={particle.x} cy={particle.y} r={particle.radius} fill={particle.color} />)}
        </g>
        <path className="intelligence-contour" d="M250 55c-24-26-63-24-78 1-45-12-79 19-72 57-33 15-40 57-12 81-17 35 3 72 37 78 5 38 43 57 77 40 17 22 39 33 48 34m0-291c24-26 63-24 78 1 45-12 79 19 72 57 33 15 40 57 12 81 17 35-3 72-37 78-5 38-43 57-77 40-17 22-39 33-48 34" />
      </svg>
    </div>
  );
}
