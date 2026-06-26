import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home as HomeIcon,
  Pencil,
  BarChart3,
  HeartHandshake,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Cloud,
  CloudSun,
  Wind,
  Plus,
  Clock,
  ChevronRight,
  Trash2,
  AlertCircle,
  Anchor,
  Waves,
  CircleDot,
  Quote,
  BookOpen,
  Phone,
  Settings as SettingsIcon,
  ChevronDown,
  Info,
  Shield,
  Zap,
  Send,
  Sparkles,
} from "lucide-react";

/* ───────────────────────────────────────────────────────────────────────────
   narc-assYst — interactive prototype
   Design spec is grounded in the trauma-informed research dossier.
   - Non-diagnostic. Never labels people.
   - Recognition-over-recall UI. "Unclear" is always a first-class option.
   - Quick exit always visible. Honest about its limits.
   - Calm palette, no alarmist colors, no fear-based design.
   ─────────────────────────────────────────────────────────────────────────── */

// ── Design tokens (kept inline because Tailwind config isn't available) ──
const C = {
  bg: "#EFE7D8",        // warm linen
  bgDeep: "#E5DBC8",
  card: "#F8F3E7",      // cream paper
  cardWarm: "#F2EBDA",
  ink: "#1F2530",       // deep slate ink
  inkSoft: "#5C6470",
  inkMuted: "#8A8F99",
  sage: "#7E8E80",      // muted sage
  sageDeep: "#4F5F52",
  sageSoft: "#C7CFC4",
  clay: "#B0846B",      // warm clay (never red)
  clayDeep: "#8C6A52",  // deeper clay for accents
  claySoft: "#E5C8B5",
  amber: "#B8975C",
  line: "#D7CCB6",
  lineSoft: "#E2D7C2",
};

const fontStack = {
  display: `'Fraunces', 'Cormorant Garamond', Georgia, serif`,
  body: `'Geist', 'DM Sans', system-ui, sans-serif`,
};

// ── Taxonomy from the research (non-diagnostic labels) ──
const PATTERN_TAGS = [
  { id: "reality-undermining", label: "Reality-undermining", hint: "Denial, rewriting, 'that never happened'" },
  { id: "emotion-dismissal", label: "Emotion-dismissal", hint: "'Too sensitive', 'overreacting', 'just a joke'" },
  { id: "credibility-erosion", label: "Credibility erosion", hint: "'No one will believe you'" },
  { id: "blame-flip", label: "Responsibility flipping", hint: "'You made me do it'" },
  { id: "role-reversal", label: "Role reversal", hint: "Becomes the victim when challenged" },
  { id: "rule-shifting", label: "Rule shifting", hint: "Goalposts move; you're always wrong" },
  { id: "no-win", label: "No-win setup", hint: "Any choice is punished" },
  { id: "threat", label: "Threat / intimidation", hint: "Threats, ultimatums, fear" },
  { id: "monitoring", label: "Monitoring / tracking", hint: "Phone checks, location, accounts" },
  { id: "isolation", label: "Connection restriction", hint: "Pulled away from support" },
  { id: "withdrawal", label: "Strategic withdrawal", hint: "Silent treatment, freezing out" },
  { id: "hot-cold", label: "Hot-cold cycle", hint: "Warmth then harm, repeating" },
  { id: "triangulation", label: "Third-party leverage", hint: "'Even X agrees', proxy pressure" },
  { id: "two-faces", label: "Two-faces dynamic", hint: "Charming externally, harsh privately" },
  { id: "digital", label: "Digital harassment", hint: "Messages, accounts, devices" },
  { id: "economic", label: "Economic constraint", hint: "Money, work, dependence" },
  { id: "post-sep", label: "Post-separation control", hint: "Continued after the relationship" },
];

const STATE_CHIPS = [
  { id: "confused", label: "Confused", hint: "I'm not sure what just happened" },
  { id: "off", label: "Something feels off", hint: "I can't name it yet" },
  { id: "doubting", label: "Doubting my memory", hint: "Did that really happen?" },
  { id: "activated", label: "Activated", hint: "My body is on alert" },
  { id: "shutdown", label: "Shut down", hint: "Numb, frozen, far away" },
  { id: "replaying", label: "Replaying it", hint: "Stuck on a loop" },
  { id: "unclear", label: "Unclear", hint: "Just here." },
];

const IMPACT_BODY = [
  "Tight chest", "Nausea", "Jaw clenched", "Frozen", "Shaky", "Racing heart",
  "Exhausted", "Foggy head", "Cold extremities", "Shallow breath",
];
const IMPACT_EMOTION = [
  "Shame", "Fear", "Confusion", "Numb", "Panic", "Guilt",
  "Smallness", "Grief", "Anger", "Relief",
];
const IMPACT_MIND = [
  "Rehearsing what to say", "Second-guessing myself", "Can't articulate it", "Replaying",
  "Walking on eggshells", "Lost track of what I wanted", "Hyper-alert",
];

const CONTEXT_CHANNEL = ["In person", "Message", "Call", "Video", "Other"];
const CONTEXT_SETTING = ["Alone", "Public", "With others", "Around children"];

const CLARITY_OPTIONS = [
  { id: "clear", label: "Clear", hint: "I remember it well" },
  { id: "mixed", label: "Mixed", hint: "Some parts sharp, some hazy" },
  { id: "fragment", label: "Fragment", hint: "Just pieces" },
  { id: "unsure", label: "Unsure", hint: "I don't want to commit yet" },
];

const FUZZY_TIME = [
  "Just now", "Earlier today", "Yesterday", "This week", "Recently", "I don't know when",
];

// ── Grounding scripts ──
const GROUNDING_54321 = [
  { count: 5, sense: "things you can see", verb: "Look around" },
  { count: 4, sense: "things you can touch", verb: "Reach out" },
  { count: 3, sense: "things you can hear", verb: "Listen" },
  { count: 2, sense: "things you can smell", verb: "Notice" },
  { count: 1, sense: "thing you can taste", verb: "Notice" },
];

const VALIDATION_PHRASES = [
  "My feelings are information.",
  "I'm allowed to feel confused.",
  "I don't have to figure this out right now.",
  "Noticing is enough.",
  "I am here, now. I am not back then.",
  "Uncertainty is a valid place to stand.",
  "My body is telling me something real.",
];

// ── De-escalation phrases (research-aligned, optional) ──
const PHRASES = {
  "Buying time": [
    "I need a moment to think about that.",
    "I want to respond properly — can we come back to this?",
    "Let me sit with this before I respond.",
    "I'll think about it.",
  ],
  "Lowering intensity": [
    "I can see this matters to you.",
    "I'm not dismissing what you're saying.",
    "I think we're both feeling a lot.",
    "I don't think we're going to resolve this right now.",
  ],
  "Boundary without escalating": [
    "I'm not comfortable continuing this conversation right now.",
    "I'm going to step away for a bit. We can talk later.",
    "I've said what I need to say on this.",
    "I care about this, and I also need space.",
  ],
  "Grey-rock / minimal": [
    "Okay.",
    "I hear you.",
    "Noted.",
    "I'll need to get back to you on that.",
  ],
};

// ╔═══════════════════════════════════════════════════════════════════════╗
//   ACTIVE DEFENSE — translation engine for in-the-moment deflection
// ╚═══════════════════════════════════════════════════════════════════════╝

// The four stances. Each shapes the tone of generated responses.
const DEFENSE_STANCES = [
  {
    id: "grey",
    label: "Grey rock",
    sub: "Flat, boring, give nothing.",
    when: "When you can disengage. Private contexts. Not court.",
    tone: "minimal",
    color: "sage",
  },
  {
    id: "yellow",
    label: "Yellow rock",
    sub: "Polite, professional, no opening.",
    when: "Co-parenting, court-visible, work, family — anywhere being seen as 'reasonable' matters.",
    tone: "courteous",
    color: "blue",
  },
  {
    id: "biff",
    label: "BIFF",
    sub: "Brief. Informative. Friendly. Firm.",
    when: "Written messages. Logistics. When a record matters.",
    tone: "factual",
    color: "blue",
  },
  {
    id: "buy-time",
    label: "Buy time",
    sub: "Don't respond now. Don't promise either.",
    when: "When you're activated. When you don't have an answer yet. When you're being pressured.",
    tone: "delay",
    color: "clay",
  },
];

// Patterns the user might be hearing. Matched against their input, lightly.
// Each has tactical responses per stance.
const ATTACK_PATTERNS = [
  {
    id: "denial",
    label: "Reality denial",
    cues: ["never happened", "didn't say", "you're imagining", "making it up", "that's not what", "you're remembering wrong"],
    note: "They're trying to overwrite your memory. The goal is not to win this. It's to not engage the bait.",
    responses: {
      grey: ["Okay.", "Hmm.", "I hear you.", "I'll think about it."],
      yellow: ["I understand you see it differently. Let's leave it there for now.", "We may remember it differently. I'd rather move on.", "Noted. I'll come back to you if needed."],
      biff: ["I have a different recollection. I'd prefer to put anything important in writing going forward."],
      "buy-time": ["I need to think before I respond to that.", "Let me sit with this. I'll come back to it."],
    },
  },
  {
    id: "minimization",
    label: "Minimization / dismissal",
    cues: ["too sensitive", "overreacting", "just a joke", "can't take a joke", "making a big deal", "dramatic", "always do this"],
    note: "They're framing your reaction as the problem. JADE-trap warning: don't justify, argue, defend, or explain. That's the supply they want.",
    responses: {
      grey: ["Okay.", "Mm.", "Alright."],
      yellow: ["I hear you. I'll leave it there.", "Thanks for letting me know how you see it.", "Understood."],
      biff: ["Noted. I won't be discussing this further today."],
      "buy-time": ["I'll think about that.", "I need a moment."],
    },
  },
  {
    id: "blame-flip",
    label: "Blame reversal / DARVO",
    cues: ["look what you made", "your fault", "if you hadn't", "you started", "i'm the victim", "you always", "you're the abusive"],
    note: "They've flipped roles. Your instinct will be to defend yourself — that's the hook. Don't take it. Don't apologise reflexively.",
    responses: {
      grey: ["Okay.", "I see.", "I hear you."],
      yellow: ["I'm not in a place to discuss this productively right now.", "I understand you're upset. Let's revisit this another time.", "I'd like to step back from this conversation."],
      biff: ["I disagree with that characterisation. I won't be engaging further on this topic today."],
      "buy-time": ["I want to respond properly. Give me some time.", "I'll come back to you on that."],
    },
  },
  {
    id: "guilt",
    label: "Guilt / obligation",
    cues: ["after everything i've done", "if you loved me", "no one else would", "you owe me", "i can't believe you'd"],
    note: "Guilt as a tool. You don't owe a response in kind.",
    responses: {
      grey: ["Okay.", "Hmm."],
      yellow: ["I hear what you're saying. I need some time.", "I appreciate you telling me. I'll think about it."],
      biff: ["I've heard you. I'll respond when I'm ready."],
      "buy-time": ["I'm not going to respond to that right now.", "I need time to think about this."],
    },
  },
  {
    id: "threat",
    label: "Threat / ultimatum",
    cues: ["you'll regret", "i'll ruin", "you'll lose", "if you don't", "i'll tell everyone", "i'll take", "or else"],
    note: "Explicit or implied threats. Your safety comes first — phrases are not safety plans. If you're in danger, prioritise getting somewhere safe.",
    responses: {
      grey: ["Understood.", "Okay."],
      yellow: ["I've heard you. I won't be discussing this further today.", "I'd prefer any further conversation to be in writing."],
      biff: ["I've noted what you've said. I won't be responding further."],
      "buy-time": ["I'll think about what you've said.", "I need time."],
    },
    safetyFlag: true,
  },
  {
    id: "pressure",
    label: "Pressure for an answer",
    cues: ["right now", "tell me now", "answer me", "yes or no", "decide", "won't take", "i need to know"],
    note: "Forced urgency is itself a tactic. 'I'll think about it' is a complete answer.",
    responses: {
      grey: ["I'll think about it.", "Not right now."],
      yellow: ["I'm not able to give you an answer in this moment. I'll come back to you.", "I need to think about this properly. I'll let you know."],
      biff: ["I'll respond once I've thought it through. I don't have an answer right now."],
      "buy-time": ["I need a moment to think.", "Let me sit with this. I'll come back to it.", "I'll think about it."],
    },
  },
  {
    id: "isolation",
    label: "Pulling on your support",
    cues: ["your friends", "your family", "they don't really", "they're a bad influence", "they don't understand"],
    note: "Critique of your support network is often isolation work. You don't have to defend the people you love to them.",
    responses: {
      grey: ["Mm.", "Okay."],
      yellow: ["I hear you. Let's move on.", "Noted. I'd rather not get into this."],
      biff: ["I'd rather not discuss other people in my life. Let's talk about something else."],
      "buy-time": ["I'm not going to get into that today.", "Let me think about it."],
    },
  },
  {
    id: "generic",
    label: "Something else",
    cues: [],
    note: "When you can't quite name it but you know you need to respond carefully.",
    responses: {
      grey: ["Okay.", "I hear you.", "Mm.", "Noted."],
      yellow: ["Thanks for letting me know.", "I appreciate you saying that.", "I'll think about it.", "Let's leave it there for now."],
      biff: ["Understood. I'll respond properly when I can.", "I've noted what you've said. I'll come back to you."],
      "buy-time": ["I need a moment.", "I'll come back to this.", "Let me sit with it.", "I want to think before I respond."],
    },
  },
];

// JADE warning traps — phrases the user might WANT to say but shouldn't
const JADE_TRAPS = [
  { type: "Justify", example: "I only did it because…" },
  { type: "Argue", example: "But that's not what happened, you said…" },
  { type: "Defend", example: "I'm not [whatever they called you]…" },
  { type: "Explain", example: "Let me explain why I…" },
];

// Lightweight pattern matcher
function matchPattern(text) {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return null;
  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.id === "generic") continue;
    if (pattern.cues.some(cue => lower.includes(cue))) {
      return pattern;
    }
  }
  return ATTACK_PATTERNS.find(p => p.id === "generic");
}

// ── Sample seed data so Patterns view has something to show ──
const seedEntries = () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    {
      id: "s1", mode: "guided", ts: now - day * 2,
      tags: ["reality-undermining", "emotion-dismissal"],
      impact: { body: ["Tight chest"], emotion: ["Confusion"], mind: ["Second-guessing myself"] },
      context: { channel: "In person", setting: "Alone", postSep: false, children: false, digital: false },
      clarity: "mixed", note: "Said the conversation we had on Tuesday never happened.", isSample: true,
    },
    {
      id: "s2", mode: "quick", ts: now - day * 5,
      tags: ["withdrawal", "hot-cold"],
      impact: { body: ["Exhausted"], emotion: ["Smallness"], mind: ["Walking on eggshells"] },
      context: { channel: "Message", setting: "Alone", postSep: false, children: false, digital: false },
      clarity: "clear", note: "", isSample: true,
    },
    {
      id: "s3", mode: "fragment", ts: now - day * 7,
      tags: [], fragment: "the way they looked at me when I asked. like I'd done something wrong for asking.",
      fuzzyTime: "Recently", clarity: "fragment", isSample: true,
    },
    {
      id: "s4", mode: "guided", ts: now - day * 9,
      tags: ["blame-flip", "role-reversal"],
      impact: { body: ["Jaw clenched", "Nausea"], emotion: ["Guilt", "Confusion"], mind: ["Rehearsing what to say"] },
      context: { channel: "In person", setting: "Public", postSep: false, children: false, digital: false },
      clarity: "clear", note: "I asked about the money. Ended up apologising.", isSample: true,
    },
    {
      id: "s5", mode: "quick", ts: now - day * 12,
      tags: ["reality-undermining"],
      impact: { body: ["Foggy head"], emotion: ["Confusion"], mind: ["Doubting my memory"] },
      context: { channel: "Call", setting: "Alone", postSep: false, children: false, digital: false },
      clarity: "mixed", note: "", isSample: true,
    },
    {
      id: "s6", mode: "guided", ts: now - day * 15,
      tags: ["emotion-dismissal", "rule-shifting"],
      impact: { body: ["Tight chest"], emotion: ["Shame"], mind: ["Lost track of what I wanted"] },
      context: { channel: "In person", setting: "With others", postSep: false, children: false, digital: false },
      clarity: "mixed", note: "Was told I'm 'always making things bigger than they are'.", isSample: true,
    },
    {
      id: "s7", mode: "fragment", ts: now - day * 18,
      tags: [], fragment: "stomach drop when their name lit up the phone",
      fuzzyTime: "This week", clarity: "fragment", isSample: true,
    },
  ];
};

// ── Small UI building blocks ──
const Chip = ({ active, onClick, children, hint, soft = false }) => (
  <button
    onClick={onClick}
    className="text-left rounded-full border transition-all duration-200"
    style={{
      padding: "10px 16px",
      fontSize: 14,
      lineHeight: 1.3,
      fontFamily: fontStack.body,
      background: active ? C.sageDeep : soft ? C.cardWarm : C.card,
      color: active ? C.card : C.ink,
      borderColor: active ? C.sageDeep : C.line,
      boxShadow: active ? "0 1px 0 rgba(0,0,0,0.04)" : "none",
    }}
    title={hint || ""}
  >
    {children}
  </button>
);

const SoftCard = ({ children, onClick, className = "", style = {} }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`text-left w-full transition-all duration-200 ${onClick ? "hover:-translate-y-[1px]" : ""} ${className}`}
    style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      padding: 20,
      fontFamily: fontStack.body,
      color: C.ink,
      cursor: onClick ? "pointer" : "default",
      ...style,
    }}
  >
    {children}
  </button>
);

const SectionLabel = ({ children, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      fontFamily: fontStack.body,
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: C.inkSoft,
      fontWeight: 500,
    }}>{children}</div>
    {sub && (
      <div style={{
        fontFamily: fontStack.body,
        fontSize: 13,
        color: C.inkMuted,
        marginTop: 4,
      }}>{sub}</div>
    )}
  </div>
);

const PrimaryButton = ({ onClick, children, disabled = false, full = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="transition-all duration-200"
    style={{
      background: disabled ? C.line : C.sageDeep,
      color: C.card,
      border: "none",
      borderRadius: 999,
      padding: "14px 22px",
      fontFamily: fontStack.body,
      fontSize: 15,
      fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer",
      width: full ? "100%" : "auto",
      letterSpacing: "0.01em",
    }}
  >{children}</button>
);

const GhostButton = ({ onClick, children, full = false }) => (
  <button
    onClick={onClick}
    className="transition-all duration-200"
    style={{
      background: "transparent",
      color: C.ink,
      border: `1px solid ${C.line}`,
      borderRadius: 999,
      padding: "14px 22px",
      fontFamily: fontStack.body,
      fontSize: 15,
      fontWeight: 500,
      cursor: "pointer",
      width: full ? "100%" : "auto",
    }}
  >{children}</button>
);

const QuietLink = ({ onClick, children }) => (
  <button onClick={onClick} style={{
    background: "none",
    border: "none",
    color: C.inkSoft,
    fontFamily: fontStack.body,
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 4,
    textDecorationColor: C.line,
    padding: 0,
  }}>{children}</button>
);

// Helpers
const tagLabel = (id) => PATTERN_TAGS.find(t => t.id === id)?.label || id;
const fmtDate = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const dayMs = 86400000;
  const diff = Math.floor((now - d) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// ╔═════════════════════════════════════════════════════════════════════════╗
//   MAIN APP
// ╚═════════════════════════════════════════════════════════════════════════╝
export default function App() {
  const [view, setView] = useState("onboarding"); // onboarding | home | log-picker | quick | guided | fragment | patterns | toolkit | phrasebook | resources | entry-detail | settings
  const [entries, setEntries] = useState(() => seedEntries());
  const [draft, setDraft] = useState(null); // in-progress entry
  const [exitMode, setExitMode] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [groundingTool, setGroundingTool] = useState(null); // "54321" | "breath" | "anchor" | "validation"
  const [activeEntry, setActiveEntry] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // After onboarding, route to home
  const finishOnboarding = () => setView("home");

  const addEntry = (entry) => {
    setEntries(prev => [{ ...entry, id: `e${Date.now()}`, ts: Date.now() }, ...prev]);
  };

  const deleteEntry = (id) => setEntries(prev => prev.filter(e => e.id !== id));
  const clearSamples = () => setEntries(prev => prev.filter(e => !e.isSample));

  // ── Quick exit: render fake weather screen ──
  if (exitMode) {
    return <ExitDecoy onReturn={() => setExitMode(false)} />;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      fontFamily: fontStack.body,
      color: C.ink,
      paddingBottom: view === "onboarding" ? 0 : 96,
      position: "relative",
    }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Subtle paper grain */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: `radial-gradient(${C.line} 0.5px, transparent 0.5px)`,
        backgroundSize: "3px 3px",
        opacity: 0.18,
        zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto" }}>
        {view !== "onboarding" && (
          <TopBar
            onExit={() => setExitMode(true)}
            onSettings={() => setView("settings")}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {view === "onboarding" && <Onboarding onDone={finishOnboarding} />}

            {view === "home" && (
              <Home
                entries={entries}
                go={setView}
                openEntry={(e) => { setActiveEntry(e); setView("entry-detail"); }}
              />
            )}

            {view === "log-picker" && <LogPicker go={setView} />}

            {view === "quick" && (
              <QuickLog
                onCancel={() => setView("home")}
                onSave={(e) => { addEntry(e); setView("home"); }}
              />
            )}

            {view === "guided" && (
              <GuidedCheckIn
                onCancel={() => setView("home")}
                onSave={(e) => { addEntry(e); setView("home"); }}
              />
            )}

            {view === "fragment" && (
              <FragmentDump
                onCancel={() => setView("home")}
                onSave={(e) => { addEntry(e); setView("home"); }}
              />
            )}

            {view === "patterns" && (
              <Patterns
                entries={entries}
                openEntry={(e) => { setActiveEntry(e); setView("entry-detail"); }}
              />
            )}

            {view === "toolkit" && (
              <Toolkit
                openTool={(t) => { setGroundingTool(t); setGroundingOpen(true); }}
                go={setView}
              />
            )}

            {view === "phrasebook" && <Phrasebook onBack={() => setView("toolkit")} />}
            {view === "active-defense" && <ActiveDefense onBack={() => setView("toolkit")} />}
            {view === "resources" && <Resources onBack={() => setView("toolkit")} />}

            {view === "entry-detail" && activeEntry && (
              <EntryDetail
                entry={activeEntry}
                onBack={() => setView("patterns")}
                onDelete={() => { deleteEntry(activeEntry.id); setView("patterns"); }}
              />
            )}

            {view === "settings" && (
              <SettingsView
                onBack={() => setView("home")}
                onClearSamples={clearSamples}
                hasSamples={entries.some(e => e.isSample)}
                confirmClear={confirmClear}
                setConfirmClear={setConfirmClear}
                clearAll={() => { setEntries([]); setConfirmClear(false); }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {view !== "onboarding" && (
        <>
          <BottomNav view={view} setView={setView} />
          <FloatingGroundingBtn
            open={() => { setGroundingTool(null); setGroundingOpen(true); }}
          />
        </>
      )}

      <AnimatePresence>
        {groundingOpen && (
          <GroundingModal
            tool={groundingTool}
            setTool={setGroundingTool}
            close={() => { setGroundingOpen(false); setGroundingTool(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   TOP BAR
// ╚═════════════════════════════════════════════════════════════════════════╝
function TopBar({ onExit, onSettings }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 20px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: C.sageDeep,
          display: "grid", placeItems: "center",
          color: C.card, fontFamily: fontStack.display, fontSize: 14, fontWeight: 600,
          fontStyle: "italic",
        }}>n</div>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 18,
          fontWeight: 400,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}>narc-ass<span style={{ fontStyle: "italic", color: C.sageDeep }}>Y</span>st</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onSettings}
          aria-label="Settings"
          style={{
            background: "transparent", border: "none", padding: 8,
            color: C.inkSoft, cursor: "pointer", borderRadius: 8,
          }}
        ><SettingsIcon size={18} /></button>
        <button
          onClick={onExit}
          style={{
            background: C.cardWarm,
            border: `1px solid ${C.line}`,
            borderRadius: 999,
            padding: "8px 14px",
            fontFamily: fontStack.body,
            fontSize: 12,
            fontWeight: 500,
            color: C.ink,
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            letterSpacing: "0.02em",
          }}
        >
          Quick exit <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   ONBOARDING — 4 cards, skippable
// ╚═════════════════════════════════════════════════════════════════════════╝
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slides = [
    {
      eyebrow: "Welcome",
      title: "This is a notebook,\nnot a verdict.",
      body: "It helps you record what's happening — and how it's affecting you. It doesn't diagnose anyone, including you.",
    },
    {
      eyebrow: "What it can do",
      title: "Hold what's hard\nto hold alone.",
      body: "Quick notes when you're activated. Longer check-ins when you're confused. Fragments for the things you can't put into words yet.",
    },
    {
      eyebrow: "What it can't do",
      title: "It can't see\nthe whole picture.",
      body: "It can't measure danger, decide what something means, or replace a person you trust. If you're in immediate danger, please reach out to someone qualified.",
    },
    {
      eyebrow: "Quick exit",
      title: "Up there, always.",
      body: "Tap it to switch to a neutral screen. It helps if someone walks in. It does not protect against monitoring software on your device.",
    },
  ];

  const s = slides[step];
  return (
    <div style={{ padding: "60px 24px 32px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{
          fontFamily: fontStack.body,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.sageDeep,
          marginBottom: 18,
        }}>{s.eyebrow}</div>
        <h1 style={{
          fontFamily: fontStack.display,
          fontSize: 38,
          lineHeight: 1.05,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: C.ink,
          whiteSpace: "pre-line",
          marginBottom: 18,
        }}>{s.title}</h1>
        <p style={{
          fontFamily: fontStack.body,
          fontSize: 16,
          lineHeight: 1.5,
          color: C.inkSoft,
          maxWidth: 380,
        }}>{s.body}</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {slides.map((_, i) => (
          <div key={i} style={{
            height: 3,
            flex: 1,
            background: i <= step ? C.sageDeep : C.line,
            borderRadius: 2,
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <GhostButton onClick={onDone}>Skip</GhostButton>
        <div style={{ flex: 1 }} />
        {step > 0 && (
          <GhostButton onClick={() => setStep(s => s - 1)}>Back</GhostButton>
        )}
        <PrimaryButton onClick={() => step < slides.length - 1 ? setStep(s => s + 1) : onDone()}>
          {step < slides.length - 1 ? "Next" : "Begin"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   HOME
// ╚═════════════════════════════════════════════════════════════════════════╝
function Home({ entries, go, openEntry }) {
  const recent = entries.slice(0, 3);
  const monthCount = entries.filter(e => Date.now() - e.ts < 30 * 86400000).length;

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ marginTop: 16, marginBottom: 22 }}>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 30,
          lineHeight: 1.1,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: C.ink,
        }}>
          Hello.
        </div>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 18,
          fontStyle: "italic",
          color: C.inkSoft,
          marginTop: 4,
          fontWeight: 300,
        }}>
          What you're feeling makes sense.
        </div>
      </div>

      {/* Emergency: it's happening right now */}
      <button
        onClick={() => go("active-defense")}
        className="transition-all duration-200 hover:-translate-y-[1px]"
        style={{
          width: "100%",
          background: `linear-gradient(135deg, ${C.cardWarm} 0%, ${C.card} 100%)`,
          border: `1px solid ${C.clayDeep}`,
          borderRadius: 16,
          padding: "16px 18px",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: fontStack.body,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: 4, background: C.clayDeep,
        }} />
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: C.clayDeep,
          display: "grid", placeItems: "center",
          color: C.card,
          flexShrink: 0,
          marginLeft: 4,
        }}><Shield size={18} /></div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: fontStack.display,
            fontSize: 18,
            fontWeight: 400,
            color: C.ink,
            letterSpacing: "-0.01em",
          }}>It's happening right now</div>
          <div style={{
            fontSize: 13, color: C.inkSoft, marginTop: 2,
            fontFamily: fontStack.display, fontStyle: "italic",
          }}>
            Active defense — translate, deflect, don't feed it.
          </div>
        </div>
        <ChevronRight size={16} color={C.inkMuted} />
      </button>

      <SectionLabel sub="When you have time to capture or reflect.">Or — log something</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        <ModeCard
          title="Quick log"
          sub="A few taps. Around 30 seconds."
          time="~30s"
          onClick={() => go("quick")}
        />
        <ModeCard
          title="Guided check-in"
          sub="When something feels off and you're not sure what."
          time="2–4 min"
          onClick={() => go("guided")}
        />
        <ModeCard
          title="Drop a fragment"
          sub="Words, images, body sensations. No need to explain."
          time="under a minute"
          onClick={() => go("fragment")}
        />
      </div>

      {recent.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel sub={`${monthCount} ${monthCount === 1 ? "note" : "notes"} in the last 30 days`}>Recent</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map(e => (
              <RecentRow key={e.id} entry={e} onClick={() => openEntry(e)} />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <QuietLink onClick={() => go("patterns")}>See what you've noticed →</QuietLink>
          </div>
        </div>
      )}

      <div style={{
        marginTop: 16,
        padding: 18,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 14,
      }}>
        <div style={{
          fontFamily: fontStack.display,
          fontStyle: "italic",
          fontSize: 16,
          color: C.sageDeep,
          marginBottom: 8,
          fontWeight: 400,
        }}>A small reminder</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: C.ink }}>
          Frequency matters more than any single moment. You don't have to decide what something means today.
        </div>
      </div>
    </div>
  );
}

function ModeCard({ title, sub, time, onClick }) {
  return (
    <button
      onClick={onClick}
      className="transition-all duration-200 hover:-translate-y-[1px]"
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: "20px 22px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: fontStack.body,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 20,
          fontWeight: 400,
          color: C.ink,
          letterSpacing: "-0.01em",
        }}>{title}</div>
        <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>
        <div style={{
          fontSize: 11,
          color: C.inkMuted,
          marginTop: 8,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>{time}</div>
      </div>
      <ChevronRight size={18} color={C.inkMuted} />
    </button>
  );
}

function RecentRow({ entry, onClick }) {
  const previewText = entry.mode === "fragment"
    ? entry.fragment
    : entry.note || (entry.tags?.map(tagLabel).slice(0, 2).join(" · ") || "—");
  const modeLabel = entry.mode === "quick" ? "Quick log" : entry.mode === "guided" ? "Check-in" : "Fragment";

  return (
    <button
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: 14,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: fontStack.body,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: 999,
        background: entry.mode === "fragment" ? C.clay : C.sage,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, color: C.ink, lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontStyle: entry.mode === "fragment" ? "italic" : "normal",
        }}>{previewText}</div>
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2, letterSpacing: "0.04em" }}>
          {modeLabel} · {fmtDate(entry.ts)}
        </div>
      </div>
      <ChevronRight size={14} color={C.inkMuted} />
    </button>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   QUICK LOG
// ╚═════════════════════════════════════════════════════════════════════════╝
function QuickLog({ onCancel, onSave }) {
  const [tags, setTags] = useState([]);
  const [bodyImpact, setBodyImpact] = useState([]);
  const [emotionImpact, setEmotionImpact] = useState([]);
  const [channel, setChannel] = useState(null);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const save = () => {
    onSave({
      mode: "quick",
      tags,
      impact: { body: bodyImpact, emotion: emotionImpact, mind: [] },
      context: { channel, setting: null, postSep: false, children: false, digital: false },
      clarity: null,
      note: "",
    });
  };

  return (
    <FormShell title="Quick log" sub="Tap what fits. Skip the rest." onCancel={onCancel}>
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>What did you notice?</SectionLabel>
        <ChipGrid>
          {PATTERN_TAGS.slice(0, 12).map(t => (
            <Chip
              key={t.id}
              active={tags.includes(t.id)}
              onClick={() => toggle(tags, setTags, t.id)}
              hint={t.hint}
            >{t.label}</Chip>
          ))}
        </ChipGrid>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Body</SectionLabel>
        <ChipGrid>
          {IMPACT_BODY.slice(0, 8).map(label => (
            <Chip
              key={label}
              soft
              active={bodyImpact.includes(label)}
              onClick={() => toggle(bodyImpact, setBodyImpact, label)}
            >{label}</Chip>
          ))}
        </ChipGrid>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Feeling</SectionLabel>
        <ChipGrid>
          {IMPACT_EMOTION.slice(0, 8).map(label => (
            <Chip
              key={label}
              soft
              active={emotionImpact.includes(label)}
              onClick={() => toggle(emotionImpact, setEmotionImpact, label)}
            >{label}</Chip>
          ))}
        </ChipGrid>
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionLabel>Where</SectionLabel>
        <ChipGrid>
          {CONTEXT_CHANNEL.map(c => (
            <Chip
              key={c}
              soft
              active={channel === c}
              onClick={() => setChannel(channel === c ? null : c)}
            >{c}</Chip>
          ))}
        </ChipGrid>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={save}>Save</PrimaryButton>
      </div>

      <div style={{
        marginTop: 16,
        fontSize: 12,
        color: C.inkMuted,
        textAlign: "center",
        fontStyle: "italic",
        fontFamily: fontStack.display,
      }}>
        You can leave any field empty.
      </div>
    </FormShell>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   GUIDED CHECK-IN — 6 steps
// ╚═════════════════════════════════════════════════════════════════════════╝
function GuidedCheckIn({ onCancel, onSave }) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState(null);
  const [tags, setTags] = useState([]);
  const [phrase, setPhrase] = useState("");
  const [showPhrase, setShowPhrase] = useState(false);
  const [bodyImpact, setBodyImpact] = useState([]);
  const [emotionImpact, setEmotionImpact] = useState([]);
  const [mindImpact, setMindImpact] = useState([]);
  const [channel, setChannel] = useState(null);
  const [setting, setSetting] = useState(null);
  const [postSep, setPostSep] = useState(false);
  const [children, setChildren] = useState(false);
  const [digital, setDigital] = useState(false);
  const [clarity, setClarity] = useState(null);

  const totalSteps = 6;

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const finish = () => {
    onSave({
      mode: "guided",
      state,
      tags,
      phrase: phrase || undefined,
      impact: { body: bodyImpact, emotion: emotionImpact, mind: mindImpact },
      context: { channel, setting, postSep, children, digital },
      clarity,
      note: phrase || "",
    });
  };

  const next = () => step < totalSteps - 1 ? setStep(s => s + 1) : finish();
  const back = () => step > 0 ? setStep(s => s - 1) : onCancel();

  return (
    <FormShell
      title="Guided check-in"
      sub={`Step ${step + 1} of ${totalSteps}`}
      onCancel={onCancel}
      progress={(step + 1) / totalSteps}
    >
      {step === 0 && (
        <StepBlock
          eyebrow="Step 1"
          title="What's coming up for you?"
          sub="More than one is fine. So is just 'unclear'."
        >
          <ChipGrid>
            {STATE_CHIPS.map(s => (
              <Chip key={s.id} active={state === s.id} onClick={() => setState(s.id)} hint={s.hint}>
                {s.label}
              </Chip>
            ))}
          </ChipGrid>
        </StepBlock>
      )}

      {step === 1 && (
        <StepBlock
          eyebrow="Step 2"
          title="What did you notice?"
          sub="These are patterns, not labels. Pick what fits."
        >
          <ChipGrid>
            {PATTERN_TAGS.map(t => (
              <Chip
                key={t.id}
                active={tags.includes(t.id)}
                onClick={() => toggle(tags, setTags, t.id)}
                hint={t.hint}
              >{t.label}</Chip>
            ))}
          </ChipGrid>
        </StepBlock>
      )}

      {step === 2 && (
        <StepBlock
          eyebrow="Step 3"
          title="Words, if any?"
          sub="Optional. Sometimes capturing exact words helps. Sometimes it doesn't."
        >
          {!showPhrase ? (
            <button
              onClick={() => setShowPhrase(true)}
              style={{
                background: C.cardWarm,
                border: `1px dashed ${C.line}`,
                borderRadius: 12,
                padding: 18,
                width: "100%",
                fontFamily: fontStack.body,
                fontSize: 14,
                color: C.inkSoft,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              + Add words (optional)
            </button>
          ) : (
            <textarea
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder="A phrase, a turn of conversation, what was said..."
              rows={5}
              style={{
                width: "100%",
                background: C.card,
                border: `1px solid ${C.line}`,
                borderRadius: 12,
                padding: 14,
                fontFamily: fontStack.body,
                fontSize: 14,
                lineHeight: 1.5,
                color: C.ink,
                resize: "vertical",
                outline: "none",
              }}
              autoFocus
            />
          )}
          <div style={{
            marginTop: 12,
            fontSize: 12,
            color: C.inkMuted,
            fontStyle: "italic",
            fontFamily: fontStack.display,
          }}>
            You can come back later and add to this.
          </div>
        </StepBlock>
      )}

      {step === 3 && (
        <StepBlock
          eyebrow="Step 4"
          title="How did it land?"
          sub="In your body, in your emotions, in your mind."
        >
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>BODY</div>
            <ChipGrid>
              {IMPACT_BODY.map(l => (
                <Chip key={l} soft active={bodyImpact.includes(l)}
                  onClick={() => toggle(bodyImpact, setBodyImpact, l)}>{l}</Chip>
              ))}
            </ChipGrid>
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>FEELING</div>
            <ChipGrid>
              {IMPACT_EMOTION.map(l => (
                <Chip key={l} soft active={emotionImpact.includes(l)}
                  onClick={() => toggle(emotionImpact, setEmotionImpact, l)}>{l}</Chip>
              ))}
            </ChipGrid>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>MIND</div>
            <ChipGrid>
              {IMPACT_MIND.map(l => (
                <Chip key={l} soft active={mindImpact.includes(l)}
                  onClick={() => toggle(mindImpact, setMindImpact, l)}>{l}</Chip>
              ))}
            </ChipGrid>
          </div>
        </StepBlock>
      )}

      {step === 4 && (
        <StepBlock
          eyebrow="Step 5"
          title="Context"
          sub="Anything that helps later you understand it."
        >
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>WHERE</div>
            <ChipGrid>
              {CONTEXT_CHANNEL.map(c => (
                <Chip key={c} soft active={channel === c}
                  onClick={() => setChannel(channel === c ? null : c)}>{c}</Chip>
              ))}
            </ChipGrid>
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>SETTING</div>
            <ChipGrid>
              {CONTEXT_SETTING.map(c => (
                <Chip key={c} soft active={setting === c}
                  onClick={() => setSetting(setting === c ? null : c)}>{c}</Chip>
              ))}
            </ChipGrid>
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, letterSpacing: "0.06em" }}>FLAGS</div>
            <ChipGrid>
              <Chip soft active={postSep} onClick={() => setPostSep(!postSep)}>Post-separation</Chip>
              <Chip soft active={children} onClick={() => setChildren(!children)}>Children involved</Chip>
              <Chip soft active={digital} onClick={() => setDigital(!digital)}>Digital weirdness</Chip>
            </ChipGrid>
          </div>
        </StepBlock>
      )}

      {step === 5 && (
        <StepBlock
          eyebrow="Step 6"
          title="How clear does this feel?"
          sub="There's no right answer. 'Unsure' is a real answer."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CLARITY_OPTIONS.map(c => (
              <button
                key={c.id}
                onClick={() => setClarity(c.id)}
                style={{
                  background: clarity === c.id ? C.sageDeep : C.card,
                  color: clarity === c.id ? C.card : C.ink,
                  border: `1px solid ${clarity === c.id ? C.sageDeep : C.line}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: fontStack.body,
                }}
              >
                <div style={{
                  fontFamily: fontStack.display,
                  fontSize: 17,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}>{c.label}</div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{c.hint}</div>
              </button>
            ))}
          </div>
        </StepBlock>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        <GhostButton onClick={back}>{step === 0 ? "Cancel" : "Back"}</GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={next}>
          {step < totalSteps - 1 ? "Next" : "Save"}
        </PrimaryButton>
      </div>
    </FormShell>
  );
}

function StepBlock({ eyebrow, title, sub, children }) {
  return (
    <div>
      <div style={{
        fontFamily: fontStack.body,
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.sageDeep,
        marginBottom: 10,
      }}>{eyebrow}</div>
      <h2 style={{
        fontFamily: fontStack.display,
        fontSize: 26,
        lineHeight: 1.15,
        fontWeight: 400,
        letterSpacing: "-0.02em",
        color: C.ink,
        marginBottom: 6,
      }}>{title}</h2>
      {sub && (
        <p style={{
          fontFamily: fontStack.body,
          fontSize: 14,
          color: C.inkSoft,
          marginBottom: 22,
          lineHeight: 1.5,
        }}>{sub}</p>
      )}
      {children}
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   FRAGMENT DUMP
// ╚═════════════════════════════════════════════════════════════════════════╝
function FragmentDump({ onCancel, onSave }) {
  const [text, setText] = useState("");
  const [time, setTime] = useState("Just now");

  return (
    <FormShell title="Drop a fragment" sub="Words, an image, a body memory. Doesn't have to make sense." onCancel={onCancel}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="A snippet. A phrase. The way they looked. A weight in your chest. Whatever's there."
        rows={8}
        style={{
          width: "100%",
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: 18,
          fontFamily: fontStack.display,
          fontStyle: "italic",
          fontSize: 16,
          lineHeight: 1.6,
          color: C.ink,
          resize: "vertical",
          outline: "none",
          marginBottom: 22,
        }}
        autoFocus
      />

      <SectionLabel sub="Roughly when. No need to be exact.">When</SectionLabel>
      <ChipGrid>
        {FUZZY_TIME.map(t => (
          <Chip key={t} soft active={time === t} onClick={() => setTime(t)}>{t}</Chip>
        ))}
      </ChipGrid>

      <div style={{
        marginTop: 24,
        padding: 14,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 10,
        fontSize: 13,
        color: C.inkSoft,
        lineHeight: 1.5,
      }}>
        Fragments don't have to be coherent. You can come back and add to it later, or never. Either is fine.
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton
          onClick={() => onSave({
            mode: "fragment",
            fragment: text,
            fuzzyTime: time,
            tags: [],
            clarity: "fragment",
          })}
          disabled={!text.trim()}
        >Save fragment</PrimaryButton>
      </div>
    </FormShell>
  );
}

function FormShell({ title, sub, onCancel, children, progress }) {
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <div style={{ marginTop: 12, marginBottom: 22 }}>
        <button
          onClick={onCancel}
          style={{
            background: "transparent", border: "none", padding: 0,
            color: C.inkSoft, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
            marginBottom: 14,
            fontFamily: fontStack.body,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h1 style={{
          fontFamily: fontStack.display,
          fontSize: 28,
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: C.ink,
          marginBottom: 4,
        }}>{title}</h1>
        {sub && (
          <p style={{
            fontFamily: fontStack.body,
            fontSize: 14,
            color: C.inkSoft,
          }}>{sub}</p>
        )}
        {progress !== undefined && (
          <div style={{
            marginTop: 14,
            height: 3,
            background: C.line,
            borderRadius: 2,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: C.sageDeep,
              transition: "width 0.3s",
            }} />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipGrid({ children }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {children}
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   PATTERNS — frequency + timeline + co-occurrence
// ╚═════════════════════════════════════════════════════════════════════════╝
function Patterns({ entries, openEntry }) {
  const [filter, setFilter] = useState("all"); // all | postsep | digital

  const filtered = useMemo(() => {
    if (filter === "postsep") return entries.filter(e => e.context?.postSep);
    if (filter === "digital") return entries.filter(e => e.context?.digital || e.tags?.includes("digital"));
    return entries;
  }, [entries, filter]);

  // Frequency
  const freq = useMemo(() => {
    const counts = {};
    filtered.forEach(e => {
      (e.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // Co-occurrence pairs
  const cooccur = useMemo(() => {
    const pairs = {};
    filtered.forEach(e => {
      const ts = e.tags || [];
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          const key = [ts[i], ts[j]].sort().join("|");
          pairs[key] = (pairs[key] || 0) + 1;
        }
      }
    });
    return Object.entries(pairs).filter(([_, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  // Timeline grouped by week
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(e => {
      const d = new Date(e.ts);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.getTime();
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  if (entries.length === 0) {
    return (
      <div style={{ padding: "8px 20px 32px" }}>
        <h1 style={{
          fontFamily: fontStack.display,
          fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
          color: C.ink, marginTop: 12, marginBottom: 10,
        }}>What you've noticed</h1>
        <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5, marginBottom: 24 }}>
          Once you log a few notes, this is where you'll see what comes up — frequency, weeks, what tends to appear together.
        </p>
        <div style={{
          padding: 24, textAlign: "center",
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
          fontFamily: fontStack.display, fontStyle: "italic",
          color: C.inkSoft, fontSize: 16,
        }}>
          Nothing here yet.
        </div>
      </div>
    );
  }

  const totalLogged = filtered.length;
  const monthAgo = Date.now() - 30 * 86400000;
  const last30 = filtered.filter(e => e.ts >= monthAgo).length;
  const maxFreq = Math.max(1, ...freq.map(([, n]) => n));

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginTop: 12, marginBottom: 4,
      }}>What you've noticed</h1>
      <p style={{
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontSize: 15,
        color: C.inkSoft,
        marginBottom: 22,
        fontWeight: 300,
      }}>
        Descriptions, not verdicts.
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")} soft>All notes</Chip>
        <Chip active={filter === "postsep"} onClick={() => setFilter("postsep")} soft>Post-separation</Chip>
        <Chip active={filter === "digital"} onClick={() => setFilter("digital")} soft>Digital</Chip>
      </div>

      {/* Summary */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28,
      }}>
        <StatCard num={totalLogged} label="notes total" />
        <StatCard num={last30} label="in last 30 days" />
      </div>

      {/* Frequency */}
      {freq.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel sub="What you've noticed most often">Patterns by frequency</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {freq.slice(0, 8).map(([id, n]) => (
              <FreqRow key={id} label={tagLabel(id)} count={n} max={maxFreq} />
            ))}
          </div>
        </div>
      )}

      {/* Co-occurrence */}
      {cooccur.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel sub="Patterns that tend to show up together">Often together</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cooccur.map(([key, n]) => {
              const [a, b] = key.split("|");
              return (
                <div key={key} style={{
                  background: C.card,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 14,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
                    <span style={{ color: C.ink }}>{tagLabel(a)}</span>
                    <span style={{ color: C.inkMuted, margin: "0 8px" }}>+</span>
                    <span style={{ color: C.ink }}>{tagLabel(b)}</span>
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: C.sageDeep,
                    fontFamily: fontStack.display,
                    fontStyle: "italic",
                  }}>{n}×</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <SectionLabel>Timeline</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {grouped.map(([weekKey, items]) => (
            <div key={weekKey}>
              <div style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: C.inkMuted,
                marginBottom: 8,
              }}>
                Week of {new Date(parseInt(weekKey)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map(e => (
                  <RecentRow key={e.id} entry={e} onClick={() => openEntry(e)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 32,
        padding: 16,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 12,
        fontSize: 13,
        color: C.inkSoft,
        lineHeight: 1.55,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Info size={14} color={C.sageDeep} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            This view shows what you've recorded. It can't tell you what something means, whether you're "right", or what to do next. Patterns can be useful — and they aren't proof.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ num, label }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{
        fontFamily: fontStack.display,
        fontSize: 32,
        fontWeight: 400,
        color: C.ink,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}>{num}</div>
      <div style={{
        fontSize: 12,
        color: C.inkSoft,
        marginTop: 4,
      }}>{label}</div>
    </div>
  );
}

function FreqRow({ label, count, max }) {
  const pct = (count / max) * 100;
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 12,
      padding: "12px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: C.ink }}>{label}</div>
        <div style={{
          fontSize: 13, color: C.sageDeep,
          fontFamily: fontStack.display, fontStyle: "italic",
        }}>{count}</div>
      </div>
      <div style={{
        height: 4, background: C.lineSoft, borderRadius: 2, overflow: "hidden",
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ height: "100%", background: C.sage }}
        />
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   ENTRY DETAIL
// ╚═════════════════════════════════════════════════════════════════════════╝
function EntryDetail({ entry, onBack, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent", border: "none", padding: 0,
          color: C.inkSoft, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          marginTop: 12, marginBottom: 22,
          fontFamily: fontStack.body,
        }}
      >
        <ArrowLeft size={14} /> Back to patterns
      </button>

      <div style={{
        fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
        color: C.sageDeep, marginBottom: 8,
      }}>
        {entry.mode === "quick" ? "Quick log" : entry.mode === "guided" ? "Guided check-in" : "Fragment"}
        {entry.isSample && <span style={{ color: C.clay, marginLeft: 8 }}>· sample</span>}
      </div>

      <div style={{
        fontFamily: fontStack.display,
        fontSize: 14,
        color: C.inkMuted,
        marginBottom: 18,
      }}>
        {fmtDate(entry.ts)} · {fmtTime(entry.ts)}
      </div>

      {entry.mode === "fragment" && entry.fragment && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: 22,
          fontFamily: fontStack.display,
          fontStyle: "italic",
          fontSize: 18,
          lineHeight: 1.6,
          color: C.ink,
          marginBottom: 18,
        }}>
          "{entry.fragment}"
        </div>
      )}

      {entry.note && (
        <div style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: 18,
          fontSize: 15,
          lineHeight: 1.55,
          color: C.ink,
          marginBottom: 18,
        }}>
          {entry.note}
        </div>
      )}

      {entry.tags && entry.tags.length > 0 && (
        <DetailBlock label="Patterns noticed">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {entry.tags.map(t => (
              <span key={t} style={{
                fontSize: 13,
                color: C.sageDeep,
                background: C.sageSoft,
                padding: "4px 10px",
                borderRadius: 999,
              }}>{tagLabel(t)}</span>
            ))}
          </div>
        </DetailBlock>
      )}

      {entry.impact && (
        <>
          {entry.impact.body?.length > 0 && (
            <DetailBlock label="Body">{entry.impact.body.join(" · ")}</DetailBlock>
          )}
          {entry.impact.emotion?.length > 0 && (
            <DetailBlock label="Feeling">{entry.impact.emotion.join(" · ")}</DetailBlock>
          )}
          {entry.impact.mind?.length > 0 && (
            <DetailBlock label="Mind">{entry.impact.mind.join(" · ")}</DetailBlock>
          )}
        </>
      )}

      {entry.context && (entry.context.channel || entry.context.setting) && (
        <DetailBlock label="Context">
          {[entry.context.channel, entry.context.setting].filter(Boolean).join(" · ")}
        </DetailBlock>
      )}

      {entry.clarity && (
        <DetailBlock label="Clarity">
          {CLARITY_OPTIONS.find(c => c.id === entry.clarity)?.label || entry.clarity}
        </DetailBlock>
      )}

      <div style={{ marginTop: 32 }}>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              background: "transparent",
              border: `1px solid ${C.line}`,
              color: C.clay,
              borderRadius: 999,
              padding: "12px 18px",
              fontFamily: fontStack.body,
              fontSize: 14,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Trash2 size={14} /> Delete this entry
          </button>
        ) : (
          <div style={{
            background: C.cardWarm,
            border: `1px solid ${C.claySoft}`,
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{ fontSize: 14, marginBottom: 12, color: C.ink }}>
              Delete this entry? This can't be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  background: "transparent", border: `1px solid ${C.line}`,
                  borderRadius: 999, padding: "10px 16px",
                  fontFamily: fontStack.body, fontSize: 13, cursor: "pointer", color: C.ink,
                }}
              >Keep it</button>
              <button
                onClick={onDelete}
                style={{
                  background: C.clay, border: "none", color: C.card,
                  borderRadius: 999, padding: "10px 16px",
                  fontFamily: fontStack.body, fontSize: 13, cursor: "pointer",
                }}
              >Yes, delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailBlock({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.inkMuted,
        marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   TOOLKIT
// ╚═════════════════════════════════════════════════════════════════════════╝
function Toolkit({ openTool, go }) {
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginTop: 12, marginBottom: 4,
      }}>Right now</h1>
      <p style={{
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontSize: 15,
        color: C.inkSoft,
        marginBottom: 22,
        fontWeight: 300,
      }}>
        Whatever helps you breathe a little easier.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        <ToolRow icon={<Anchor size={18} />} title="5–4–3–2–1 grounding" sub="Find your way back into the room" onClick={() => openTool("54321")} />
        <ToolRow icon={<Wind size={18} />} title="Slow breathing" sub="Long exhales. Nothing fancy." onClick={() => openTool("breath")} />
        <ToolRow icon={<CircleDot size={18} />} title="Anchor note" sub="One thing you're sure of" onClick={() => openTool("anchor")} />
        <ToolRow icon={<Quote size={18} />} title="Self-validation" sub="A few short phrases" onClick={() => openTool("validation")} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <SectionLabel>Active survival</SectionLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        <ActiveDefenseCard onClick={() => go("active-defense")} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <SectionLabel>Phrases & resources</SectionLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ToolRow icon={<BookOpen size={18} />} title="De-escalation phrases" sub="Browseable phrasebook" onClick={() => go("phrasebook")} />
        <ToolRow icon={<Phone size={18} />} title="Resources" sub="Helplines and specialist support" onClick={() => go("resources")} />
      </div>
    </div>
  );
}

function ActiveDefenseCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="transition-all duration-200 hover:-translate-y-[1px]"
      style={{
        background: `linear-gradient(135deg, ${C.cardWarm} 0%, ${C.card} 100%)`,
        border: `1px solid ${C.sageDeep}`,
        borderRadius: 16,
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: fontStack.body,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent stripe */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: 4, background: C.sageDeep,
      }} />
      <div style={{ padding: "18px 18px 18px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: C.sageDeep,
            display: "grid", placeItems: "center",
            color: C.card,
            flexShrink: 0,
          }}><Shield size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: fontStack.display,
              fontSize: 19,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: C.ink,
              marginBottom: 4,
            }}>Active defense</div>
            <div style={{
              fontFamily: fontStack.display,
              fontStyle: "italic",
              fontSize: 14,
              color: C.sageDeep,
              marginBottom: 6,
              fontWeight: 300,
            }}>"Don't feed it."</div>
            <div style={{
              fontSize: 13, color: C.inkSoft, lineHeight: 1.5,
            }}>
              Paste what they said. Pick a stance. Get a reply that gives them nothing to work with.
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12,
            }}>
              {["Grey rock", "Yellow rock", "BIFF", "Buy time"].map(s => (
                <span key={s} style={{
                  fontSize: 11,
                  color: C.sageDeep,
                  background: C.sageSoft + "60",
                  padding: "3px 9px",
                  borderRadius: 999,
                  letterSpacing: "0.04em",
                }}>{s}</span>
              ))}
            </div>
          </div>
          <ChevronRight size={16} color={C.inkMuted} />
        </div>
      </div>
    </button>
  );
}

function ToolRow({ icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: fontStack.body,
        display: "flex", alignItems: "center", gap: 14,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: C.cardWarm,
        display: "grid", placeItems: "center",
        color: C.sageDeep,
        flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 17,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          color: C.ink,
        }}>{title}</div>
        <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>{sub}</div>
      </div>
      <ChevronRight size={16} color={C.inkMuted} />
    </button>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   ACTIVE DEFENSE — translate what they said into a tactical reply
// ╚═════════════════════════════════════════════════════════════════════════╝
function ActiveDefense({ onBack }) {
  const [stage, setStage] = useState("intro"); // intro | input | result
  const [input, setInput] = useState("");
  const [stance, setStance] = useState(null);
  const [copied, setCopied] = useState(null);

  const matched = useMemo(() => matchPattern(input), [input]);

  const stanceColor = (sId) => {
    const s = DEFENSE_STANCES.find(x => x.id === sId);
    if (!s) return C.sageDeep;
    if (s.color === "blue") return "#5A6F8A";
    if (s.color === "clay") return C.clay;
    return C.sageDeep;
  };

  const stanceSoft = (sId) => {
    const s = DEFENSE_STANCES.find(x => x.id === sId);
    if (!s) return C.sageSoft;
    if (s.color === "blue") return "#C8D2DD";
    if (s.color === "clay") return C.claySoft;
    return C.sageSoft;
  };

  const copy = (text) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  // ─── INTRO STAGE ───────────────────────────────────────────────────────
  if (stage === "intro") {
    return (
      <div style={{ padding: "8px 20px 32px" }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent", border: "none", padding: 0,
            color: C.inkSoft, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
            marginTop: 12, marginBottom: 16,
            fontFamily: fontStack.body,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: C.sageDeep, marginBottom: 10,
        }}>Active defense</div>

        <h1 style={{
          fontFamily: fontStack.display,
          fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em",
          color: C.ink, marginBottom: 10, lineHeight: 1.1,
        }}>Don't feed it.</h1>

        <p style={{
          fontFamily: fontStack.display,
          fontStyle: "italic",
          fontSize: 16, color: C.inkSoft, lineHeight: 1.5, marginBottom: 22,
          fontWeight: 300,
        }}>
          Paste what was said to you. Pick a stance. Get a reply that gives them nothing to work with.
        </p>

        <div style={{
          background: C.cardWarm,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 22,
          fontSize: 14, lineHeight: 1.55, color: C.ink,
        }}>
          <div style={{
            fontFamily: fontStack.display,
            fontStyle: "italic",
            color: C.sageDeep,
            marginBottom: 10,
          }}>The principle</div>
          <p style={{ marginBottom: 10, color: C.inkSoft, fontSize: 13 }}>
            High-conflict people run on emotional supply — your reactions, your justifications, your defences. Starve the supply, the dynamic loses its fuel.
          </p>
          <p style={{ color: C.inkSoft, fontSize: 13 }}>
            This tool isn't about winning. It's about protecting your nervous system and giving them no foothold.
          </p>
        </div>

        <SectionLabel sub="Pick a stance for now. You can change it later.">Choose your stance</SectionLabel>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {DEFENSE_STANCES.map(s => (
            <StanceCard
              key={s.id}
              stance={s}
              active={stance === s.id}
              onClick={() => setStance(s.id)}
              color={stanceColor(s.id)}
              soft={stanceSoft(s.id)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <GhostButton onClick={onBack}>Cancel</GhostButton>
          <div style={{ flex: 1 }} />
          <PrimaryButton
            onClick={() => setStage("input")}
            disabled={!stance}
          >Next</PrimaryButton>
        </div>

        <div style={{
          marginTop: 22,
          padding: 14,
          background: C.cardWarm,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 10,
          fontSize: 12,
          color: C.inkSoft,
          lineHeight: 1.55,
        }}>
          <strong style={{ color: C.ink, fontWeight: 500 }}>Use only if it feels safe. </strong>
          If someone is escalating to physical harm, threats with weapons, or restraining you, your safety comes first. Phrases are not safety plans.
        </div>
      </div>
    );
  }

  // ─── INPUT STAGE ───────────────────────────────────────────────────────
  if (stage === "input") {
    return (
      <div style={{ padding: "8px 20px 32px" }}>
        <button
          onClick={() => setStage("intro")}
          style={{
            background: "transparent", border: "none", padding: 0,
            color: C.inkSoft, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
            marginTop: 12, marginBottom: 16,
            fontFamily: fontStack.body,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: stanceColor(stance), marginBottom: 10,
        }}>Stance: {DEFENSE_STANCES.find(s => s.id === stance)?.label}</div>

        <h1 style={{
          fontFamily: fontStack.display,
          fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em",
          color: C.ink, marginBottom: 8,
        }}>What did they say?</h1>

        <p style={{
          fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18,
        }}>
          Paste it, type it, or paraphrase. As much or as little as you remember.
        </p>

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="They said..."
          rows={6}
          style={{
            width: "100%",
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: 16,
            fontFamily: fontStack.body,
            fontSize: 15,
            lineHeight: 1.55,
            color: C.ink,
            resize: "vertical",
            outline: "none",
            marginBottom: 12,
          }}
          autoFocus
        />

        {input.trim().length > 4 && matched && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              padding: 14,
              background: stanceSoft(stance) + "60",
              border: `1px solid ${stanceColor(stance)}40`,
              borderRadius: 12,
              fontSize: 13,
              color: C.ink,
              lineHeight: 1.5,
              marginBottom: 16,
              display: "flex", gap: 10, alignItems: "flex-start",
            }}
          >
            <Sparkles size={14} color={stanceColor(stance)} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{
                fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
                color: stanceColor(stance), fontWeight: 500, marginBottom: 4,
              }}>Looks like</div>
              <div style={{
                fontFamily: fontStack.display, fontStyle: "italic",
                fontSize: 16, color: C.ink, marginBottom: 4,
              }}>{matched.label}</div>
              <div style={{ color: C.inkSoft, fontSize: 13 }}>{matched.note}</div>
            </div>
          </motion.div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <GhostButton onClick={() => setStage("intro")}>Back</GhostButton>
          <div style={{ flex: 1 }} />
          <PrimaryButton
            onClick={() => setStage("result")}
            disabled={input.trim().length < 2}
          >Show me responses →</PrimaryButton>
        </div>

        <div style={{
          marginTop: 18,
          fontSize: 12,
          color: C.inkMuted,
          fontStyle: "italic",
          fontFamily: fontStack.display,
          textAlign: "center",
        }}>
          What you type here isn't saved.
        </div>
      </div>
    );
  }

  // ─── RESULT STAGE ──────────────────────────────────────────────────────
  const stanceObj = DEFENSE_STANCES.find(s => s.id === stance);
  const responses = matched?.responses[stance] || [];
  const sColor = stanceColor(stance);
  const sSoft = stanceSoft(stance);

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <button
        onClick={() => setStage("input")}
        style={{
          background: "transparent", border: "none", padding: 0,
          color: C.inkSoft, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          marginTop: 12, marginBottom: 16,
          fontFamily: fontStack.body,
        }}
      >
        <ArrowLeft size={14} /> Edit
      </button>

      {/* Pattern banner */}
      {matched && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
            color: sColor, marginBottom: 6,
          }}>Pattern · {stanceObj.label}</div>
          <h1 style={{
            fontFamily: fontStack.display,
            fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em",
            color: C.ink, marginBottom: 8, lineHeight: 1.15,
          }}>{matched.label}</h1>
          {matched.safetyFlag && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: 12,
              background: C.claySoft + "60",
              border: `1px solid ${C.clay}40`,
              borderRadius: 10,
              fontSize: 13, color: C.ink, lineHeight: 1.5,
              marginBottom: 12,
            }}>
              <AlertCircle size={14} color={C.clayDeep || C.clay} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong style={{ fontWeight: 500 }}>Safety check.</strong> If you're in physical danger, leave the conversation and reach out for support. Phrases don't override threat.
              </div>
            </div>
          )}
          <div style={{
            fontSize: 14, color: C.inkSoft, lineHeight: 1.55,
            fontStyle: "italic", fontFamily: fontStack.display,
          }}>{matched.note}</div>
        </div>
      )}

      {/* Their words echo */}
      <div style={{
        padding: 14,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 12,
        marginBottom: 22,
      }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
          color: C.inkMuted, marginBottom: 6,
        }}>They said</div>
        <div style={{
          fontFamily: fontStack.display, fontStyle: "italic",
          fontSize: 15, color: C.ink, lineHeight: 1.5,
        }}>"{input}"</div>
      </div>

      {/* Responses */}
      <SectionLabel sub="Tap to copy. Use whichever fits the moment.">Responses · {stanceObj.label}</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
        {responses.map((r, i) => (
          <button
            key={i}
            onClick={() => copy(r)}
            style={{
              background: C.card,
              border: `1px solid ${copied === r ? sColor : C.line}`,
              borderRadius: 12,
              padding: "16px 18px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: fontStack.body,
              display: "flex", alignItems: "center", gap: 12,
              transition: "all 0.2s",
            }}
          >
            <div style={{
              flex: 1,
              fontFamily: fontStack.display,
              fontSize: 16,
              fontStyle: "italic",
              color: C.ink,
              lineHeight: 1.5,
            }}>"{r}"</div>
            <div style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: copied === r ? sColor : C.inkMuted,
              fontWeight: 500,
              flexShrink: 0,
            }}>{copied === r ? "Copied" : "Copy"}</div>
          </button>
        ))}
      </div>

      {/* JADE warning */}
      <div style={{
        padding: 16,
        background: C.card,
        border: `1px dashed ${C.line}`,
        borderRadius: 12,
        marginBottom: 22,
      }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
          color: C.clay, fontWeight: 500, marginBottom: 8,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <AlertCircle size={12} /> Don't take the bait
        </div>
        <div style={{
          fontFamily: fontStack.display, fontStyle: "italic",
          fontSize: 16, color: C.ink, marginBottom: 10, fontWeight: 400,
        }}>
          Don't J.A.D.E.
        </div>
        <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
          The instinct to <strong style={{ color: C.ink, fontWeight: 500 }}>Justify, Argue, Defend, or Explain</strong> is strong — and it's the supply they want. Each one feeds the cycle.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {JADE_TRAPS.map(t => (
            <div key={t.type} style={{
              fontSize: 12, color: C.inkMuted, lineHeight: 1.5,
              display: "flex", gap: 8,
            }}>
              <span style={{ color: C.clay, fontWeight: 500, minWidth: 60 }}>{t.type}:</span>
              <span style={{ fontStyle: "italic" }}>"{t.example}"</span>
            </div>
          ))}
        </div>
      </div>

      {/* Try a different stance */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel sub="Try a different stance for the same message.">Switch stance</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DEFENSE_STANCES.filter(s => s.id !== stance).map(s => (
            <button
              key={s.id}
              onClick={() => setStance(s.id)}
              style={{
                background: C.card,
                border: `1px solid ${C.line}`,
                borderRadius: 999,
                padding: "10px 16px",
                fontSize: 13,
                fontFamily: fontStack.body,
                color: C.ink,
                cursor: "pointer",
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <GhostButton onClick={() => { setInput(""); setStage("intro"); }}>Start over</GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={onBack}>Done</PrimaryButton>
      </div>

      <div style={{
        marginTop: 18,
        fontSize: 12,
        color: C.inkMuted,
        fontStyle: "italic",
        fontFamily: fontStack.display,
        textAlign: "center",
      }}>
        Nothing here is saved to your timeline.
      </div>
    </div>
  );
}

function StanceCard({ stance, active, onClick, color, soft }) {
  return (
    <button
      onClick={onClick}
      className="transition-all duration-200"
      style={{
        background: active ? soft + "70" : C.card,
        border: `1px solid ${active ? color : C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: fontStack.body,
        display: "flex", alignItems: "flex-start", gap: 14,
      }}
    >
      <div style={{
        width: 4, alignSelf: "stretch",
        background: active ? color : C.line,
        borderRadius: 2,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
        }}>
          <div style={{
            fontFamily: fontStack.display,
            fontSize: 18,
            fontWeight: 400,
            color: C.ink,
            letterSpacing: "-0.01em",
          }}>{stance.label}</div>
          {active && <Check size={14} color={color} />}
        </div>
        <div style={{
          fontFamily: fontStack.display, fontStyle: "italic",
          fontSize: 14, color: C.inkSoft, marginBottom: 6, fontWeight: 300,
        }}>{stance.sub}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>{stance.when}</div>
      </div>
    </button>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   PHRASEBOOK
// ╚═════════════════════════════════════════════════════════════════════════╝
function Phrasebook({ onBack }) {
  const [copied, setCopied] = useState(null);
  const [open, setOpen] = useState(Object.keys(PHRASES)[0]);
  const copy = (text) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent", border: "none", padding: 0,
          color: C.inkSoft, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          marginTop: 12, marginBottom: 16,
          fontFamily: fontStack.body,
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 6,
      }}>De-escalation phrases</h1>
      <p style={{
        fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14,
      }}>
        Optional. Use only if it feels safe — these are about lowering immediate intensity, not "winning". Tap to copy.
      </p>
      <div style={{
        padding: 14,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 10,
        fontSize: 13,
        color: C.inkSoft,
        lineHeight: 1.5,
        marginBottom: 22,
      }}>
        If someone is escalating to harm — physical, weapons, threats — your safety comes first. Phrases are not safety plans.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(PHRASES).map(([cat, list]) => (
          <div key={cat} style={{
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
            overflow: "hidden",
          }}>
            <button
              onClick={() => setOpen(open === cat ? null : cat)}
              style={{
                width: "100%", background: "transparent", border: "none",
                padding: 16, textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontFamily: fontStack.body, color: C.ink,
              }}
            >
              <span style={{
                fontFamily: fontStack.display,
                fontSize: 17, fontWeight: 400, letterSpacing: "-0.01em",
              }}>{cat}</span>
              <ChevronDown size={16} color={C.inkMuted} style={{
                transform: open === cat ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }} />
            </button>
            <AnimatePresence initial={false}>
              {open === cat && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {list.map((phrase, i) => (
                      <button
                        key={i}
                        onClick={() => copy(phrase)}
                        style={{
                          background: C.cardWarm,
                          border: `1px solid ${C.lineSoft}`,
                          borderRadius: 10,
                          padding: 12,
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: fontStack.body,
                          fontSize: 14,
                          color: C.ink,
                          lineHeight: 1.45,
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        }}
                      >
                        <span style={{ flex: 1 }}>{phrase}</span>
                        <span style={{
                          fontSize: 11, color: copied === phrase ? C.sageDeep : C.inkMuted,
                          letterSpacing: "0.06em", textTransform: "uppercase",
                        }}>{copied === phrase ? "Copied" : "Copy"}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   RESOURCES
// ╚═════════════════════════════════════════════════════════════════════════╝
function Resources({ onBack }) {
  const items = [
    { name: "National Domestic Abuse Helpline (UK)", phone: "0808 2000 247", note: "24hr, free, confidential" },
    { name: "Men's Advice Line (UK)", phone: "0808 8010 327" },
    { name: "Galop — LGBTQ+ domestic abuse (UK)", phone: "0800 999 5428" },
    { name: "Refuge", note: "refuge.org.uk — live chat available" },
    { name: "Bright Sky", note: "Free safety app with disguise mode" },
    { name: "Emergency", phone: "999", note: "If in immediate danger. Silent call: press 55 when prompted." },
  ];

  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent", border: "none", padding: 0,
          color: C.inkSoft, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          marginTop: 12, marginBottom: 16,
          fontFamily: fontStack.body,
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 6,
      }}>Resources</h1>
      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 22 }}>
        These are people qualified to help. They're not me, and that's a good thing.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((r, i) => (
          <div key={i} style={{
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{
              fontFamily: fontStack.display,
              fontSize: 16,
              fontWeight: 400,
              color: C.ink,
              letterSpacing: "-0.01em",
            }}>{r.name}</div>
            {r.phone && (
              <div style={{
                fontFamily: fontStack.display,
                fontStyle: "italic",
                fontSize: 16,
                color: C.sageDeep,
                marginTop: 4,
              }}>{r.phone}</div>
            )}
            {r.note && (
              <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>{r.note}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 24,
        padding: 16,
        background: C.cardWarm,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 12,
        fontSize: 13,
        color: C.inkSoft,
        lineHeight: 1.55,
      }}>
        <strong style={{ color: C.ink, fontWeight: 500 }}>A note on tech safety: </strong>
        if you suspect your device is being monitored, calling these numbers from your own device may not be private. A trusted friend's phone, a public phone, or a library computer can sometimes be safer.
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   LOG PICKER (alt entry from bottom nav)
// ╚═════════════════════════════════════════════════════════════════════════╝
function LogPicker({ go }) {
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginTop: 12, marginBottom: 6,
      }}>What kind of note?</h1>
      <p style={{
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontSize: 15,
        color: C.inkSoft,
        marginBottom: 22, fontWeight: 300,
      }}>
        Pick what fits where you are right now.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ModeCard title="Quick log" sub="A few taps. Around 30 seconds." time="~30s" onClick={() => go("quick")} />
        <ModeCard title="Guided check-in" sub="When something feels off and you're not sure what." time="2–4 min" onClick={() => go("guided")} />
        <ModeCard title="Drop a fragment" sub="Words, images, body sensations. No need to explain." time="under a minute" onClick={() => go("fragment")} />
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   SETTINGS
// ╚═════════════════════════════════════════════════════════════════════════╝
function SettingsView({ onBack, onClearSamples, hasSamples, confirmClear, setConfirmClear, clearAll }) {
  return (
    <div style={{ padding: "8px 20px 32px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent", border: "none", padding: 0,
          color: C.inkSoft, fontSize: 13, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          marginTop: 12, marginBottom: 16,
          fontFamily: fontStack.body,
        }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 22,
      }}>Settings</h1>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>About this prototype</SectionLabel>
        <div style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: 16,
          fontSize: 14, lineHeight: 1.55, color: C.ink,
        }}>
          This is an interactive prototype for testing flow and feel. Data lives in this session only and clears when you refresh. A real version would store everything locally on your device, encrypted.
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Sample data</SectionLabel>
        {hasSamples ? (
          <button
            onClick={onClearSamples}
            style={{
              width: "100%",
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: 16,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: fontStack.body,
              color: C.ink,
              fontSize: 14,
            }}
          >
            Clear sample entries
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
              Removes the seeded examples so you can try it empty.
            </div>
          </button>
        ) : (
          <div style={{
            background: C.cardWarm,
            border: `1px solid ${C.lineSoft}`,
            borderRadius: 12,
            padding: 16,
            fontSize: 13, color: C.inkSoft,
          }}>
            Sample entries already cleared.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>All data</SectionLabel>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            style={{
              width: "100%",
              background: "transparent",
              border: `1px solid ${C.claySoft}`,
              borderRadius: 12,
              padding: 16,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: fontStack.body,
              color: C.clay,
              fontSize: 14,
            }}
          >
            Clear all entries
          </button>
        ) : (
          <div style={{
            background: C.cardWarm,
            border: `1px solid ${C.claySoft}`,
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{ fontSize: 14, marginBottom: 12, color: C.ink }}>
              Delete every entry? This can't be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{
                  background: "transparent", border: `1px solid ${C.line}`,
                  borderRadius: 999, padding: "10px 16px",
                  fontFamily: fontStack.body, fontSize: 13, cursor: "pointer", color: C.ink,
                }}
              >Cancel</button>
              <button
                onClick={clearAll}
                style={{
                  background: C.clay, border: "none", color: C.card,
                  borderRadius: 999, padding: "10px 16px",
                  fontFamily: fontStack.body, fontSize: 13, cursor: "pointer",
                }}
              >Yes, clear all</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Quick exit — what it does</SectionLabel>
        <div style={{
          background: C.cardWarm,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 12,
          padding: 16,
          fontSize: 13, lineHeight: 1.55, color: C.inkSoft,
        }}>
          Tapping <em>Quick exit</em> at the top instantly switches to a neutral weather screen. It helps if someone walks in. It does <strong>not</strong> protect against monitoring software, shared accounts, or screen recording. A real version would also include a discreet app icon and name option.
        </div>
      </div>

      <div>
        <SectionLabel>The point of all this</SectionLabel>
        <div style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: 16,
          fontSize: 14, lineHeight: 1.55, color: C.ink,
          fontFamily: fontStack.display,
          fontStyle: "italic",
        }}>
          To help you trust your own noticing — without telling you what to think, who they are, or what to do.
        </div>
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   BOTTOM NAV
// ╚═════════════════════════════════════════════════════════════════════════╝
function BottomNav({ view, setView }) {
  const items = [
    { id: "home", icon: <HomeIcon size={18} />, label: "Home" },
    { id: "log-picker", icon: <Pencil size={18} />, label: "Log" },
    { id: "patterns", icon: <BarChart3 size={18} />, label: "Patterns" },
    { id: "toolkit", icon: <HeartHandshake size={18} />, label: "Toolkit" },
  ];

  const activeMap = {
    "log-picker": "log-picker",
    "quick": "log-picker",
    "guided": "log-picker",
    "fragment": "log-picker",
    "phrasebook": "toolkit",
    "active-defense": "toolkit",
    "resources": "toolkit",
    "entry-detail": "patterns",
  };

  const active = activeMap[view] || view;

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      background: C.card,
      borderTop: `1px solid ${C.line}`,
      padding: "10px 20px 20px",
      zIndex: 5,
    }}>
      <div style={{
        maxWidth: 480, margin: "0 auto",
        display: "flex", justifyContent: "space-around", alignItems: "center",
      }}>
        {items.map(it => (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            style={{
              background: "transparent", border: "none", padding: "6px 10px",
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4,
              color: active === it.id ? C.sageDeep : C.inkMuted,
              fontFamily: fontStack.body,
            }}
          >
            {it.icon}
            <div style={{
              fontSize: 11,
              letterSpacing: "0.04em",
              fontWeight: active === it.id ? 500 : 400,
            }}>{it.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   FLOATING GROUNDING BUTTON
// ╚═════════════════════════════════════════════════════════════════════════╝
function FloatingGroundingBtn({ open }) {
  return (
    <button
      onClick={open}
      style={{
        position: "fixed",
        bottom: 92, right: 20,
        width: 50, height: 50,
        borderRadius: 999,
        background: C.sageDeep,
        color: C.card,
        border: "none",
        boxShadow: "0 4px 14px rgba(31,37,48,0.18)",
        cursor: "pointer",
        display: "grid", placeItems: "center",
        zIndex: 4,
      }}
      aria-label="Right now toolkit"
      title="Right now"
    >
      <Waves size={20} />
    </button>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   GROUNDING MODAL
// ╚═════════════════════════════════════════════════════════════════════════╝
function GroundingModal({ tool, setTool, close }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(31,37,48,0.4)",
        zIndex: 50,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={close}
    >
      <motion.div
        initial={{ y: 60 }}
        animate={{ y: 0 }}
        exit={{ y: 60 }}
        transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg,
          width: "100%", maxWidth: 480,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: "16px 20px 32px",
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: fontStack.body,
        }}
      >
        <div style={{
          width: 40, height: 4, background: C.line,
          borderRadius: 2, margin: "0 auto 18px",
        }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          {tool && (
            <button
              onClick={() => setTool(null)}
              style={{
                background: "transparent", border: "none", padding: 0,
                color: C.inkSoft, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
                fontFamily: fontStack.body,
              }}
            ><ArrowLeft size={14} /> Back</button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={close}
            style={{
              background: "transparent", border: "none", padding: 6,
              color: C.inkSoft, cursor: "pointer",
            }}
          ><X size={18} /></button>
        </div>

        {!tool && <GroundingMenu pick={setTool} />}
        {tool === "54321" && <Grounding54321 />}
        {tool === "breath" && <BreathTool />}
        {tool === "anchor" && <AnchorNote />}
        {tool === "validation" && <ValidationCarousel />}
      </motion.div>
    </motion.div>
  );
}

function GroundingMenu({ pick }) {
  return (
    <div>
      <h2 style={{
        fontFamily: fontStack.display,
        fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 4,
      }}>Right now</h2>
      <p style={{
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontSize: 14, color: C.inkSoft, marginBottom: 22, fontWeight: 300,
      }}>
        Pick whatever feels closest.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ToolRow icon={<Anchor size={18} />} title="5–4–3–2–1 grounding" sub="Find your way back into the room" onClick={() => pick("54321")} />
        <ToolRow icon={<Wind size={18} />} title="Slow breathing" sub="Long exhales. Nothing fancy." onClick={() => pick("breath")} />
        <ToolRow icon={<CircleDot size={18} />} title="Anchor note" sub="One thing you're sure of" onClick={() => pick("anchor")} />
        <ToolRow icon={<Quote size={18} />} title="Self-validation" sub="A few short phrases" onClick={() => pick("validation")} />
      </div>
    </div>
  );
}

function Grounding54321() {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState(GROUNDING_54321.map(() => []));
  const cur = GROUNDING_54321[step];

  if (step >= GROUNDING_54321.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{
          fontFamily: fontStack.display,
          fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em",
          color: C.ink, marginBottom: 8,
        }}>You're here.</div>
        <div style={{
          fontFamily: fontStack.display,
          fontStyle: "italic",
          fontSize: 16, color: C.inkSoft, fontWeight: 300,
        }}>
          That's enough.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontFamily: fontStack.body,
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.sageDeep,
        marginBottom: 10,
      }}>{step + 1} of {GROUNDING_54321.length}</div>
      <h2 style={{
        fontFamily: fontStack.display,
        fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 8,
      }}>
        <span style={{ color: C.sageDeep, fontStyle: "italic" }}>{cur.verb}.</span><br />
        <span style={{ fontSize: 22, color: C.inkSoft }}>Name {cur.count} {cur.sense}.</span>
      </h2>
      <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 18 }}>
        Tap each one once you've found it. Or skip — being here counts too.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {Array.from({ length: cur.count }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              const copy = [...items];
              copy[step] = [...copy[step], i];
              setItems(copy);
            }}
            disabled={items[step].includes(i)}
            style={{
              width: 56, height: 56,
              borderRadius: 12,
              background: items[step].includes(i) ? C.sageDeep : C.card,
              border: `1px solid ${items[step].includes(i) ? C.sageDeep : C.line}`,
              color: items[step].includes(i) ? C.card : C.ink,
              fontFamily: fontStack.display,
              fontSize: 22,
              cursor: items[step].includes(i) ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {items[step].includes(i) ? <Check size={20} /> : i + 1}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <GhostButton onClick={() => setStep(s => s + 1)}>Skip step</GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={() => setStep(s => s + 1)}>Next</PrimaryButton>
      </div>
    </div>
  );
}

function BreathTool() {
  const [phase, setPhase] = useState("ready"); // ready | inhale | hold | exhale
  const [count, setCount] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (phase === "ready") return;
    const cycle = ["inhale", "inhale", "inhale", "inhale", "hold", "hold", "exhale", "exhale", "exhale", "exhale", "exhale", "exhale"];
    intervalRef.current = setInterval(() => {
      setCount(c => {
        const next = (c + 1) % cycle.length;
        setPhase(cycle[next]);
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [phase === "ready"]);

  const start = () => { setPhase("inhale"); setCount(0); };
  const stop = () => { setPhase("ready"); setCount(0); clearInterval(intervalRef.current); };

  const phaseLabel = phase === "ready" ? "Ready when you are"
    : phase === "inhale" ? "Breathe in"
    : phase === "hold" ? "Hold"
    : "Breathe out, slowly";

  const scale = phase === "inhale" ? 1.5 : phase === "hold" ? 1.5 : phase === "exhale" ? 1 : 1;

  return (
    <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
      <div style={{
        fontFamily: fontStack.display,
        fontSize: 24, fontWeight: 400, color: C.ink,
        letterSpacing: "-0.02em", marginBottom: 4,
      }}>Slow breathing</div>
      <div style={{
        fontFamily: fontStack.display,
        fontStyle: "italic",
        fontSize: 14, color: C.inkSoft, fontWeight: 300, marginBottom: 32,
      }}>4 in, 2 hold, 6 out</div>

      <div style={{
        display: "grid", placeItems: "center", height: 220, marginBottom: 24,
      }}>
        <motion.div
          animate={{ scale }}
          transition={{ duration: phase === "exhale" ? 6 : phase === "inhale" ? 4 : 2, ease: "easeInOut" }}
          style={{
            width: 120, height: 120,
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, ${C.sageSoft}, ${C.sage})`,
            boxShadow: `0 0 0 8px ${C.sageSoft}40`,
          }}
        />
      </div>

      <div style={{
        fontFamily: fontStack.display,
        fontSize: 22,
        color: C.sageDeep,
        fontWeight: 300,
        letterSpacing: "-0.01em",
        marginBottom: 28,
      }}>{phaseLabel}</div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {phase === "ready" ? (
          <PrimaryButton onClick={start}>Begin</PrimaryButton>
        ) : (
          <GhostButton onClick={stop}>Stop</GhostButton>
        )}
      </div>
    </div>
  );
}

function AnchorNote() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <h2 style={{
        fontFamily: fontStack.display,
        fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 6,
      }}>Anchor note</h2>
      <p style={{
        fontSize: 14, color: C.inkSoft, lineHeight: 1.5, marginBottom: 18,
      }}>
        One thing you're sure of right now. A fact. A name. A weight in your hand. Anything.
      </p>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false); }}
        placeholder="What I'm sure of right now is..."
        rows={4}
        style={{
          width: "100%",
          background: C.card, border: `1px solid ${C.line}`,
          borderRadius: 12, padding: 14,
          fontFamily: fontStack.display, fontStyle: "italic",
          fontSize: 16, lineHeight: 1.55, color: C.ink,
          resize: "vertical", outline: "none",
          marginBottom: 14,
        }}
        autoFocus
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PrimaryButton onClick={() => setSaved(true)} disabled={!text.trim()}>
          {saved ? "Held" : "Hold this"}
        </PrimaryButton>
        {saved && (
          <div style={{
            fontFamily: fontStack.display,
            fontStyle: "italic",
            fontSize: 14, color: C.sageDeep,
          }}>okay.</div>
        )}
      </div>
      <div style={{
        marginTop: 16,
        fontSize: 12,
        color: C.inkMuted,
        fontFamily: fontStack.display,
        fontStyle: "italic",
      }}>
        Anchor notes don't get saved to your timeline. They're just for now.
      </div>
    </div>
  );
}

function ValidationCarousel() {
  const [i, setI] = useState(0);
  return (
    <div>
      <h2 style={{
        fontFamily: fontStack.display,
        fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em",
        color: C.ink, marginBottom: 22,
      }}>A few short phrases</h2>

      <div style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: "40px 24px",
        textAlign: "center",
        minHeight: 180,
        display: "grid", placeItems: "center",
        marginBottom: 18,
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{
              fontFamily: fontStack.display,
              fontSize: 22, fontWeight: 400,
              fontStyle: "italic",
              color: C.ink,
              lineHeight: 1.4,
              letterSpacing: "-0.01em",
            }}
          >
            {VALIDATION_PHRASES[i]}
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
        {VALIDATION_PHRASES.map((_, idx) => (
          <div key={idx} style={{
            width: 6, height: 6, borderRadius: 999,
            background: idx === i ? C.sageDeep : C.line,
            transition: "background 0.2s",
          }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <GhostButton onClick={() => setI(p => (p - 1 + VALIDATION_PHRASES.length) % VALIDATION_PHRASES.length)}>
          ←
        </GhostButton>
        <div style={{ flex: 1 }} />
        <PrimaryButton onClick={() => setI(p => (p + 1) % VALIDATION_PHRASES.length)}>
          Next →
        </PrimaryButton>
      </div>
    </div>
  );
}

// ╔═════════════════════════════════════════════════════════════════════════╗
//   QUICK EXIT DECOY — fake weather screen
// ╚═════════════════════════════════════════════════════════════════════════╝
function ExitDecoy({ onReturn }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #B5C9D9 0%, #DCE6E8 100%)",
      fontFamily: "system-ui, sans-serif",
      color: "#1F2937",
      padding: 0,
      position: "relative",
    }}>
      <div style={{ padding: "60px 24px 24px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{
          fontSize: 13,
          color: "#475569",
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}>London · Tuesday</div>
        <div style={{
          fontSize: 76,
          fontWeight: 200,
          color: "#1F2937",
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}>14°</div>
        <div style={{ fontSize: 18, color: "#334155", marginTop: 8 }}>Partly cloudy</div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
          {[
            { day: "Now", temp: "14°", icon: <CloudSun size={22} /> },
            { day: "10", temp: "15°", icon: <CloudSun size={22} /> },
            { day: "11", temp: "15°", icon: <Cloud size={22} /> },
            { day: "12", temp: "14°", icon: <Cloud size={22} /> },
            { day: "13", temp: "13°", icon: <Cloud size={22} /> },
          ].map((h, i) => (
            <div key={i} style={{ textAlign: "center", color: "#334155" }}>
              <div style={{ fontSize: 12, marginBottom: 8 }}>{h.day}</div>
              <div style={{ marginBottom: 8, color: "#475569" }}>{h.icon}</div>
              <div style={{ fontSize: 14 }}>{h.temp}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 32,
          background: "rgba(255,255,255,0.4)",
          borderRadius: 14,
          padding: 18,
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            10-Day Forecast
          </div>
          {["Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} style={{
              display: "flex", justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              fontSize: 14, color: "#334155",
            }}>
              <span>{d}</span>
              <Cloud size={18} color="#64748B" />
              <span>13° / 8°</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onReturn}
        style={{
          position: "fixed",
          bottom: 24, right: 24,
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 999,
          padding: "10px 16px",
          fontSize: 12,
          color: "#475569",
          cursor: "pointer",
          fontFamily: "system-ui",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        ↩ return to app
      </button>
    </div>
  );
}
