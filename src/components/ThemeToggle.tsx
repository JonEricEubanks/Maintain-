import React, { useState, useEffect } from 'react';
import {
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  WeatherSunny24Regular,
  WeatherMoon24Regular,
} from '@fluentui/react-icons';

interface ThemeToggleProps {
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

/**
 * ThemeToggle - Switch between light and dark themes
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ onThemeChange }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('infrawatch-theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('infrawatch-theme', theme);
    onThemeChange?.(theme);
  }, [theme, onThemeChange]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <Tooltip 
      content={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'} 
      relationship="label"
    >
      <Button
        appearance="subtle"
        icon={theme === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
        onClick={toggleTheme}
        style={{
          color: theme === 'dark' ? '#FCD34D' : '#0a4264',
        }}
      />
    </Tooltip>
  );
};

export default ThemeToggle;
