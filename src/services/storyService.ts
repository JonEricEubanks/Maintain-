/**
 * MAINTAIN AI — Story Narrator Service
 *
 * Transforms dry infrastructure data into dramatic, engaging narratives
 * with an AI character personality ("Inspector Mo").
 *
 * This is the core CREATIVE differentiator — turning a utility dashboard
 * into an interactive storytelling experience.
 */

import type { WorkOrder, Crew, AIInsight, WeatherForecast, CrewEstimation } from '../types/infrastructure';

// ============================================
// Inspector Mo — AI Character Personality
// ============================================

export interface InspectorMoMood {
  /** Descriptive key — map to an icon component in the consuming UI */
  icon: string;
  mood: string;
  color: string;
}

const MO_MOODS: Record<string, InspectorMoMood> = {
  alarmed:   { icon: 'alert',      mood: 'alarmed',   color: '#ef4444' },
  concerned: { icon: 'concerned',  mood: 'concerned', color: '#f59e0b' },
  focused:   { icon: 'focused',    mood: 'focused',   color: '#6366f1' },
  satisfied: { icon: 'satisfied',  mood: 'satisfied', color: '#22c55e' },
  proud:     { icon: 'proud',      mood: 'proud',     color: '#3b82f6' },
  excited:   { icon: 'flash',      mood: 'excited',   color: '#a855f7' },
  grumpy:    { icon: 'grumpy',     mood: 'grumpy',    color: '#f97316' },
  amused:    { icon: 'amused',     mood: 'amused',    color: '#ec4899' },
};

function getMoMood(criticalCount: number, highCount: number, totalCount: number): InspectorMoMood {
  if (criticalCount > 5) return MO_MOODS.alarmed;
  if (criticalCount > 2) return MO_MOODS.concerned;
  if (highCount > totalCount * 0.4) return MO_MOODS.grumpy;
  if (totalCount < 10) return MO_MOODS.proud;
  if (criticalCount === 0) return MO_MOODS.satisfied;
  return MO_MOODS.focused;
}

// ============================================
// Narrative Templates
// ============================================

const OPENING_HOOKS = [
  (time: string) => `It's ${time} in Lake Forest. The city sleeps, but the infrastructure doesn't.`,
  (time: string) => `Another ${time} morning — and Inspector Mo has already finished his second coffee, scanning the city like a hawk.`,
  (time: string) => `At exactly ${time}, the MAINTAIN AI woke up. Not that it ever truly sleeps. It just... waits. Watching. Calculating.`,
  (time: string) => `${time}. Most people haven't even hit their alarm clocks yet, but beneath the quiet streets of Lake Forest, a slow-motion crisis unfolds.`,
  (time: string) => `Dawn breaks at ${time}. Inspector Mo squints at the map like a general surveying a battlefield. "Let's see what overnight did to my city," he mutters.`,
];

const CRITICAL_DRAMA = [
  (addr: string, days: number) => `The situation at **${addr}** has turned critical. ${days} days of neglect — and the damage is now accelerating exponentially.`,
  (addr: string, days: number) => `"This one keeps me up at night," Mo admits, pointing at **${addr}**. It's been ${days} days. Every passing car makes it worse.`,
  (addr: string, days: number) => `**${addr}** — ${days} days and counting. Inspector Mo shakes his head. "This isn't a pothole anymore. It's a statement about what happens when we wait too long."`,
  (addr: string, days: number) => `Red alert at **${addr}**. ${days} days. The kind of issue that ends up on the evening news if we don't move fast.`,
];

const SCHOOL_PROXIMITY = [
  (addr: string, school: string) => `What makes **${addr}** especially urgent? Children. It's within walking distance of ${school}. "Kids walking over this every morning," Mo says tightly. "That's my top priority."`,
  (addr: string, school: string) => `Inspector Mo flags **${addr}** with a star — it's near ${school}. "Safety isn't negotiable," he states flatly. "Children's routes come first."`,
  (addr: string, school: string) => `Near ${school}, the damage at **${addr}** takes on a different weight. "This isn't just infrastructure," Mo reminds his team. "It's a school zone."`,
];

const WEATHER_COMMENTARY = [
  (temp: number, condition: string) => `The weather isn't helping — ${temp}°F and ${condition}. ${temp < 32 ? 'Freeze-thaw cycles are literally tearing the roads apart from the inside.' : temp > 85 ? 'The heat is softening asphalt, making every crack an invitation for disaster.' : 'At least the conditions are workable.'}`,
  (temp: number, condition: string) => `Mo checks his weather widget: ${temp}°F, ${condition}. ${temp < 32 ? '"Great. Mother Nature is on the enemy\'s side today."' : '"Good enough to get crews out there."'}`,
];

const CREW_COMMENTARY = [
  (total: number, conf: number) => `Inspector Mo's recommendation: deploy **${total} crews** today. "I'm ${Math.round(conf * 100)}% confident in this allocation," he says, tapping the optimization model on his screen.`,
  (total: number, conf: number) => `The AI calculates: **${total} crews** needed. Mo nods — that matches his gut. "${Math.round(conf * 100)}% confidence. Let's roll."`,
  (total: number, conf: number) => `"${total} crews, optimally positioned." Mo reviews the spatial clustering. "${Math.round(conf * 100)}% confidence — and every crew placed where the math says they'll do the most good."`,
];

const CLOSING_LINES = [
  "Inspector Mo takes one last look at the map, then grabs his hard hat. \"Infrastructure doesn't wait for meetings. Neither do I.\"",
  "The story of Lake Forest's infrastructure is written in asphalt and concrete — and today, Inspector Mo is editing the next chapter.",
  "\"Every pothole we fix today,\" Mo says, heading for the door, \"is a lawsuit we prevent tomorrow, a kid who doesn't trip, a car that doesn't swerve. That's not data. That's people.\"",
  "End of briefing. But the city's story continues — crack by crack, repair by repair, decision by decision. MAINTAIN AI never stops watching.",
  "Mo pins the top three priorities to the board. \"This is our story for today. Let's make it a good one.\"",
];

const POTHOLE_FLAVOR: Record<string, string[]> = {
  critical: [
    'a yawning crater that swallows tires whole',
    'the kind of pothole that earns its own zip code',
    'a road wound that screams for immediate attention',
  ],
  high: [
    'a growing menace that won\'t fix itself',
    'the sort of damage that doubles every freeze-thaw cycle',
    'a hazard waiting for the wrong moment',
  ],
  medium: [
    'not yet an emergency — but give it two weeks',
    'the quiet kind of damage that surprises people',
    'a steady deterioration that rewards early action',
  ],
  low: [
    'a hairline crack — today\'s minor annoyance, tomorrow\'s repair bill',
    'cosmetic for now, structural eventually',
    'the kind of thing a good crew fixes in twenty minutes',
  ],
};

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

// ============================================
// Story Generator
// ============================================

export interface StoryChapter {
  id: string;
  title: string;
  icon: string;
  mood: InspectorMoMood;
  paragraphs: string[];
  highlight?: { lat: number; lng: number; label: string };
}

export interface CityStory {
  headline: string;
  subheadline: string;
  mood: InspectorMoMood;
  chapters: StoryChapter[];
  generatedAt: string;
  wordCount: number;
}

export function generateCityStory(
  workOrders: WorkOrder[],
  crews: Crew[],
  insights: AIInsight[],
  estimation: CrewEstimation | null,
  weather: WeatherForecast[],
): CityStory {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const criticals = workOrders.filter(w => w.severity === 'critical');
  const highs = workOrders.filter(w => w.severity === 'high');
  const nearSchools = workOrders.filter(w => w.nearSchool);
  const mood = getMoMood(criticals.length, highs.length, workOrders.length);
  const totalCost = workOrders.reduce((s, w) => s + w.estimatedCost, 0);

  const chapters: StoryChapter[] = [];
  let chapterIdx = 0;

  // ── Chapter 1: Opening ──
  const opening: string[] = [];
  opening.push(pickRandom(OPENING_HOOKS, hashStr(dateStr))(timeStr));
  opening.push(`Today's situation in Lake Forest: **${workOrders.length} active work orders**, of which **${criticals.length} are critical** and **${highs.length} demand high priority**. The total repair backlog stands at **$${(totalCost / 1000).toFixed(0)}K** — and climbing by the hour.`);
  if (weather.length > 0) {
    opening.push(pickRandom(WEATHER_COMMENTARY, hashStr(weather[0].condition))(weather[0].temperature, weather[0].condition));
  }
  chapters.push({
    id: `ch-${chapterIdx++}`,
    title: 'Morning Brief',
    icon: 'sunrise',
    mood,
    paragraphs: opening,
  });

  // ── Chapter 2: Critical Issues (dramatic storytelling) ──
  if (criticals.length > 0) {
    const critParagraphs: string[] = [];
    critParagraphs.push(`Inspector Mo's eyes are drawn to the red markers — ${criticals.length} critical issue${criticals.length > 1 ? 's' : ''} demanding immediate action.`);
    const featured = criticals.slice(0, 3);
    for (const wo of featured) {
      const days = daysSince(wo.createdAt);
      const h = hashStr(wo.id);
      critParagraphs.push(pickRandom(CRITICAL_DRAMA, h)(wo.address, days));
      const flavor = pickRandom(POTHOLE_FLAVOR[wo.severity] || POTHOLE_FLAVOR.critical, h + 1);
      critParagraphs.push(`The ${wo.issueType} at this location is ${flavor}. Estimated repair cost: **$${wo.estimatedCost.toLocaleString()}**.`);
    }
    chapters.push({
      id: `ch-${chapterIdx++}`,
      title: 'Critical Situations',
      icon: 'alert',
      mood: MO_MOODS.alarmed,
      paragraphs: critParagraphs,
      highlight: featured[0] ? { lat: featured[0].latitude, lng: featured[0].longitude, label: featured[0].address } : undefined,
    });
  }

  // ── Chapter 3: School Zone Alert ──
  if (nearSchools.length > 0) {
    const schoolParagraphs: string[] = [];
    schoolParagraphs.push(`**${nearSchools.length} issue${nearSchools.length > 1 ? 's' : ''}** near school zones — Inspector Mo treats these with extra urgency.`);
    const featuredSchool = nearSchools[0];
    schoolParagraphs.push(pickRandom(SCHOOL_PROXIMITY, hashStr(featuredSchool.id))(featuredSchool.address, 'a nearby school'));
    chapters.push({
      id: `ch-${chapterIdx++}`,
      title: 'School Zone Report',
      icon: 'school',
      mood: MO_MOODS.concerned,
      paragraphs: schoolParagraphs,
      highlight: { lat: featuredSchool.latitude, lng: featuredSchool.longitude, label: featuredSchool.address },
    });
  }

  // ── Chapter 4: Crew Deployment Story ──
  if (estimation) {
    const crewParagraphs: string[] = [];
    crewParagraphs.push(pickRandom(CREW_COMMENTARY, hashStr('crew'))(estimation.totalCrews, estimation.confidence));
    if (estimation.reasoning.length > 0) {
      crewParagraphs.push(`The reasoning chain: ${estimation.reasoning.slice(0, 3).join(' → ')}`);
    }
    if (crews.length > 0) {
      const assignedCrews = crews.filter(c => c.status === 'assigned');
      crewParagraphs.push(`Right now, **${assignedCrews.length} of ${crews.length} crews** are already deployed across the city — positioned by AI spatial optimization to minimize response times.`);
    }
    chapters.push({
      id: `ch-${chapterIdx++}`,
      title: 'Crew Operations',
      icon: 'worker',
      mood: MO_MOODS.focused,
      paragraphs: crewParagraphs,
    });
  }

  // ── Chapter 5: AI Insights (as Mo's recommendations) ──
  if (insights.length > 0) {
    const insightParagraphs: string[] = [];
    insightParagraphs.push(`Inspector Mo reviews the AI's ${insights.length} recommendation${insights.length > 1 ? 's' : ''} — each one backed by data, not guesswork.`);
    for (const ins of insights.slice(0, 3)) {
      insightParagraphs.push(`**${ins.title}** (${Math.round(ins.confidence * 100)}% confidence): "${ins.recommendation}"`);
    }
    chapters.push({
      id: `ch-${chapterIdx++}`,
      title: "Mo's Recommendations",
      icon: 'lightbulb',
      mood: MO_MOODS.excited,
      paragraphs: insightParagraphs,
    });
  }

  // ── Chapter 6: The Closing ──
  const closing: string[] = [];
  closing.push(pickRandom(CLOSING_LINES, hashStr(dateStr + 'close')));
  chapters.push({
    id: `ch-${chapterIdx++}`,
    title: 'End of Report',
    icon: 'film',
    mood: criticals.length > 3 ? MO_MOODS.concerned : MO_MOODS.proud,
    paragraphs: closing,
  });

  // Calculate word count
  const allText = chapters.flatMap(c => c.paragraphs).join(' ');
  const wordCount = allText.split(/\s+/).length;

  // Headline
  const headline = criticals.length > 3
    ? `[!] RED ALERT: ${criticals.length} Critical Issues Demand Immediate Action`
    : criticals.length > 0
    ? `[!] ${criticals.length} Critical, ${highs.length} High Priority — Inspector Mo's Battle Plan`
    : `[OK] Lake Forest Infrastructure: Stable — But Mo's Not Relaxing`;

  return {
    headline,
    subheadline: `Lake Forest Infrastructure Report — ${dateStr}`,
    mood,
    chapters,
    generatedAt: now.toISOString(),
    wordCount,
  };
}

// ============================================
// Inspector Mo Quote Generator
// ============================================

const MO_IDLE_QUOTES = [
  "\"You know what keeps a city running? Not politicians. Not budgets. It's the crew at 5 AM fixing what nobody notices until it breaks.\"",
  "\"I've been doing this 30 years. The AI doesn't replace my gut — it confirms it. And that's powerful.\"",
  "\"Every pothole has a story. A freeze-thaw cycle here, a water main leak there. Read the road like a book.\"",
  "\"The best infrastructure repair is the one nobody notices. That means we got there before it was a problem.\"",
  "\"People ask me why I care about sidewalk cracks. I tell them: ask the grandmother with a walker.\"",
  "\"Data doesn't lie. But it doesn't care, either. That's why you need someone like me reading it.\"",
  "\"The freeze-thaw cycle is the enemy. Every winter, it fights us. Every spring, we fight back.\"",
  "\"A $200 patch today saves a $20,000 reconstruction next year. That's not math. That's common sense.\"",
];

export function getMoQuote(seed?: number): string {
  const s = seed ?? Math.floor(Date.now() / 60000); // changes every minute
  return pickRandom(MO_IDLE_QUOTES, s);
}

// ============================================
// Report Style Variants
// ============================================

export type ReportStyle = 'newspaper' | 'storybook' | 'executive' | 'infographic';

export interface ReportConfig {
  style: ReportStyle;
  label: string;
  description: string;
  icon: string;
}

export const REPORT_STYLES: ReportConfig[] = [
  { style: 'newspaper',   label: 'City Chronicle',      description: 'Breaking-news style infrastructure report',          icon: 'newspaper' },
  { style: 'storybook',   label: "Inspector Mo's Diary", description: 'First-person narrative from our AI inspector',       icon: 'book' },
  { style: 'executive',   label: 'Executive Brief',      description: 'Data-forward summary for city leadership',           icon: 'chart' },
  { style: 'infographic', label: 'Visual Report',        description: 'Generative data art with infrastructure visualization', icon: 'palette' },
];
