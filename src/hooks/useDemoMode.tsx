/**
 * useDemoMode — Automated timed walkthrough for hackathon judges.
 *
 * Sequences through the app's 10 key features on a timer so judges can
 * see every capability without needing to navigate manually.
 *
 * Flow:
 *   1. Executive Briefing   — AI KPIs, health grade, cost overview
 *   2. Map View             — Live Leaflet map with pulsing markers & layers
 *   3. Analysis Wizard      — Multi-agent pipeline (6 agents in action)
 *   4. Decay Simulator      — Predictive degradation modeling
 *   5. NLP Dashboard        — Natural language → auto-generated charts
 *   6. Report Generator     — Code Interpreter charts (matplotlib)
 *   7. Model Router & RAG   — 5-model routing + RAG knowledge retrieval
 *   8. Semantic Kernel      — 8 plugins, live orchestration
 *   9. Agent Tracing        — OpenTelemetry distributed traces
 *  10. Responsible AI       — Content Safety + governance
 *
 * Total demo time: ~100 seconds (adjustable per step)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import React from 'react';
import {
  DataBarVertical24Regular,
  Sparkle24Regular,
  ArrowTrending24Regular,
  Comment24Regular,
  Brain24Regular,
  Eye24Regular,
  Shield24Regular,
  Map24Regular,
  DocumentBulletList24Regular,
  RouterRegular,
} from '@fluentui/react-icons';
import { useApp } from '../context/AppContext';
import type { OverlayId } from '../context/AppContext';

export interface DemoStep {
  id: string;
  label: string;
  description: string;
  overlay: OverlayId;
  durationMs: number;
  icon: React.ReactNode;
  /** Narration text shown in the floating bar — helps judges understand what they're seeing */
  narration?: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'briefing',
    label: 'Executive Briefing',
    description: 'AI-generated infrastructure summary with KPIs and health grades',
    overlay: 'briefing',
    durationMs: 10000,
    icon: <DataBarVertical24Regular style={{ fontSize: 20 }} />,
    narration: 'AI analyzed 1,281 work orders and generated this executive summary before any human opened the app.',
  },
  {
    id: 'map',
    label: 'Live Infrastructure Map',
    description: 'Leaflet map with priority-coded markers, crew locations, ArcGIS overlays',
    overlay: 'mapModal',
    durationMs: 8000,
    icon: <Map24Regular style={{ fontSize: 20 }} />,
    narration: 'Real Lake Forest GIS data displayed with priority-coded pulsing markers and crew locations.',
  },
  {
    id: 'analysis',
    label: 'Analysis Wizard',
    description: '6-agent pipeline: Analysis → Prioritize → Crew → Dispatch → Report',
    overlay: 'analysisWizard',
    durationMs: 12000,
    icon: <Sparkle24Regular style={{ fontSize: 20 }} />,
    narration: 'Watch 6 AI agents collaborate in real-time — each routed to its optimal Foundry model.',
  },
  {
    id: 'decay',
    label: 'Decay Simulator',
    description: 'Predictive infrastructure degradation modeling with Monte Carlo simulation',
    overlay: 'decayVisualizer',
    durationMs: 10000,
    icon: <ArrowTrending24Regular style={{ fontSize: 20 }} />,
    narration: 'Scrub the timeline to see how infrastructure degrades over 12 months without intervention.',
  },
  {
    id: 'nlp',
    label: 'NLP Dashboard',
    description: 'Natural-language → auto-generated analytics dashboard with live charts',
    overlay: 'nlpDashboard',
    durationMs: 10000,
    icon: <Comment24Regular style={{ fontSize: 20 }} />,
    narration: 'Type any question in plain English and GPT-4o generates a live dashboard via Code Interpreter.',
  },
  {
    id: 'report',
    label: 'Report Generator',
    description: 'AI-powered reports with Code Interpreter–generated matplotlib charts',
    overlay: 'report',
    durationMs: 10000,
    icon: <DocumentBulletList24Regular style={{ fontSize: 20 }} />,
    narration: 'GPT-4.1 generates infrastructure reports with embedded matplotlib visualizations.',
  },
  {
    id: 'modelRouter',
    label: 'Model Router & RAG',
    description: '5 Foundry models across 3 tiers + RAG over 10 municipal knowledge docs',
    overlay: 'modelRouter',
    durationMs: 10000,
    icon: <RouterRegular style={{ fontSize: 20 }} />,
    narration: 'See which model handles each task — GPT-4.1, GPT-4.1-mini, GPT-4o, Phi-4, Phi-4-reasoning.',
  },
  {
    id: 'sk',
    label: 'Semantic Kernel',
    description: 'Microsoft AI orchestration — 7 agent plugins with live invocation',
    overlay: 'skPanel',
    durationMs: 10000,
    icon: <Brain24Regular style={{ fontSize: 20 }} />,
    narration: 'Semantic Kernel v1.39 orchestrates 8 plugins — invoke any agent through the SK planner.',
  },
  {
    id: 'traces',
    label: 'Agent Tracing',
    description: 'OpenTelemetry distributed tracing exported to App Insights',
    overlay: 'traceViewer',
    durationMs: 10000,
    icon: <Eye24Regular style={{ fontSize: 20 }} />,
    narration: 'Every agent call is traced with model, tokens, latency — exported to Azure Application Insights.',
  },
  {
    id: 'rai',
    label: 'Responsible AI',
    description: 'Azure Content Safety (4-category) + decision audit trail',
    overlay: 'responsibleAI',
    durationMs: 10000,
    icon: <Shield24Regular style={{ fontSize: 20 }} />,
    narration: 'All AI outputs pass through Azure Content Safety before reaching operations managers.',
  },
];

export interface DemoModeState {
  isRunning: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  currentStep: DemoStep | null;
  steps: DemoStep[];
  progress: number; // 0-100 within current step
  totalSteps: number;
}

export interface DemoModeActions {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  goToStep: (index: number) => void;
}

export function useDemoMode(): [DemoModeState, DemoModeActions] {
  const { openOverlay, closeOverlay } = useApp();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepStartRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const remainingRef = useRef<number>(0);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
  }, []);

  // Advance to a specific step
  const goToStep = useCallback((index: number) => {
    clearTimers();

    if (index < 0 || index >= DEMO_STEPS.length) {
      // Demo complete
      setIsRunning(false);
      setIsPaused(false);
      setCurrentStepIndex(-1);
      setProgress(0);
      closeOverlay();
      return;
    }

    const step = DEMO_STEPS[index];
    setCurrentStepIndex(index);
    setProgress(0);
    setIsPaused(false);
    stepStartRef.current = Date.now();

    // Open the overlay for this step
    openOverlay(step.overlay);

    // Progress bar updater (every 100ms)
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - stepStartRef.current;
      const pct = Math.min(100, (elapsed / step.durationMs) * 100);
      setProgress(pct);
    }, 100);

    // Auto-advance timer
    timerRef.current = setTimeout(() => {
      goToStep(index + 1);
    }, step.durationMs);
  }, [clearTimers, openOverlay, closeOverlay]);

  // Start demo from beginning
  const start = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    goToStep(0);
  }, [goToStep]);

  // Stop demo entirely
  const stop = useCallback(() => {
    clearTimers();
    setIsRunning(false);
    setIsPaused(false);
    setCurrentStepIndex(-1);
    setProgress(0);
    closeOverlay();
  }, [clearTimers, closeOverlay]);

  // Pause (keep current overlay open but stop timer)
  const pause = useCallback(() => {
    if (!isRunning || isPaused || currentStepIndex < 0) return;
    clearTimers();
    setIsPaused(true);
    const step = DEMO_STEPS[currentStepIndex];
    const elapsed = Date.now() - stepStartRef.current;
    remainingRef.current = Math.max(0, step.durationMs - elapsed);
    pausedAtRef.current = Date.now();
  }, [isRunning, isPaused, currentStepIndex, clearTimers]);

  // Resume from pause
  const resume = useCallback(() => {
    if (!isRunning || !isPaused || currentStepIndex < 0) return;
    setIsPaused(false);
    const step = DEMO_STEPS[currentStepIndex];
    const remaining = remainingRef.current;

    // Adjust start time so progress calc works
    stepStartRef.current = Date.now() - (step.durationMs - remaining);

    // Restart progress updater
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - stepStartRef.current;
      const pct = Math.min(100, (elapsed / step.durationMs) * 100);
      setProgress(pct);
    }, 100);

    // Resume auto-advance
    timerRef.current = setTimeout(() => {
      goToStep(currentStepIndex + 1);
    }, remaining);
  }, [isRunning, isPaused, currentStepIndex, goToStep]);

  const next = useCallback(() => {
    if (!isRunning || currentStepIndex < 0) return;
    goToStep(currentStepIndex + 1);
  }, [isRunning, currentStepIndex, goToStep]);

  const prev = useCallback(() => {
    if (!isRunning || currentStepIndex < 0) return;
    goToStep(Math.max(0, currentStepIndex - 1));
  }, [isRunning, currentStepIndex, goToStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const state: DemoModeState = {
    isRunning,
    isPaused,
    currentStepIndex,
    currentStep: currentStepIndex >= 0 ? DEMO_STEPS[currentStepIndex] : null,
    steps: DEMO_STEPS,
    progress,
    totalSteps: DEMO_STEPS.length,
  };

  return [state, { start, stop, pause, resume, next, prev, goToStep }];
}
