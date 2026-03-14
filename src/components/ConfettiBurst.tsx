/**
 * ConfettiBurst — Lightweight CSS-only confetti explosion.
 *
 * Renders ~40 colored pieces that fall from the top of the viewport.
 * Auto-removes itself after the animation completes (2.5s).
 */

import React, { useEffect, useState, useMemo } from 'react';

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#3b82f6', '#ec4899', '#a855f7', '#eab308', '#14b8a6'];
const PIECE_COUNT = 40;

interface ConfettiBurstProps {
  /** Set to true to trigger the burst */
  trigger: boolean;
}

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({ trigger }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 2600);
      return () => clearTimeout(t);
    }
  }, [trigger]);

  const pieces = useMemo(() =>
    Array.from({ length: PIECE_COUNT }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: COLORS[i % COLORS.length],
      delay: `${Math.random() * 0.6}s`,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
      shape: Math.random() > 0.5 ? '50%' : '2px',
    })),
  []);

  if (!show) return null;

  return (
    <div className="confetti-container">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.shape,
            animationDelay: p.delay,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};
