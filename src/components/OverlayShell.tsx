/**
 * OverlayShell — Shared wrapper for every overlay/panel in the app.
 *
 * Enforces consistent behaviour:
 *   • Backdrop click → close
 *   • ESC key → close
 *   • Consistent z-index, blur, animation
 *   • Single size prop for width control
 *   • Optional header with title + close button
 *
 * Reads AppContext to auto-close (the parent still controls mounting).
 *
 * Sizes:
 *   sm   → 520 px   (DispatchWizard, WorkOrderWizard)
 *   md   → 660 px   (CrewManagement, HelpPanel)
 *   lg   → 900 px   (AgentTrace, RAI, SK)
 *   xl   → 1060 px  (ReportGenerator)
 *   full → 100 %    (NLPDashboard, MapModal)
 *   split → side-by-side wizard+map (AnalysisWizard)
 */

import React, { useEffect, useCallback } from 'react';
import { Button } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { useApp } from '../context/AppContext';

export type OverlaySize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'split';

interface OverlayShellProps {
  /** Content rendered inside the panel */
  children: React.ReactNode;
  /** Panel width preset */
  size?: OverlaySize;
  /** Optional title shown in a built-in header row */
  title?: string;
  /** Extra className on the panel div (for component-specific tweaks) */
  className?: string;
  /** Override close handler (defaults to AppContext closeOverlay) */
  onClose?: () => void;
  /** Disable backdrop click-to-close (e.g. WelcomeTour) */
  disableBackdropClose?: boolean;
  /** Disable ESC key close */
  disableEscClose?: boolean;
  /** Header-right slot for extra buttons / badges */
  headerExtra?: React.ReactNode;
}

const OverlayShell: React.FC<OverlayShellProps> = ({
  children,
  size = 'md',
  title,
  className,
  onClose: onCloseProp,
  disableBackdropClose = false,
  disableEscClose = false,
  headerExtra,
}) => {
  const { closeOverlay } = useApp();
  const handleClose = onCloseProp ?? closeOverlay;

  // ESC key handler
  useEffect(() => {
    if (disableEscClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disableEscClose, handleClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (!disableBackdropClose && e.target === e.currentTarget) {
        handleClose();
      }
    },
    [disableBackdropClose, handleClose],
  );

  // ── Split layout ──
  // Unique id for aria-labelledby
  const titleId = title ? `overlay-title-${title.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  if (size === 'split') {
    return (
      <div className="overlay-split" role="dialog" aria-modal="true" aria-label={title || 'Dialog'} onClick={handleBackdropClick}>
        {children}
      </div>
    );
  }

  // ── Full-screen layout ──
  if (size === 'full') {
    return (
      <div className="overlay-backdrop" onClick={handleBackdropClick}>
        <div
          className={`overlay-panel size-full ${className ?? ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-label={!title ? 'Dialog' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="overlay-panel-header">
              <h2 id={titleId}>{title}</h2>
              {headerExtra}
              <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={handleClose} size="small" aria-label="Close" />
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }

  // ── Standard centered modal ──
  const sizeClass = `size-${size}`;

  return (
    <div className="overlay-backdrop" onClick={handleBackdropClick}>
      <div
        className={`overlay-panel ${sizeClass} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={!title ? 'Dialog' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="overlay-panel-header">
            <h2 id={titleId}>{title}</h2>
            {headerExtra}
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={handleClose} size="small" aria-label="Close" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default OverlayShell;
