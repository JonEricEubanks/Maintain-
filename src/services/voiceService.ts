/**
 * MAINTAIN AI - Voice Announcement Service
 * 
 * Uses Web Speech API to announce critical alerts and AI insights.
 * Provides audio feedback for important infrastructure events.
 */

// ============================================
// Types
// ============================================

export type AnnouncementPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Announcement {
  id: string;
  message: string;
  priority: AnnouncementPriority;
  timestamp: Date;
}

// ============================================
// Configuration
// ============================================

const VOICE_SETTINGS = {
  rate: 0.95,      // Slightly slower for clarity
  pitch: 1.0,
  volume: 0.8
};

// Priority-based voice selection
const PRIORITY_VOICES = {
  critical: { pitch: 1.1, rate: 1.0, prefix: 'Critical Alert!' },
  high: { pitch: 1.05, rate: 0.95, prefix: 'Attention:' },
  normal: { pitch: 1.0, rate: 0.9, prefix: '' },
  low: { pitch: 0.95, rate: 0.85, prefix: '' }
};

// ============================================
// State
// ============================================

let isEnabled = true;
let isSpeaking = false;
let announcementQueue: Announcement[] = [];
let preferredVoice: SpeechSynthesisVoice | null = null;

// ============================================
// Voice Selection
// ============================================

function selectVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  
  const voices = window.speechSynthesis.getVoices();
  
  // Prefer US English voices
  const preferred = voices.find(v => 
    v.lang === 'en-US' && (v.name.includes('Natural') || v.name.includes('Neural'))
  );
  
  if (preferred) return preferred;
  
  // Fallback to any English voice
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

// Initialize voice when available
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = selectVoice();
  };
  // Try immediate selection
  preferredVoice = selectVoice();
}

// ============================================
// Core Functions
// ============================================

/**
 * Check if speech synthesis is available
 */
export function isAvailable(): boolean {
  return 'speechSynthesis' in window;
}

/**
 * Enable or disable voice announcements
 */
export function setEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    cancel();
  }
}

/**
 * Check if voice is enabled
 */
export function getEnabled(): boolean {
  return isEnabled;
}

/**
 * Speak a message immediately (with priority handling)
 */
export function speak(message: string, priority: AnnouncementPriority = 'normal'): void {
  if (!isAvailable() || !isEnabled) return;
  
  const settings = PRIORITY_VOICES[priority];
  const fullMessage = settings.prefix ? `${settings.prefix} ${message}` : message;
  
  const utterance = new SpeechSynthesisUtterance(fullMessage);
  
  utterance.rate = VOICE_SETTINGS.rate * settings.rate;
  utterance.pitch = VOICE_SETTINGS.pitch * settings.pitch;
  utterance.volume = VOICE_SETTINGS.volume;
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  
  utterance.onstart = () => {
    isSpeaking = true;
  };
  
  utterance.onend = () => {
    isSpeaking = false;
    processQueue();
  };
  
  utterance.onerror = () => {
    isSpeaking = false;
    processQueue();
  };
  
  // For critical messages, interrupt current speech
  if (priority === 'critical') {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } else if (isSpeaking) {
    // Queue non-critical messages
    announcementQueue.push({
      id: `announce-${Date.now()}`,
      message,
      priority,
      timestamp: new Date()
    });
  } else {
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Process the announcement queue
 */
function processQueue(): void {
  if (announcementQueue.length === 0 || isSpeaking) return;
  
  // Sort by priority (critical first)
  announcementQueue.sort((a, b) => {
    const order = { critical: 0, high: 1, normal: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });
  
  const next = announcementQueue.shift();
  if (next) {
    speak(next.message, next.priority);
  }
}

/**
 * Cancel all speech
 */
export function cancel(): void {
  if (!isAvailable()) return;
  
  window.speechSynthesis.cancel();
  announcementQueue = [];
  isSpeaking = false;
}

// ============================================
// Infrastructure-Specific Announcements
// ============================================

/**
 * Announce a critical infrastructure alert
 */
export function announceCriticalAlert(address: string, issueType: string): void {
  speak(
    `Critical ${issueType} issue reported at ${address}. Immediate attention required.`,
    'critical'
  );
}

/**
 * Announce AI insight
 */
export function announceInsight(title: string, confidence: number): void {
  const priority: AnnouncementPriority = confidence > 0.9 ? 'high' : 'normal';
  speak(
    `AI Insight: ${title}. Confidence level ${Math.round(confidence * 100)} percent.`,
    priority
  );
}

/**
 * Announce crew estimation update
 */
export function announceCrewEstimate(totalCrews: number, reason: string): void {
  speak(
    `Crew recommendation updated. ${totalCrews} crews recommended. ${reason}`,
    'normal'
  );
}

/**
 * Announce weather warning
 */
export function announceWeatherWarning(condition: string, impact: string): void {
  speak(
    `Weather alert: ${condition} conditions expected. ${impact}`,
    'high'
  );
}

/**
 * Announce scenario simulation result
 */
export function announceScenarioResult(crewDelta: number, riskLevel: string): void {
  const message = crewDelta > 0
    ? `Scenario analysis complete. ${crewDelta} additional crews would be needed. Risk level: ${riskLevel}.`
    : `Scenario analysis complete. Crew requirements would decrease by ${Math.abs(crewDelta)}. Risk level: ${riskLevel}.`;
  
  speak(message, riskLevel === 'high' ? 'high' : 'normal');
}

/**
 * Welcome announcement
 */
export function announceWelcome(): void {
  speak(
    'MAINTAIN AI initialized. Monitoring Lake Forest infrastructure.',
    'low'
  );
}

export default {
  isAvailable,
  setEnabled,
  getEnabled,
  speak,
  cancel,
  announceCriticalAlert,
  announceInsight,
  announceCrewEstimate,
  announceWeatherWarning,
  announceScenarioResult,
  announceWelcome
};
