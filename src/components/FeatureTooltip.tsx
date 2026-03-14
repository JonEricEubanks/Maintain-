import React, { useState, useEffect } from 'react';
import {
  Text,
  Button,
} from '@fluentui/react-components';
import {
  Dismiss12Regular,
  Lightbulb24Regular,
} from '@fluentui/react-icons';

interface FeatureTooltipProps {
  id: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  targetRef: React.RefObject<HTMLElement>;
  showOnce?: boolean;
  delay?: number;
  onDismiss?: () => void;
}

/**
 * FeatureTooltip - Contextual feature discovery tooltip
 * Shows helpful hints for features the user hasn't discovered yet
 */
const FeatureTooltip: React.FC<FeatureTooltipProps> = ({
  id,
  title,
  description,
  position,
  targetRef,
  showOnce = true,
  delay = 2000,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    // Check if already dismissed
    if (showOnce) {
      const dismissed = localStorage.getItem(`tooltip-dismissed-${id}`);
      if (dismissed) return;
    }

    // Show after delay
    const timer = setTimeout(() => {
      if (targetRef.current) {
        const rect = targetRef.current.getBoundingClientRect();
        let top = 0;
        let left = 0;

        switch (position) {
          case 'top':
            top = rect.top - 10;
            left = rect.left + rect.width / 2;
            break;
          case 'bottom':
            top = rect.bottom + 10;
            left = rect.left + rect.width / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2;
            left = rect.left - 10;
            break;
          case 'right':
            top = rect.top + rect.height / 2;
            left = rect.right + 10;
            break;
        }

        setCoords({ top, left });
        setIsVisible(true);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [id, position, targetRef, showOnce, delay]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (showOnce) {
      localStorage.setItem(`tooltip-dismissed-${id}`, 'true');
    }
    onDismiss?.();
  };

  if (!isVisible) return null;

  const getTransform = () => {
    switch (position) {
      case 'top': return 'translate(-50%, -100%)';
      case 'bottom': return 'translate(-50%, 0)';
      case 'left': return 'translate(-100%, -50%)';
      case 'right': return 'translate(0, -50%)';
    }
  };

  const getArrowStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    };

    switch (position) {
      case 'top':
        return {
          ...baseStyle,
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: '8px 8px 0 8px',
          borderColor: 'rgba(99, 102, 241, 0.9) transparent transparent transparent',
        };
      case 'bottom':
        return {
          ...baseStyle,
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          borderWidth: '0 8px 8px 8px',
          borderColor: 'transparent transparent rgba(99, 102, 241, 0.9) transparent',
        };
      case 'left':
        return {
          ...baseStyle,
          right: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: '8px 0 8px 8px',
          borderColor: 'transparent transparent transparent rgba(99, 102, 241, 0.9)',
        };
      case 'right':
        return {
          ...baseStyle,
          left: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          borderWidth: '8px 8px 8px 0',
          borderColor: 'transparent rgba(99, 102, 241, 0.9) transparent transparent',
        };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        transform: getTransform(),
        zIndex: 2000,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(79, 70, 229, 0.9) 100%)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: 16,
          maxWidth: 280,
          boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
          position: 'relative',
        }}
      >
        {/* Arrow */}
        <div style={getArrowStyle()} />

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255, 255, 255, 0.7)',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Dismiss"
        >
          <Dismiss12Regular />
        </button>

        {/* Content */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Lightbulb24Regular style={{ color: '#FCD34D', flexShrink: 0 }} />
          <div>
            <Text weight="semibold" style={{ display: 'block', marginBottom: 4, color: 'white' }}>
              {title}
            </Text>
            <Text size={200} style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              {description}
            </Text>
          </div>
        </div>

        {/* Got it button */}
        <Button
          appearance="secondary"
          size="small"
          onClick={handleDismiss}
          style={{ marginTop: 12, width: '100%' }}
        >
          Got it!
        </Button>
      </div>
    </div>
  );
};

export default FeatureTooltip;
