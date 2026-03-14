/**
 * DemoOverlay — Floating indicator shown while Demo Mode is running.
 *
 * Shows the current step label, narration text, progress bar, and
 * prev/pause/next/stop controls. Positioned at the bottom-center of
 * the viewport so it doesn't block overlays.
 *
 * Added narration line to guide judges through what they're seeing.
 */

import React from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import {
  Play16Filled,
  Pause16Filled,
  Next16Filled,
  Previous16Filled,
  Dismiss16Filled,
} from '@fluentui/react-icons';
import type { DemoModeState, DemoModeActions } from '../hooks/useDemoMode';

interface DemoOverlayProps {
  state: DemoModeState;
  actions: DemoModeActions;
}

export const DemoOverlay: React.FC<DemoOverlayProps> = ({ state, actions }) => {
  if (!state.isRunning || !state.currentStep) return null;

  const { currentStep, currentStepIndex, totalSteps, progress, isPaused } = state;
  const stepNumber = currentStepIndex + 1;

  return (
    <div className="demo-overlay-bar" style={{ zIndex: 10001 }}>
      {/* Step indicator */}
      <div className="demo-overlay-step">
        <span className="demo-overlay-icon">{currentStep.icon}</span>
        <div className="demo-overlay-text">
          <span className="demo-overlay-label">
            {stepNumber}/{totalSteps} — {currentStep.label}
          </span>
          <span className="demo-overlay-desc">{currentStep.description}</span>
        </div>
      </div>

      {/* Narration line — judge-friendly explanation */}
      {currentStep.narration && (
        <div className="demo-overlay-narration">
          <span className="demo-narration-quote">"</span>
          {currentStep.narration}
        </div>
      )}
      <div className="demo-overlay-progress">
        <div
          className="demo-overlay-progress-fill"
          style={{ width: `${progress}%` }}
        />
        {/* Step dots */}
        <div className="demo-overlay-dots">
          {state.steps.map((_, i) => (
            <button
              key={i}
              className={`demo-dot ${
                i < currentStepIndex ? 'done' : i === currentStepIndex ? 'active' : ''
              }`}
              onClick={() => actions.goToStep(i)}
              title={state.steps[i].label}
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="demo-overlay-controls">
        <Tooltip content="Previous" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Previous16Filled />}
            onClick={actions.prev}
            disabled={currentStepIndex === 0}
          />
        </Tooltip>
        <Tooltip content={isPaused ? 'Resume' : 'Pause'} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={isPaused ? <Play16Filled /> : <Pause16Filled />}
            onClick={isPaused ? actions.resume : actions.pause}
          />
        </Tooltip>
        <Tooltip content="Next" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Next16Filled />}
            onClick={actions.next}
          />
        </Tooltip>
        <Tooltip content="Stop Demo" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss16Filled />}
            onClick={actions.stop}
          />
        </Tooltip>
      </div>
    </div>
  );
};
