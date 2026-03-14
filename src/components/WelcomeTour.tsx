import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Title2,
  Text,
  Button,
} from '@fluentui/react-components';
import {
  Map24Regular,
  Brain24Regular,
  ChartMultiple24Regular,
  ArrowRight24Regular,
  Play24Regular,
  Sparkle24Regular,
  DocumentBulletList24Regular,
  Lightbulb24Regular,
} from '@fluentui/react-icons';

interface WelcomeTourProps {
  onComplete: () => void;
  onSkip: () => void;
  theme?: 'light' | 'dark';
}

interface TourStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tip: string;
  /** data-tour attribute value to spotlight */
  selector: string;
  /** Card placement relative to spotlighted element */
  placement: 'bottom' | 'bottom-left' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'map',
    icon: <Map24Regular />,
    title: 'Infrastructure Map',
    description: 'Real-time view of all work orders across Lake Forest on an interactive GIS map.',
    tip: 'Click any marker to inspect details — red = critical, orange = high priority.',
    selector: '[data-tour="map"]',
    placement: 'bottom',
  },
  {
    id: 'wizard',
    icon: <Sparkle24Regular />,
    title: 'AI Analysis Wizard',
    description: 'Multi-agent AI analysis: prioritization, cost estimation, clustering, and crew dispatch — all in one wizard.',
    tip: 'Choose an analysis type and let 6 AI agents crunch the data in seconds.',
    selector: '[data-tour="wizard"]',
    placement: 'bottom',
  },
  {
    id: 'briefing',
    icon: <DocumentBulletList24Regular />,
    title: 'Executive Briefing',
    description: 'One-click AI summary with KPIs, health grades, and an AI-vs-Manual speed comparison.',
    tip: 'Great for quick stakeholder updates — all stats are live.',
    selector: '[data-tour="briefing"]',
    placement: 'bottom',
  },
  {
    id: 'analytics',
    icon: <Sparkle24Regular />,
    title: 'NLP Dashboard Builder',
    description: 'Type any question in natural language and the AI builds a custom analytics dashboard.',
    tip: 'Try "Show me pothole severity by neighborhood" to see it in action.',
    selector: '[data-tour="analytics"]',
    placement: 'bottom',
  },
  {
    id: 'decay',
    icon: <ChartMultiple24Regular />,
    title: 'Decay Simulator',
    description: 'Predict infrastructure degradation over time using Monte Carlo simulation.',
    tip: 'Slide the timeline to see how conditions worsen without intervention.',
    selector: '[data-tour="decay"]',
    placement: 'bottom',
  },
  {
    id: 'ai-chat',
    icon: <Brain24Regular />,
    title: 'AI Chat Panel',
    description: 'Chat directly with MAINTAIN AI — ask questions, get recommendations, trigger agent tasks.',
    tip: 'From here you can also access Agent Traces, Responsible AI, and Semantic Kernel panels.',
    selector: '[data-tour="ai-chat"]',
    placement: 'bottom-left',
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const WelcomeTour: React.FC<WelcomeTourProps> = ({ onComplete, onSkip, theme = 'dark' }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const isDark = theme === 'dark';
  const resizeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure the target element
  const measureTarget = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    } else {
      // Fallback: center of header bar
      setRect({ top: 6, left: window.innerWidth / 2 - 40, width: 80, height: 32 });
    }
  }, [currentStep]);

  useEffect(() => {
    measureTarget();
    const handleResize = () => {
      if (resizeRef.current) clearTimeout(resizeRef.current);
      resizeRef.current = setTimeout(measureTarget, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeRef.current) clearTimeout(resizeRef.current);
    };
  }, [measureTarget]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleComplete = () => {
    setIsExiting(true);
    localStorage.setItem('infrawatch-tour-completed', 'true');
    setTimeout(() => onComplete(), 300);
  };

  const handleSkip = () => {
    setIsExiting(true);
    localStorage.setItem('infrawatch-tour-completed', 'true');
    setTimeout(() => onSkip(), 300);
  };

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Compute card position
  const getCardStyle = (): React.CSSProperties => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const pad = 14;
    switch (step.placement) {
      case 'bottom':
        return { top: rect.top + rect.height + pad, left: Math.max(16, rect.left + rect.width / 2 - 180) };
      case 'bottom-left':
        return { top: rect.top + rect.height + pad, left: Math.max(16, rect.left + rect.width - 360) };
      case 'left':
        return { top: rect.top, left: Math.max(16, rect.left - 360 - pad) };
      case 'right':
        return { top: rect.top, left: rect.left + rect.width + pad };
      default:
        return { top: rect.top + rect.height + pad, left: rect.left };
    }
  };

  return (
    <div
      className="tour-spotlight-overlay"
      style={{ opacity: isExiting ? 0 : 1, transition: 'opacity 0.3s ease' }}
    >
      {/* Backdrop */}
      <div className="tour-spotlight-backdrop" />

      {/* Spotlight hole (cut out of backdrop) */}
      {rect && (
        <div
          className="tour-spotlight-hole"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Info card */}
      <div className="tour-spotlight-card" key={step.id} style={getCardStyle()}>
        {/* Step header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-primary)',
          }}>
            {step.icon}
          </div>
          <div>
            <Title2 style={{ fontSize: 16, margin: 0, color: isDark ? '#f8fafc' : '#1e293b' }}>{step.title}</Title2>
            <Text size={200} style={{ color: isDark ? 'rgba(248,250,252,0.5)' : 'rgba(30,41,59,0.5)' }}>
              {currentStep + 1} of {TOUR_STEPS.length}
            </Text>
          </div>
        </div>

        <Text size={300} style={{ display: 'block', marginBottom: 12, lineHeight: 1.6, color: isDark ? '#f8fafc' : '#1e293b' }}>
          {step.description}
        </Text>

        {/* Tip */}
        <div style={{
          background: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.06)',
          border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)'}`,
          borderRadius: 8, padding: '10px 12px',
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
        }}>
          <Lightbulb24Regular style={{ color: 'var(--accent-warning)', flexShrink: 0, width: 18, height: 18 }} />
          <Text size={200} style={{ color: isDark ? 'rgba(248,250,252,0.7)' : 'rgba(30,41,59,0.7)' }}>
            {step.tip}
          </Text>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              style={{
                width: i === currentStep ? 20 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0,
                background: i === currentStep ? 'var(--accent-primary)' : i < currentStep ? 'var(--accent-success)' : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button appearance="subtle" onClick={handleSkip} size="small"
            style={{ color: isDark ? 'rgba(248,250,252,0.5)' : 'rgba(30,41,59,0.5)' }}>
            Skip
          </Button>
          <div style={{ display: 'flex', gap: 6 }}>
            {currentStep > 0 && (
              <Button appearance="outline" onClick={handlePrevious} size="small"
                style={{ borderRadius: 8, color: isDark ? '#f8fafc' : '#1e293b' }}>
                Prev
              </Button>
            )}
            <Button
              onClick={handleNext}
              icon={isLastStep ? <Play24Regular style={{ color: 'var(--accent-on-primary)' }} /> : <ArrowRight24Regular style={{ color: 'var(--accent-on-primary)' }} />}
              iconPosition="after"
              size="small"
              style={{
                background: 'var(--accent-primary)', color: 'var(--accent-on-primary)', border: 'none',
                borderRadius: 8, fontWeight: 600,
              }}
            >
              {isLastStep ? 'Start' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTour;
