import React, { useState } from 'react';
import {
  Text,
  Title1,
  Spinner,
  FluentProvider,
  webDarkTheme,
} from '@fluentui/react-components';
import { motion, AnimatePresence } from 'motion/react';

// motion/react types can lag behind React 18 — cast to silence the mismatch
const SafeAnimatePresence = AnimatePresence as unknown as React.FC<React.PropsWithChildren<{ mode?: 'wait' | 'sync' | 'popLayout' }>>;
import Dashboard from './pages/Dashboard';
import { MaintainIntro } from './components/MaintainIntro';
import { AppProvider } from './context/AppContext';

/**
 * MAINTAIN - Main Application Component
 * 
 * Predictive Infrastructure Command Center for Lake Forest, IL
 * Built for the Reasoning Agents Hackathon
 */
const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  if (isLoading) {
    return (
      <FluentProvider theme={webDarkTheme}>
      <div className="app-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}>
        <Spinner size="large" />
        <Title1>MAINTAIN</Title1>
        <Text>Loading Predictive Infrastructure Command Center...</Text>
      </div>
      </FluentProvider>
    );
  }

  return (
    <AppProvider>
    <SafeAnimatePresence mode="wait">
      {showIntro ? (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: 0, zIndex: 9999 }}
        >
          <MaintainIntro onComplete={() => setShowIntro(false)} />
        </motion.div>
      ) : (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="app-container"
        >
          <Dashboard />
        </motion.div>
      )}
    </SafeAnimatePresence>
    </AppProvider>
  );
};

export default App;
