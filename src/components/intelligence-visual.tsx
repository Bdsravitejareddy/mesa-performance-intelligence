"use client";

import { useEffect, useRef, useState } from "react";

// Sunlit gold particles with a few moss-green nodes, after the Optimind network sphere.
const colors = ["#fff1c9", "#f3c86b", "#e9a93a", "#ffe6a8", "#a9c98f"] as const;

type Particle = { x: number; y: number; color: (typeof colors)[number]; radius: number };

// Static layout used for the first paint and when the viewer prefers reduced motion.
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

// Points evenly spread on a unit sphere (Fibonacci lattice) with precomputed neighbour links.
const SPHERE_POINTS = 150;
const spherePoints = Array.from({ length: SPHERE_POINTS }, (_, index) => {
  const y = 1 - (index / (SPHERE_POINTS - 1)) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = index * 2.399963229728653;
  return { x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius, color: colors[index % colors.length], size: index % 9 === 0 ? 2.4 : 1.3, phase: (index * 0.37) % (Math.PI * 2) };
});
const sphereLinks = spherePoints.flatMap((point, index) => spherePoints
  .map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z) }))
  .filter(({ otherIndex, distance }) => otherIndex > index && distance < 0.32)
  .slice(0, 3)
  .map(({ otherIndex }) => [index, otherIndex] as const));

export function IntelligenceVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let visible = true;
    let pointerX = 0;
    let pointerY = 0;
    const host = canvas.parentElement?.parentElement ?? canvas;
    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    host.addEventListener("pointermove", onPointer);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    setAnimated(true);
    let tiltX = 0;
    let tiltY = 0;
    const start = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible) return;
      const t = (now - start) / 1000;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(width, height) * 0.4;
      // Ease the tilt towards the pointer so the sphere follows the cursor gently.
      tiltX += (pointerY * 0.35 - tiltX) * 0.04;
      tiltY += (pointerX * 0.5 - tiltY) * 0.04;
      const spin = t * 0.18 + tiltY;
      const cosY = Math.cos(spin), sinY = Math.sin(spin), cosX = Math.cos(0.35 + tiltX), sinX = Math.sin(0.35 + tiltX);
      const projected = spherePoints.map((point) => {
        const x1 = point.x * cosY - point.z * sinY;
        const z1 = point.x * sinY + point.z * cosY;
        const y1 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        const breathe = 1 + Math.sin(t * 0.8) * 0.02;
        const perspective = 2.6 / (2.6 - z2);
        return { sx: width / 2 + x1 * scale * perspective * breathe, sy: height / 2 + y1 * scale * perspective * breathe, depth: (z2 + 1) / 2, point };
      });
      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.6;
      for (const [a, b] of sphereLinks) {
        const depth = (projected[a].depth + projected[b].depth) / 2;
        context.strokeStyle = `rgba(255, 241, 201, ${0.05 + depth * 0.22})`;
        context.beginPath();
        context.moveTo(projected[a].sx, projected[a].sy);
        context.lineTo(projected[b].sx, projected[b].sy);
        context.stroke();
      }
      for (const item of [...projected].sort((a, b) => a.depth - b.depth)) {
        const twinkle = 0.65 + Math.sin(t * 2.2 + item.point.phase) * 0.35;
        const size = item.point.size * (0.6 + item.depth * 0.9);
        context.globalAlpha = (0.25 + item.depth * 0.75) * twinkle;
        context.shadowColor = item.point.color;
        context.shadowBlur = 8 * item.depth;
        context.fillStyle = item.point.color;
        context.beginPath();
        context.arc(item.sx, item.sy, size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div className={`intelligence-visual${animated ? " is-animated" : ""}`} aria-hidden="true">
      <span className="intelligence-glow" />
      <canvas ref={canvasRef} className="intelligence-canvas" />
      <svg viewBox="0 0 500 360" focusable="false">
        <defs>
          <radialGradient id="intelligence-cloud">
            <stop offset="0%" stopColor="#f3c86b" stopOpacity=".30" />
            <stop offset="70%" stopColor="#b07d1c" stopOpacity=".08" />
            <stop offset="100%" stopColor="#13201a" stopOpacity="0" />
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
