import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import mgpLogo from '../assests/MGP_Logo_white (1).png';

interface MaintainIntroProps {
  onComplete: () => void;
  theme?: 'light' | 'dark';
  primaryColor?: string;
}

// Lighten a hex color
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
  return `rgb(${r}, ${g}, ${b})`;
}

// Font Awesome Free 6.7.2 brain icon — CC BY 4.0 License
// https://fontawesome.com/license/free — viewBox 0 0 512 512
const FA_BRAIN_PATH =
  'M184 0c30.9 0 56 25.1 56 56l0 400c0 30.9-25.1 56-56 56c-28.9 0-52.7-21.9-55.7-50.1' +
  'c-5.2 1.4-10.7 2.1-16.3 2.1c-35.3 0-64-28.7-64-64c0-7.4 1.3-14.6 3.6-21.2' +
  'C21.4 367.4 0 338.2 0 304c0-31.9 18.7-59.5 45.8-72.3C37.1 220.8 32 207 32 192' +
  'c0-30.7 21.6-56.3 50.4-62.6C80.8 123.9 80 118 80 112c0-29.9 20.6-55.1 48.3-62.1' +
  'C131.3 21.9 155.1 0 184 0z' +
  'M328 0c28.9 0 52.6 21.9 55.7 49.9c27.8 7 48.3 32.1 48.3 62.1c0 6-.8 11.9-2.4 17.4' +
  'c28.8 6.2 50.4 31.9 50.4 62.6c0 15-5.1 28.8-13.8 39.7C493.3 244.5 512 272.1 512 304' +
  'c0 34.2-21.4 63.4-51.6 74.8c2.3 6.6 3.6 13.8 3.6 21.2c0 35.3-28.7 64-64 64' +
  'c-5.6 0-11.1-.7-16.3-2.1c-3 28.2-26.8 50.1-55.7 50.1c-30.9 0-56-25.1-56-56l0-400' +
  'c0-30.9 25.1-56 56-56z';

// Neural network nodes — interleaved L/R so both hemispheres animate together
const BRAIN_NEURAL_NODES = [
  // Upper zone — alternating left & right
  { x: 100, y: 100 }, { x: 410, y: 100 },
  { x: 140, y: 80 },  { x: 370, y: 80 },
  { x: 170, y: 130 }, { x: 340, y: 130 },
  { x: 80, y: 160 },  { x: 430, y: 160 },
  { x: 130, y: 180 }, { x: 380, y: 180 },
  { x: 180, y: 170 }, { x: 330, y: 170 },
  // Middle zone — alternating left & right
  { x: 60, y: 240 },  { x: 450, y: 240 },
  { x: 110, y: 230 }, { x: 400, y: 230 },
  { x: 160, y: 250 }, { x: 350, y: 250 },
  { x: 90, y: 300 },  { x: 420, y: 300 },
  { x: 145, y: 290 }, { x: 370, y: 290 },
  { x: 190, y: 280 }, { x: 320, y: 280 },
  // Lower zone — alternating left & right
  { x: 80, y: 360 },  { x: 430, y: 360 },
  { x: 130, y: 370 }, { x: 380, y: 370 },
  { x: 175, y: 350 }, { x: 340, y: 350 },
  { x: 110, y: 420 }, { x: 400, y: 420 },
  { x: 160, y: 430 }, { x: 350, y: 430 },
  // Interior / cross-hemisphere
  { x: 215, y: 150 }, { x: 295, y: 150 },
  { x: 205, y: 260 }, { x: 305, y: 260 },
  { x: 210, y: 380 }, { x: 300, y: 380 },
  // Extra density — deep nodes
  { x: 120, y: 210 }, { x: 390, y: 210 },
  { x: 155, y: 320 }, { x: 360, y: 320 },
];

// Distance helper
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Generate jagged lightning arc between two points
function generateLightningPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const perpX = -dy / len;
  const perpY = dx / len;
  const segments = 4 + Math.floor(Math.random() * 3);
  const jitter = len * 0.13;
  let path = `M ${x1} ${y1}`;
  for (let s = 1; s < segments; s++) {
    const t = s / segments;
    const offset = (Math.random() - 0.5) * 2 * jitter;
    path += ` L ${(x1 + dx * t + perpX * offset).toFixed(1)} ${(y1 + dy * t + perpY * offset).toFixed(1)}`;
  }
  path += ` L ${x2} ${y2}`;
  return path;
}

// Generate nodes — cascade ripples outward from spark origin
function generateNeuralNodes() {
  const sparkOrigin = { x: 256, y: 30 };
  return BRAIN_NEURAL_NODES.map((node, i) => {
    const d = dist(node, sparkOrigin);
    const cascadeDelay = (d / 520) * 700;
    return {
      id: i,
      x: node.x + (Math.random() - 0.5) * 12,
      y: node.y + (Math.random() - 0.5) * 12,
      delay: cascadeDelay + Math.random() * 60,
      size: 4 + Math.random() * 3,
    };
  });
}

// Connect nearby nodes with lightning arcs
function generateConnections(nodes: ReturnType<typeof generateNeuralNodes>) {
  const connections: { from: number; to: number; delay: number; firing: boolean; lightningPath: string }[] = [];
  nodes.forEach((node, i) => {
    const nearby = nodes
      .map((other, j) => ({ index: j, d: dist(node, other) }))
      .filter(({ index, d }) => index !== i && d < 140 && d > 30)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    nearby.forEach(({ index }) => {
      const exists = connections.some(
        c => (c.from === i && c.to === index) || (c.from === index && c.to === i)
      );
      if (!exists) {
        connections.push({
          from: i,
          to: index,
          delay: node.delay + 30,
          firing: Math.random() > 0.3,
          lightningPath: generateLightningPath(node.x, node.y, nodes[index].x, nodes[index].y),
        });
      }
    });
  });
  return connections;
}

// Generate explosion particles
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360 + Math.random() * 20,
    distance: 150 + Math.random() * 200,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 100,
    duration: 400 + Math.random() * 200,
  }));
}

// Energy particles that stream from brain area to center during converge
function generateConvergeParticles(count: number) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 60 + Math.random() * 120;
    return {
      startX: Math.cos(angle) * radius,
      startY: Math.sin(angle) * radius - 25,
      size: 2 + Math.random() * 3,
      delay: Math.random() * 250,
      duration: 350 + Math.random() * 250,
    };
  });
}

// Vortex spiral particles — orbit and collapse into portal
function generateVortexParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360,
    radius: 60 + Math.random() * 80,
    size: 1.5 + Math.random() * 2.5,
    delay: i * 25,
  }));
}

// Starfield — random dots across the viewport
function generateStars(count: number) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 0.5 + Math.random() * 1.5,
    brightness: 0.3 + Math.random() * 0.7,
  }));
}

// Comet trail embers — left behind each AI ghost
function generateCometTrails(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    offset: (i / count) * 100,
    size: 1 + Math.random() * 3,
    drift: (Math.random() - 0.5) * 20,
    delay: i * 40,
    dur: 300 + Math.random() * 400,
  }));
}

// Orbiting data halo — dots/dashes circling merged AI
function generateHaloOrbs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360,
    radius: 55 + (i % 3) * 8,
    size: i % 4 === 0 ? 6 : 2,
    isDash: i % 4 === 0,
    speed: 8 + (i % 3) * 2,
  }));
}

// Dimensional rift bolts — jagged lightning radiating from merge
function generateRiftBolts(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + (Math.random() - 0.5) * 40;
    const len = 50 + Math.random() * 70;
    const rad = (angle * Math.PI) / 180;
    const segs = 3 + Math.floor(Math.random() * 3);
    let d = 'M 0 0';
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const jitter = (Math.random() - 0.5) * 25;
      const x = Math.cos(rad) * len * t + Math.sin(rad) * jitter;
      const y = Math.sin(rad) * len * t - Math.cos(rad) * jitter;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return { d, delay: Math.random() * 80 };
  });
}

export function MaintainIntro({ onComplete, theme = 'dark', primaryColor = '#e5e5e5' }: MaintainIntroProps) {
  const isDark = theme === 'dark';
  
  type Phase = 'awaken' | 'neural' | 'converge' | 'text' | 'reveal' | 'vortex' | 'burst' | 'power' | 'exit';
  const [phase, setPhase] = useState<Phase>('awaken');

  // Memoize generated elements
  const neuralNodes = useMemo(() => generateNeuralNodes(), []);
  const connections = useMemo(() => generateConnections(neuralNodes), [neuralNodes]);
  const explosionParticles = useMemo(() => generateParticles(24), []);
  const convergeParticles = useMemo(() => generateConvergeParticles(20), []);
  const vortexParticles = useMemo(() => generateVortexParticles(28), []);
  const riftBolts = useMemo(() => generateRiftBolts(10), []);
  const stars = useMemo(() => generateStars(80), []);
  const cometTrailsL = useMemo(() => generateCometTrails(8), []);
  const cometTrailsR = useMemo(() => generateCometTrails(8), []);
  const haloOrbs = useMemo(() => generateHaloOrbs(16), []);

  // Color palette
  const colors = {
    bg: isDark ? '#0a4264' : '#0a4264',
    bgGradient: isDark 
      ? `radial-gradient(ellipse at center, #0d5a7f 0%, #0a4264 70%)`
      : `radial-gradient(ellipse at center, #0d5a7f 0%, #0a4264 70%)`,


    accent: lightenColor(primaryColor, 0.2),
    accentBright: lightenColor(primaryColor, 0.4),
    accentGlow: primaryColor,
    text: '#f8fafc',
    textMuted: 'rgba(248,250,252,0.4)',
    neural: lightenColor(primaryColor, 0.3),
  };

  // Animation phases ~8s (cascade → converge → MAINTAIN → ghosts → portal vortex → collision → merged AI)
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('neural'), 300),      // Brain draws + cascade fires
      setTimeout(() => setPhase('converge'), 1600),   // Peak flash → energy converges
      setTimeout(() => setPhase('text'), 2400),       // MAINTAIN text appears
      setTimeout(() => setPhase('reveal'), 3400),     // AI ghosts appear, letters scatter
      setTimeout(() => setPhase('vortex'), 3900),     // Portal vortex opens
      setTimeout(() => setPhase('burst'), 5100),      // AIs collide — dimensional burst
      setTimeout(() => setPhase('power'), 5700),      // Merged AI + tagline
      setTimeout(() => setPhase('exit'), 9200),       // Fade out (3.5s reading time)
      setTimeout(() => onComplete(), 9600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  // Phase checks
  const isAwake = phase !== 'awaken';
  const isNeural = ['neural', 'converge', 'text', 'reveal', 'vortex', 'burst', 'power', 'exit'].includes(phase);
  const isConverging = ['converge', 'text', 'reveal', 'vortex', 'burst', 'power', 'exit'].includes(phase);
  const isTextVisible = ['text', 'reveal', 'vortex', 'burst', 'power', 'exit'].includes(phase);
  const isRevealing = ['reveal', 'vortex', 'burst', 'power', 'exit'].includes(phase);
  const isVortex = ['vortex', 'burst', 'power', 'exit'].includes(phase);
  const isBursting = ['burst', 'power', 'exit'].includes(phase);
  const isPowered = ['power', 'exit'].includes(phase);

  // MAINTAIN characters with AI positions identified
  const chars = 'MAINTAIN'.split('');

  // ═══ WEB AUDIO SOUND ENGINE ═══
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasInteracted = useRef(false);

  // Track user gesture so AudioContext can start
  useEffect(() => {
    const markInteracted = () => { hasInteracted.current = true; };
    window.addEventListener('click', markInteracted, { once: true });
    window.addEventListener('touchstart', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });
    return () => {
      window.removeEventListener('click', markInteracted);
      window.removeEventListener('touchstart', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  const getAudioCtx = useCallback((): AudioContext | null => {
    if (!hasInteracted.current) return null; // Browser requires user gesture
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { return null; }
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => { audioCtxRef.current?.close(); };
  }, []);

  // Electrical hum — rising sawtooth oscillator w/ bandpass
  useEffect(() => {
    if (!isVortex || isBursting) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 1.0);
      filter.type = 'bandpass';
      filter.frequency.value = 200;
      filter.Q.value = 2;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.3);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.9);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.2);
    } catch { /* audio not available */ }
  }, [isVortex, isBursting, getAudioCtx]);

  // Collision BOOM — noise burst + sub bass impact
  useEffect(() => {
    if (phase !== 'burst') return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const len = 0.5;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.25, ctx.currentTime);
      nGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      noise.connect(lp).connect(nGain).connect(ctx.destination);
      noise.start(ctx.currentTime);
      // Sub bass
      const sub = ctx.createOscillator();
      const sGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(60, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.4);
      sGain.gain.setValueAtTime(0.3, ctx.currentTime);
      sGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      sub.connect(sGain).connect(ctx.destination);
      sub.start(ctx.currentTime);
      sub.stop(ctx.currentTime + 0.5);
    } catch { /* audio not available */ }
  }, [phase, getAudioCtx]);

  // Ambient shimmer — soft sustained tone for powered state
  useEffect(() => {
    if (!isPowered || phase === 'exit') return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 440;
      osc2.type = 'sine';
      osc2.frequency.value = 554; // C# — major third
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.4);
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 1.4);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
      osc1.connect(gain).connect(ctx.destination);
      osc2.connect(gain);
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 2.0);
      osc2.stop(ctx.currentTime + 2.0);
    } catch { /* audio not available */ }
  }, [isPowered, phase, getAudioCtx]);

  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: colors.bgGradient,
        opacity: phase === 'exit' ? 0 : 1,
        filter: phase === 'exit' ? 'blur(8px)' : 'none',
        transition: 'opacity 300ms ease-out, filter 300ms ease-out',
        animation: phase === 'burst' ? 'screen-shake 0.5s ease-out' : 'none',
      }}
    >
      {/* ═══ MGP WATERMARK — bottom right corner, visible early ═══ */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '28px',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          opacity: isNeural && !isBursting ? 0.15 : isBursting && !isPowered ? 0 : isPowered ? 0 : 0,
          transform: isNeural ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 800ms ease-out',
          pointerEvents: 'none' as const,
        }}
      >
        <img
          src={mgpLogo}
          alt=""
          style={{
            height: '22px',
            width: 'auto',
            objectFit: 'contain',
            filter: `brightness(0.9) drop-shadow(0 0 4px ${colors.accentGlow}40)`,
          }}
        />
      </div>

      {/* Animated gradient overlay */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none' as const,
          background: `
            radial-gradient(ellipse 80% 50% at 50% 50%, ${colors.accentGlow}08 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 30% 30%, ${colors.accentBright}05 0%, transparent 40%),
            radial-gradient(ellipse 60% 40% at 70% 70%, ${colors.accent}05 0%, transparent 40%)
          `,
          opacity: isAwake ? 1 : 0,
          transition: 'opacity 800ms ease-out',
        }}
      />

      {/* ═══ STARFIELD WARP BACKGROUND ═══ */}
      {stars.map((star, i) => (
        <div
          key={`star-${i}`}
          style={{
            position: 'absolute',
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: isVortex && !isBursting
              ? `${star.size + 40 + (star.y < 50 ? (50 - star.y) * 0.8 : (star.y - 50) * 0.8)}px`
              : `${star.size}px`,
            borderRadius: isVortex && !isBursting ? '50% / 20%' : '50%',
            backgroundColor: `rgba(255,255,255,${star.brightness})`,
            boxShadow: isVortex
              ? `0 0 4px rgba(255,255,255,${star.brightness * 0.5})`
              : 'none',
            transform: isVortex && !isBursting
              ? `translateY(${star.y < 50 ? '-20px' : '20px'})`
              : 'none',
            opacity: isAwake ? (isBursting ? 0 : 1) : 0,
            transition: isVortex
              ? 'all 800ms cubic-bezier(0.4, 0, 0.2, 1)'
              : 'all 600ms ease-out',
            pointerEvents: 'none' as const,
          }}
        />
      ))}

      {/* Central awakening pulse */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          width: isAwake ? '20px' : '4px',
          height: isAwake ? '20px' : '4px',
          backgroundColor: colors.accentBright,
          boxShadow: `
            0 0 ${isAwake ? 60 : 20}px ${colors.accentGlow},
            0 0 ${isAwake ? 120 : 40}px ${colors.accentGlow}80,
            0 0 ${isAwake ? 180 : 60}px ${colors.accentGlow}40
          `,
          opacity: isNeural ? 0 : 1,
          transition: 'all 400ms ease-out',
        }}
      />

      {/* Brain with neural network firing inside */}
      <svg 
        style={{
          position: 'absolute',
          pointerEvents: 'none' as const,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(75vw, 400px)',
          height: 'min(75vw, 400px)',
          opacity: isNeural && !isConverging ? 1 : 0,
          transition: 'opacity 400ms ease-out',
        }}
        viewBox="-20 -20 552 552"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="pulse-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="brain-outer-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          </filter>
          <clipPath id="brain-clip">
            <path d={FA_BRAIN_PATH} />
          </clipPath>
        </defs>

        {/* Breathing wrapper — subtle rhythmic pulse */}
        <g style={{
          transformOrigin: '256px 256px',
          animation: isNeural && !isConverging ? 'brain-breathe 2.5s ease-in-out infinite' : 'none',
        }}>

        {/* Glow build-up — intensifies to peak before converge */}
        <path
          d={FA_BRAIN_PATH}
          fill="none"
          stroke={colors.accentBright}
          strokeWidth="5"
          filter="url(#brain-outer-glow)"
          style={{
            opacity: 0,
            animation: isNeural && !isConverging ? 'glow-buildup 1.3s ease-in forwards' : 'none',
          }}
        />

        {/* Brain silhouette — subtle fill */}
        <path
          d={FA_BRAIN_PATH}
          fill={`${colors.accentGlow}0a`}
          stroke="none"
          style={{
            opacity: isNeural ? 1 : 0,
            transition: 'opacity 600ms ease-out 200ms',
          }}
        />

        {/* Brain outline — draws on with dash animation */}
        <path
          d={FA_BRAIN_PATH}
          fill="none"
          stroke={colors.neural}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 2400,
            strokeDashoffset: isNeural ? 0 : 2400,
            opacity: 0.55,
            transition: 'stroke-dashoffset 1200ms ease-out',
          }}
        />

        {/* Clipped group with color shift */}
        <g clipPath="url(#brain-clip)" style={{
          animation: isNeural && !isConverging ? 'neural-color-shift 1.3s ease-in forwards' : 'none',
        }}>

        {/* Lightning arc connections between nodes */}
        {connections.map((conn, i) => (
          <path
            key={`conn-${i}`}
            d={conn.lightningPath}
            fill="none"
            stroke={colors.neural}
            strokeWidth="0.6"
            strokeLinecap="round"
            style={{
              strokeDasharray: 300,
              strokeDashoffset: isNeural ? 0 : 300,
              opacity: 0.3,
              transition: `stroke-dashoffset 500ms ease-out ${conn.delay}ms`,
            }}
          />
        ))}

        {/* Firing pulses traveling along lightning arcs */}
        {connections.filter(c => c.firing).map((conn, i) => {
          const dur = 0.5 + (i % 5) * 0.15;
          const beginDelay = (conn.delay / 1000) + (i * 0.08);
          return (
            <circle
              key={`fire-${i}`}
              r="4"
              fill={i % 3 === 0 ? colors.accentBright : colors.accent}
              filter="url(#pulse-glow)"
              style={{
                opacity: isNeural && !isConverging ? 0.8 : 0,
                transition: 'opacity 300ms',
              }}
            >
              <animateMotion
                dur={`${dur}s`}
                repeatCount="indefinite"
                begin={`${beginDelay}s`}
                path={conn.lightningPath}
              />
            </circle>
          );
        })}

        {/* Expanding rings at select nodes */}
        {neuralNodes.filter((_, i) => i % 4 === 0).map((node, i) => (
          <circle
            key={`flash-${i}`}
            cx={node.x}
            cy={node.y}
            fill="none"
            stroke={colors.accentBright}
            strokeWidth="1"
            style={{
              opacity: isNeural && !isConverging ? 1 : 0,
            }}
          >
            <animate
              attributeName="r"
              values="0;20;0"
              dur={`${1.2 + i * 0.25}s`}
              begin={`${0.5 + i * 0.2}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.4;0"
              dur={`${1.2 + i * 0.25}s`}
              begin={`${0.5 + i * 0.2}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Neural nodes (small dots) */}
        {neuralNodes.map((node) => (
          <circle
            key={`node-${node.id}`}
            cx={node.x}
            cy={node.y}
            r={isNeural ? node.size : 0}
            fill={colors.accent}
            style={{
              opacity: 0.7,
              transition: `r 300ms ease-out ${node.delay}ms`,
            }}
          />
        ))}

        </g>{/* end brain-clip group */}
        </g>{/* end breathing wrapper */}
      </svg>

      {/* Peak energy flash when brain converges */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          pointerEvents: 'none' as const,
          width: '200px',
          height: '200px',
          background: `radial-gradient(circle, ${colors.accentBright}60 0%, ${colors.accentGlow}20 40%, transparent 70%)`,
          opacity: isConverging && !isTextVisible ? 1 : 0,
          transition: 'all 500ms ease-out',
        }}
      />

      {/* Converge particles — energy streams from brain toward center */}
      {convergeParticles.map((p, i) => (
        <div
          key={`conv-${i}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            borderRadius: '50%',
            pointerEvents: 'none' as const,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: i % 2 === 0 ? colors.accentBright : colors.accent,
            boxShadow: `0 0 6px ${colors.accentGlow}`,
            transform: isConverging
              ? 'translate(-50%, -50%) scale(0.3)'
              : `translate(calc(-50% + ${p.startX}px), calc(-50% + ${p.startY}px))`,
            opacity: isConverging && !isTextVisible ? 0.9 : 0,
            transition: `transform ${p.duration}ms cubic-bezier(0.4, 0, 0.2, 1) ${p.delay}ms, opacity 100ms ease-out ${p.delay}ms`,
          }}
        />
      ))}

      {/* Shimmer/scan line effect */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none' as const,
          overflow: 'hidden',
          opacity: isTextVisible && !isRevealing ? 1 : 0,
          transition: 'opacity 200ms',
        }}
      >
        <div
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accentBright}60, transparent)`,
            top: '50%',
            animation: isTextVisible && !isRevealing ? 'shimmer 1.2s ease-in-out' : 'none',
          }}
        />
        <style>{`
          @keyframes shimmer {
            0% { transform: translateY(-200px); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(200px); opacity: 0; }
          }
        `}</style>
      </div>

      {/* Main content container */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>

        {/* MAINTAIN text + AI merge portal animation */}
        <div 
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '160px',
          }}
        >
          {/* Individual letter row — full MAINTAIN, fades during reveal */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              opacity: isTextVisible ? 1 : 0,
              transform: isTextVisible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              position: 'relative',
            }}
          >
            {chars.map((char, index) => {
              const isFirstAI = index === 1 || index === 2;
              const isSecondAI = index === 5 || index === 6;
              const isPartOfAI = isFirstAI || isSecondAI;
              const shouldFadeNonAI = isRevealing && !isPartOfAI;
              const shouldFadeAI = isRevealing && isPartOfAI;

              return (
                <span
                  key={index}
                  style={{
                    fontWeight: 200,
                    letterSpacing: '0.3em',
                    position: 'relative',
                    fontSize: 'clamp(2.8rem, 11vw, 4.5rem)',
                    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
                    color: isPartOfAI ? colors.accent : colors.text,
                    textShadow: isPartOfAI
                      ? `0 0 20px ${colors.accentGlow}80, 0 0 40px ${colors.accentGlow}30`
                      : `0 0 8px ${colors.accentGlow}15`,
                    opacity: shouldFadeNonAI || shouldFadeAI ? 0 : 1,
                    transform: shouldFadeNonAI
                      ? (index < 4
                        ? 'translateX(-80px) scale(0.3) rotate(-10deg)'
                        : 'translateX(80px) scale(0.3) rotate(10deg)')
                      : shouldFadeAI ? 'scale(1.3)' : 'scale(1)',
                    filter: shouldFadeNonAI ? 'blur(4px)' : 'none',
                    transition: shouldFadeAI
                      ? 'all 300ms ease-out'
                      : 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transitionDelay: isTextVisible && !isRevealing ? `${index * 80}ms` : '0ms',
                  }}
                >
                  {char}
                  {/* Sparkle dot on arrival */}
                  {isTextVisible && !isRevealing && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: colors.accentBright,
                        opacity: 0,
                        animation: `sparkle 0.6s ease-out ${300 + index * 80}ms forwards`,
                      }}
                    />
                  )}
                  {/* Bottom edge glow for AI letters */}
                  {isPartOfAI && isTextVisible && !isRevealing && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '2px',
                        left: '10%',
                        right: '10%',
                        height: '2px',
                        background: `linear-gradient(90deg, transparent, ${colors.accentBright}, transparent)`,
                        opacity: 0,
                        animation: `letter-underline 0.8s ease-out ${400 + index * 80}ms forwards`,
                      }}
                    />
                  )}
                </span>
              );
            })}
            {/* Scanning underline across the entire word */}
            {isTextVisible && !isRevealing && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '-6px',
                  left: 0,
                  right: 0,
                  height: '1px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '60%',
                    height: '100%',
                    background: `linear-gradient(90deg, transparent, ${colors.accentBright}80, ${colors.accentGlow}, ${colors.accentBright}80, transparent)`,
                    animation: 'scan-underline 1.8s ease-in-out 500ms forwards',
                    transform: 'translateX(-100%)',
                  }}
                />
              </div>
            )}
          </div>

          {/* ═══ GRAVITATIONAL LENSING WARP ═══ */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: isVortex
                ? `radial-gradient(circle, transparent 20%, ${colors.bg}10 40%, transparent 60%)`
                : 'none',
              backdropFilter: isVortex && !isBursting ? 'blur(1px)' : 'none',
              opacity: isVortex && !isBursting ? 1 : 0,
              transition: 'opacity 400ms ease-out',
              pointerEvents: 'none' as const,
              zIndex: 2,
            }}
          />
          {/* Lensing ring distortion */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: isVortex && !isBursting ? '320px' : '100px',
              height: isVortex && !isBursting ? '320px' : '100px',
              borderRadius: '50%',
              border: `1px solid ${colors.accentBright}15`,
              boxShadow: isVortex
                ? `inset 0 0 60px ${colors.accentGlow}15, 0 0 40px ${colors.accentGlow}10`
                : 'none',
              opacity: isVortex && !isBursting ? 1 : 0,
              transition: 'all 600ms cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: 'none' as const,
              zIndex: 2,
              animation: isVortex && !isBursting ? 'gravity-warp 2s ease-in-out infinite' : 'none',
            }}
          />

          {/* ═══ SCI-FI PORTAL MERGE SEQUENCE ═══ */}

          {/* Ghost AI — LEFT (spaghettifies into portal) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              fontWeight: 700,
              fontSize: 'clamp(2.5rem, 10vw, 4rem)',
              color: colors.accent,
              opacity: isRevealing && !isBursting ? 1 : 0,
              transform: isBursting
                ? 'translate(-50%, -50%) scaleX(0.1) scaleY(3) rotate(-25deg)'
                : isVortex
                  ? 'translate(calc(-50% - 30px), calc(-50% + 8px)) scaleX(0.8) scaleY(1.2) rotate(-10deg)'
                  : isRevealing
                    ? 'translate(calc(-50% - 110px), -50%)'
                    : 'translate(calc(-50% - 180px), -50%) scale(0.5)',
              textShadow: isVortex
                ? `0 0 30px ${colors.accentGlow},
                   -20px 0 25px ${colors.accentGlow}50,
                   -40px 0 20px ${colors.accentGlow}25,
                   -60px -5px 15px ${colors.accentGlow}10,
                   0 0 80px ${colors.accentGlow}`
                : `0 0 20px ${colors.accentGlow}, 0 0 40px ${colors.accentGlow}60`,
              filter: isBursting ? 'blur(8px) brightness(2.5)' : isVortex ? 'brightness(1.4)' : 'none',
              transition: isBursting
                ? 'all 200ms ease-in'
                : isVortex
                  ? 'all 1000ms cubic-bezier(0.25, 0.1, 0.25, 1)'
                  : isRevealing
                    ? 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease-out'
                    : 'all 200ms ease-out',
              pointerEvents: 'none' as const,
              whiteSpace: 'nowrap' as const,
              zIndex: 5,
            }}
          >
            AI
          </div>

          {/* Comet trail embers — LEFT AI */}
          {cometTrailsL.map((c, i) => (
            <div
              key={`comet-l-${i}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `${c.size}px`,
                height: `${c.size}px`,
                borderRadius: '50%',
                backgroundColor: i % 2 === 0 ? colors.accentBright : colors.accent,
                boxShadow: `0 0 ${c.size * 4}px ${colors.accentGlow}`,
                opacity: isVortex && !isBursting ? 0.7 : 0,
                transform: isVortex
                  ? `translate(calc(-50% - ${30 + c.offset * 0.8}px), calc(-50% + ${c.drift}px)) scale(${(0.3 + (c.offset / 100) * 0.7).toFixed(2)})`
                  : `translate(calc(-50% - ${110 + c.offset}px), calc(-50% + ${c.drift}px))`,
                transition: `all ${c.dur}ms cubic-bezier(0.4, 0, 0.2, 1) ${c.delay}ms`,
                pointerEvents: 'none' as const,
                zIndex: 4,
              }}
            />
          ))}

          {/* Ghost AI — RIGHT (spaghettifies into portal) */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              fontWeight: 700,
              fontSize: 'clamp(2.5rem, 10vw, 4rem)',
              color: colors.accent,
              opacity: isRevealing && !isBursting ? 1 : 0,
              transform: isBursting
                ? 'translate(-50%, -50%) scaleX(0.1) scaleY(3) rotate(25deg)'
                : isVortex
                  ? 'translate(calc(-50% + 30px), calc(-50% - 8px)) scaleX(0.8) scaleY(1.2) rotate(10deg)'
                  : isRevealing
                    ? 'translate(calc(-50% + 110px), -50%)'
                    : 'translate(calc(-50% + 180px), -50%) scale(0.5)',
              textShadow: isVortex
                ? `0 0 30px ${colors.accentGlow},
                   20px 0 25px ${colors.accentGlow}50,
                   40px 0 20px ${colors.accentGlow}25,
                   60px 5px 15px ${colors.accentGlow}10,
                   0 0 80px ${colors.accentGlow}`
                : `0 0 20px ${colors.accentGlow}, 0 0 40px ${colors.accentGlow}60`,
              filter: isBursting ? 'blur(8px) brightness(2.5)' : isVortex ? 'brightness(1.4)' : 'none',
              transition: isBursting
                ? 'all 200ms ease-in'
                : isVortex
                  ? 'all 1000ms cubic-bezier(0.25, 0.1, 0.25, 1)'
                  : isRevealing
                    ? 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease-out'
                    : 'all 200ms ease-out',
              pointerEvents: 'none' as const,
              whiteSpace: 'nowrap' as const,
              zIndex: 5,
            }}
          >
            AI
          </div>

          {/* Comet trail embers — RIGHT AI */}
          {cometTrailsR.map((c, i) => (
            <div
              key={`comet-r-${i}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `${c.size}px`,
                height: `${c.size}px`,
                borderRadius: '50%',
                backgroundColor: i % 2 === 0 ? colors.accentBright : colors.accent,
                boxShadow: `0 0 ${c.size * 4}px ${colors.accentGlow}`,
                opacity: isVortex && !isBursting ? 0.7 : 0,
                transform: isVortex
                  ? `translate(calc(-50% + ${30 + c.offset * 0.8}px), calc(-50% + ${c.drift}px)) scale(${(0.3 + (c.offset / 100) * 0.7).toFixed(2)})`
                  : `translate(calc(-50% + ${110 + c.offset}px), calc(-50% + ${c.drift}px))`,
                transition: `all ${c.dur}ms cubic-bezier(0.4, 0, 0.2, 1) ${c.delay}ms`,
                pointerEvents: 'none' as const,
                zIndex: 4,
              }}
            />
          ))}

          {/* ── SPINNING PORTAL VORTEX ── */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '240px',
              height: '240px',
              opacity: isVortex && !isBursting ? 1 : 0,
              transition: 'opacity 200ms ease-out',
              pointerEvents: 'none' as const,
              zIndex: 3,
            }}
          >
            {/* Outer ring — clockwise */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: colors.accentBright,
              borderRightColor: `${colors.accent}80`,
              boxShadow: `0 0 30px ${colors.accentGlow}60, inset 0 0 25px ${colors.accentGlow}20`,
              animation: isVortex ? 'portal-spin 1.2s linear infinite' : 'none',
            }} />
            {/* Mid ring — counter-clockwise dashed */}
            <div style={{
              position: 'absolute', top: '28px', left: '28px', right: '28px', bottom: '28px',
              borderRadius: '50%',
              border: `2px dashed ${colors.accent}50`,
              animation: isVortex ? 'portal-spin-rev 0.8s linear infinite' : 'none',
            }} />
            {/* Inner ring — fast clockwise */}
            <div style={{
              position: 'absolute', top: '50px', left: '50px', right: '50px', bottom: '50px',
              borderRadius: '50%',
              border: '2px solid transparent',
              borderBottomColor: colors.accentBright,
              borderLeftColor: `${colors.accent}90`,
              animation: isVortex ? 'portal-spin 0.6s linear infinite' : 'none',
            }} />
            {/* Swirling conic core */}
            <div style={{
              position: 'absolute', top: '65px', left: '65px', right: '65px', bottom: '65px',
              borderRadius: '50%',
              background: `conic-gradient(from 0deg, transparent, ${colors.accentBright}80, transparent 35%, ${colors.accent}60, transparent 70%, ${colors.accentBright}40, transparent)`,
              animation: isVortex ? 'portal-spin 0.4s linear infinite' : 'none',
              boxShadow: `0 0 50px ${colors.accentGlow}, 0 0 100px ${colors.accentGlow}50`,
            }} />
            {/* Pulsing event-horizon */}
            <div style={{
              position: 'absolute', top: '85px', left: '85px', right: '85px', bottom: '85px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${colors.accentBright} 0%, ${colors.accentGlow}80 50%, transparent 100%)`,
              animation: isVortex ? 'vortex-pulse 0.5s ease-in-out infinite' : 'none',
            }} />
          </div>

          {/* Vortex spiral particles */}
          {vortexParticles.map((p, i) => (
            <div
              key={`vp-${i}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `${p.size}px`,
                height: `${p.size}px`,
                borderRadius: '50%',
                backgroundColor: i % 3 === 0 ? colors.accentBright : i % 3 === 1 ? colors.accent : '#ffffff',
                boxShadow: `0 0 ${p.size * 3}px ${colors.accentGlow}`,
                opacity: isVortex && !isBursting ? 0.9 : 0,
                transform: `translate(-50%, -50%) rotate(${p.angle + (isVortex ? 720 : 0)}deg) translateX(${p.radius}px)`,
                transition: isVortex
                  ? `transform 1100ms cubic-bezier(0.4, 0, 0.2, 1) ${p.delay}ms, opacity 300ms ease-out`
                  : 'opacity 200ms',
                pointerEvents: 'none' as const,
              }}
            />
          ))}

          {/* Dimensional rift lightning — cracks at burst */}
          <svg
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '300px',
              height: '300px',
              overflow: 'visible',
              opacity: isBursting && !isPowered ? 1 : 0,
              transition: 'opacity 150ms',
              pointerEvents: 'none' as const,
              zIndex: 6,
            }}
            viewBox="-150 -150 300 300"
          >
            {riftBolts.map((bolt, i) => (
              <path
                key={`bolt-${i}`}
                d={bolt.d}
                fill="none"
                stroke={i % 2 === 0 ? colors.accentBright : '#ffffff'}
                strokeWidth={i % 3 === 0 ? '3' : '1.5'}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 6px ${colors.accentGlow}) drop-shadow(0 0 12px ${colors.accentBright})`,
                  animation: isBursting ? `bolt-flicker 0.12s ease-in-out ${bolt.delay}ms 4 alternate` : 'none',
                }}
              />
            ))}
          </svg>

          {/* Collision screen flash */}
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: '#ffffff',
              opacity: 0,
              animation: phase === 'burst' ? 'collision-flash 0.45s ease-out forwards' : 'none',
              pointerEvents: 'none' as const,
              zIndex: 20,
            }}
          />

          {/* Portal collapse rings */}
          {[0, 1, 2, 3, 4].map(ring => (
            <div
              key={`collapse-${ring}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: `${3 - ring * 0.5}px solid ${ring % 2 === 0 ? colors.accentBright : colors.accent}`,
                width: isBursting ? `${140 + ring * 80}px` : '0px',
                height: isBursting ? `${140 + ring * 80}px` : '0px',
                opacity: isBursting && !isPowered ? 0.8 - ring * 0.15 : 0,
                transition: `all ${400 + ring * 60}ms ease-out ${ring * 50}ms`,
                pointerEvents: 'none' as const,
              }}
            />
          ))}

          {/* MERGED AI — born from dimensional collision */}
          <div
            style={{
              position: isBursting ? 'relative' : 'absolute',
              top: isBursting ? 'auto' : '50%',
              left: isBursting ? 'auto' : '50%',
              fontWeight: 700,
              fontSize: 'clamp(4.5rem, 16vw, 8rem)',
              color: colors.accent,
              lineHeight: 1,
              opacity: isBursting ? 1 : 0,
              transform: isBursting
                ? (isPowered ? 'scale(1)' : 'scale(1.15)')
                : 'translate(-50%, -50%) scale(0)',
              textShadow: isPowered
                ? `0 0 30px ${colors.accentGlow}, 0 0 60px ${colors.accentGlow}, 0 0 120px ${colors.accentGlow}60`
                : 'none',
              transition: 'all 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              whiteSpace: 'nowrap' as const,
              zIndex: 10,
              animation: isBursting && !isPowered
                ? 'chromatic-settle 0.6s ease-out forwards'
                : 'none',
            }}
          >
            AI
            {/* Holographic sweep */}
            <span
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                animation: isPowered ? 'holo-sweep 0.8s ease-out 200ms' : 'none',
                pointerEvents: 'none' as const,
              }}
            />
            {/* Pulsing aura */}
            <span
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '150%',
                height: '150%',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${colors.accentGlow}25 0%, transparent 70%)`,
                animation: isBursting ? 'pulse-merge 1.5s ease-in-out infinite' : 'none',
                pointerEvents: 'none' as const,
              }}
            />
            {/* Orbiting tech halo */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '200px',
              height: '200px',
              opacity: isPowered ? 0.85 : 0,
              transition: 'opacity 500ms ease-out',
              animation: isPowered ? 'orbit-spin 8s linear infinite' : 'none',
              pointerEvents: 'none' as const,
            }}>
              {haloOrbs.map((orb, i) => {
                const rad = (orb.angle * Math.PI) / 180;
                const cx = 100 + Math.cos(rad) * orb.radius;
                const cy = 100 + Math.sin(rad) * orb.radius;
                return (
                  <span
                    key={`halo-${i}`}
                    style={{
                      position: 'absolute',
                      left: `${cx - orb.size / 2}px`,
                      top: `${cy - (orb.isDash ? 1 : orb.size / 2)}px`,
                      width: `${orb.size}px`,
                      height: orb.isDash ? '2px' : `${orb.size}px`,
                      borderRadius: orb.isDash ? '1px' : '50%',
                      backgroundColor: i % 3 === 0 ? colors.accentBright : i % 3 === 1 ? colors.accent : `${colors.text}80`,
                      boxShadow: `0 0 ${orb.size * 2}px ${colors.accentGlow}80`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* MAINTAIN label — reappears after merge */}
        <div
          style={{
            marginTop: '20px',
            opacity: isPowered ? 1 : 0,
            transform: isPowered ? 'translateY(0)' : 'translateY(15px)',
            transition: 'all 400ms ease-out 100ms',
          }}
        >
          <span
            style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              letterSpacing: '0.35em',
              color: colors.text,
              textTransform: 'uppercase' as const,
            }}
          >
            MAINTAIN
          </span>
        </div>

        {/* Tagline with decorative lines */}
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            opacity: isPowered ? 1 : 0,
            transform: isPowered ? 'scaleX(1)' : 'scaleX(0.5)',
            transition: 'all 400ms ease-out 250ms',
          }}
        >
          <div style={{ height: '1px', width: '40px', background: `linear-gradient(90deg, transparent, ${colors.textMuted})` }} />
          <span style={{ color: colors.textMuted, fontSize: '14px', letterSpacing: '0.25em', textTransform: 'uppercase' as const, fontWeight: 300 }}>
            Infrastructure Intelligence
          </span>
          <div style={{ height: '1px', width: '40px', background: `linear-gradient(90deg, ${colors.textMuted}, transparent)` }} />
        </div>

        {/* MGP Company Logo — grand reveal */}
        <div
          style={{
            marginTop: '28px',
            opacity: isPowered ? 1 : 0,
            transform: isPowered ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
            transition: 'all 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 300ms',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Glow halo behind logo */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '200px',
              height: '60px',
              borderRadius: '50%',
              background: `radial-gradient(ellipse, ${colors.accentGlow}20 0%, transparent 70%)`,
              animation: isPowered ? 'mgp-glow-pulse 2.5s ease-in-out infinite' : 'none',
              pointerEvents: 'none' as const,
            }}
          />
          {/* The actual logo */}
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <img
              src={mgpLogo}
              alt="MGP"
              style={{
                height: '44px',
                width: 'auto',
                objectFit: 'contain',
                filter: `brightness(1) drop-shadow(0 0 8px ${colors.accentGlow}60) drop-shadow(0 0 20px ${colors.accentGlow}25)`,
                pointerEvents: 'none' as const,
              }}
            />
            {/* Holographic scan sweep */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)',
                animation: isPowered ? 'mgp-holo-sweep 1.5s ease-out 600ms forwards' : 'none',
                transform: 'translateX(-200%)',
                pointerEvents: 'none' as const,
              }}
            />
          </div>
          {/* Decorative line accents */}
          <div style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: isPowered ? '80px' : '0px',
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${colors.accentGlow}60, transparent)`,
            transition: 'width 600ms ease-out 800ms',
          }} />
        </div>
      </div>

      {/* Particle explosion burst */}
      {explosionParticles.map((particle, i) => (
        <div
          key={`particle-${i}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            borderRadius: '50%',
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: i % 3 === 0 ? colors.accentBright : colors.accent,
            transform: isBursting
              ? `translate(-50%, -50%) rotate(${particle.angle}deg) translateX(${particle.distance}px)`
              : 'translate(-50%, -50%)',
            opacity: isBursting && !isPowered ? 0.8 : 0,
            transition: `all ${particle.duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${particle.delay}ms`,
          }}
        />
      ))}

      {/* Shockwave rings */}
      {[0, 1, 2].map((ring) => (
        <div
          key={`ring-${ring}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            pointerEvents: 'none' as const,
            width: isBursting ? `${300 + ring * 100}px` : '50px',
            height: isBursting ? `${300 + ring * 100}px` : '50px',
            border: `${2 - ring * 0.5}px solid ${colors.accent}`,
            opacity: isBursting && phase !== 'exit' ? 0.3 - ring * 0.1 : 0,
            transition: `all 600ms ease-out ${ring * 80}ms`,
          }}
        />
      ))}

      {/* Light beam rays */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
        <div
          key={`ray-${i}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transformOrigin: 'left',
            width: isBursting ? '400px' : '0px',
            height: '1px',
            background: `linear-gradient(90deg, ${colors.accentBright}40, transparent)`,
            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            opacity: isBursting && phase !== 'exit' ? 0.4 : 0,
            transition: `all 500ms ease-out ${i * 30}ms`,
          }}
        />
      ))}

      {/* Global styles for animations */}
      <style>{`
        @keyframes sparkle {
          0% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(0) translateY(-10px); }
        }
        @keyframes pulse-merge {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.2); }
        }
        @keyframes brain-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.018); }
        }
        @keyframes neural-color-shift {
          0% { filter: hue-rotate(-30deg) brightness(0.6); }
          35% { filter: hue-rotate(-10deg) brightness(0.9); }
          70% { filter: hue-rotate(10deg) brightness(1.2); }
          100% { filter: hue-rotate(25deg) brightness(1.8) saturate(1.3); }
        }
        @keyframes glow-buildup {
          0% { opacity: 0; }
          30% { opacity: 0.1; }
          60% { opacity: 0.25; }
          85% { opacity: 0.5; }
          100% { opacity: 0.85; }
        }
        @keyframes portal-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes portal-spin-rev {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes vortex-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes bolt-flicker {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
        @keyframes collision-flash {
          0% { opacity: 0; }
          12% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes chromatic-settle {
          0% { text-shadow: -6px 0 3px #ff004080, 6px 0 3px #00d4ff80, 0 0 40px ${colors.accentGlow}; filter: brightness(2.5); }
          35% { text-shadow: -3px 0 2px #ff004040, 3px 0 2px #00d4ff40, 0 0 60px ${colors.accentGlow}; filter: brightness(1.6); }
          100% { text-shadow: 0 0 30px ${colors.accentGlow}, 0 0 60px ${colors.accentGlow}, 0 0 120px ${colors.accentGlow}60; filter: brightness(1); }
        }
        @keyframes holo-sweep {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(200%); }
        }
        @keyframes screen-shake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 2px); }
          20% { transform: translate(5px, -3px); }
          30% { transform: translate(-3px, 4px); }
          40% { transform: translate(4px, -2px); }
          50% { transform: translate(-5px, 1px); }
          60% { transform: translate(3px, -4px); }
          70% { transform: translate(-2px, 3px); }
          80% { transform: translate(4px, -1px); }
          90% { transform: translate(-1px, 2px); }
        }
        @keyframes gravity-warp {
          0%, 100% { transform: translate(-50%, -50%) scale(1); border-color: rgba(255,255,255,0.05); }
          50% { transform: translate(-50%, -50%) scale(1.06); border-color: rgba(255,255,255,0.12); }
        }
        @keyframes orbit-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes mgp-glow-pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes mgp-holo-sweep {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(200%); }
        }
        @keyframes letter-underline {
          0% { opacity: 0; transform: scaleX(0); }
          60% { opacity: 0.9; transform: scaleX(1.2); }
          100% { opacity: 0.6; transform: scaleX(1); }
        }
        @keyframes scan-underline {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
  );
}
