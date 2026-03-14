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

import React, { useEffect, useCallback, useRef } from 'react';
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

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Focus trap — keep Tab/Shift+Tab cycling within the overlay
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Auto-focus the panel (or its first focusable child) on mount
    const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (firstFocusable) firstFocusable.focus();
    else panel.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onTab);
    return () => panel.removeEventListener('keydown', onTab);
  }, []);

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
      <div className="overlay-split" role="dialog" aria-modal="true" aria-label={title || 'Dialog'} onClick={handleBackdropClick} ref={panelRef} tabIndex={-1}>
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
          ref={panelRef}
          tabIndex={-1}
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
        ref={panelRef}
        tabIndex={-1}
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
