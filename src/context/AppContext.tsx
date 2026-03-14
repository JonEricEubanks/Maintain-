/**
 * MAINTAIN AI — Application Context
 *
 * Centralizes app-wide state that many components need:
 *   • Theme (light/dark) — eliminates prop drilling
 *   • Active overlay — enforces single-overlay-at-a-time pattern
 *   • Connection status
 *
 * Uses useReducer for predictable state transitions.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';

/* ═══════════════════════════════════════
   OVERLAY TYPES
   ═══════════════════════════════════════ */
export type OverlayId =
  | 'briefing'
  | 'report'
  | 'nlpDashboard'
  | 'analysisWizard'
  | 'decayVisualizer'
  | 'dispatch'
  | 'mapModal'
  | 'wizard'
  | 'crewManagement'
  | 'traceViewer'
  | 'responsibleAI'
  | 'skPanel'
  | 'helpPanel'
  | 'welcomeTour'
  | 'modelRouter'
  | 'pipelineStream'
  | null;

export type ConnectionStatus = 'connecting' | 'connected' | 'error';

/* ═══════════════════════════════════════
   STATE + ACTIONS
   ═══════════════════════════════════════ */
interface AppState {
  theme: 'light' | 'dark';
  activeOverlay: OverlayId;
  connectionStatus: ConnectionStatus;
}

type AppAction =
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'OPEN_OVERLAY'; payload: OverlayId }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'CLOSE_OVERLAY_IF'; payload: OverlayId }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };
    case 'OPEN_OVERLAY':
      return { ...state, activeOverlay: action.payload };
    case 'CLOSE_OVERLAY':
      return { ...state, activeOverlay: null };
    case 'CLOSE_OVERLAY_IF':
      return state.activeOverlay === action.payload
        ? { ...state, activeOverlay: null }
        : state;
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    default:
      return state;
  }
}

/* ═══════════════════════════════════════
   CONTEXT SHAPE
   ═══════════════════════════════════════ */
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Convenience helpers
  theme: 'light' | 'dark';
  isDark: boolean;
  toggleTheme: () => void;
  openOverlay: (id: OverlayId) => void;
  closeOverlay: () => void;
  isOverlay: (id: OverlayId) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

/* ═══════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════ */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, {
    theme: (localStorage.getItem('infrawatch-theme') as 'light' | 'dark') || 'light',
    activeOverlay: !localStorage.getItem('infrawatch-tour-completed') ? 'welcomeTour' : null,
    connectionStatus: 'connecting',
  });

  // Sync theme to DOM + localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('infrawatch-theme', state.theme);
  }, [state.theme]);

  const toggleTheme = useCallback(() => dispatch({ type: 'TOGGLE_THEME' }), []);
  const openOverlay = useCallback((id: OverlayId) => dispatch({ type: 'OPEN_OVERLAY', payload: id }), []);
  const closeOverlay = useCallback(() => dispatch({ type: 'CLOSE_OVERLAY' }), []);
  const isOverlay = useCallback((id: OverlayId) => state.activeOverlay === id, [state.activeOverlay]);

  const value = useMemo<AppContextValue>(() => ({
    state,
    dispatch,
    theme: state.theme,
    isDark: state.theme === 'dark',
    toggleTheme,
    openOverlay,
    closeOverlay,
    isOverlay,
  }), [state, toggleTheme, openOverlay, closeOverlay, isOverlay]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

/* ═══════════════════════════════════════
   HOOK
   ═══════════════════════════════════════ */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

export default AppContext;
