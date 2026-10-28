
import { useState } from "react";
import {
  Bot,
  Send,
  ShieldCheck,
  WifiOff,
  User,
  Trash2,
} from "lucide-react";

const KNOWLEDGE_BASE = [
  {
    keywords: ["flood", "flooding", "water rising", "inundation"],
    title: "Flood safety",
    answer:
      "FLOOD SAFETY\n\n• Move to higher ground if flooding threatens your area.\n• Never walk, swim, or drive through floodwater.\n• Follow evacuation instructions from local authorities.\n• Keep drinking water, essential medicines, a torch, and important documents ready.\n• Avoid electrical equipment in flooded areas.\n\nIf you are in immediate danger, contact your local emergency services.",
  },
  {
    keywords: ["cyclone", "storm", "strong wind", "hurricane"],
    title: "Cyclone preparedness",
    answer:
      "CYCLONE PREPAREDNESS\n\n• Follow official weather warnings and evacuation instructions.\n• Secure loose outdoor objects before conditions deteriorate, if it is safe to do so.\n• Prepare drinking water, food, medicines, a torch, batteries, and a power bank.\n• Stay indoors away from windows during dangerous winds.\n• Use an authorised cyclone shelter if instructed.\n\nThis offline assistant cannot provide live cyclone tracking or current warnings.",
  },
  {
    keywords: ["earthquake", "tremor", "shaking"],
    title: "Earthquake safety",
    answer:
      "EARTHQUAKE SAFETY\n\nDuring shaking:\n• Drop, Cover, and Hold On.\n• Protect your head and neck.\n• Stay away from windows and heavy objects.\n• If indoors, do not rush outside while the building is shaking.\n\nAfter shaking stops, check for immediate hazards and follow official instructions. Do not enter visibly damaged buildings.",
  },
  {
    keywords: ["fire", "smoke", "burning building"],
    title: "Fire safety",
    answer:
      "FIRE SAFETY\n\n• Leave the dangerous area immediately if you can do so safely.\n• Raise the alarm and contact emergency services.\n• Stay low if smoke is present and use a safe exit.\n• Never use an elevator during a building fire.\n• Do not re-enter a burning or damaged building.\n\nDo not attempt to fight a large or spreading fire yourself.",
  },
  {
    keywords: ["landslide", "mudslide", "hill collapse"],
    title: "Landslide safety",
    answer:
      "LANDSLIDE SAFETY\n\n• Watch for official warnings during prolonged or heavy rain.\n• Move away from a suspected landslide path if you can do so safely.\n• Avoid unstable slopes, cracks in the ground, and damaged roads.\n• Follow evacuation instructions from local authorities.\n• Report visible hazards to the appropriate emergency team.",
  },
  {
    keywords: ["emergency kit", "emergency bag", "go bag", "supplies"],
    title: "Emergency kit",
    answer:
      "EMERGENCY KIT CHECKLIST\n\n• Drinking water and non-perishable food.\n• Essential medicines and a first-aid kit.\n• Torch, spare batteries, and a charged power bank.\n• Copies of important documents in waterproof packaging.\n• Hygiene supplies, a whistle, and suitable clothing.\n• Emergency contacts written on paper.\n\nAdapt the kit to your household's needs and official local guidance.",
  },
  {
    keywords: ["agriculture", "farm", "crop", "paddy", "farmland", "farming"],
    title: "Agricultural impact",
    answer:
      "AGRICULTURAL IMPACT REPORTING\n\n• Record the village or affected area.\n• Identify the crop and estimate the affected area in hectares.\n• Describe visible impacts, such as waterlogging or crop lodging.\n• Select the affected location on the ResQBridge satellite map when available.\n• Keep photographs and records if it is safe to collect them.\n• Report urgent needs to the relevant local agriculture or disaster-response authority.\n\nCommunity estimates are not the same as verified crop-loss measurements.",
  },
  {
    keywords: ["report disaster", "submit report", "report incident", "help request"],
    title: "Reporting an incident",
    answer:
      "HOW TO REPORT AN INCIDENT\n\n1. Open Disaster Reports in ResQBridge AI.\n2. Enter the incident location and disaster type.\n3. Describe the situation and immediate needs.\n4. Select an appropriate severity based on the information available.\n5. Submit the report and monitor its review status.\n\nSubmitting a report through this prototype does not guarantee that emergency services have received it.",
  },
  {
    keywords: ["offline", "no internet", "no network", "without internet"],
    title: "Offline assistance",
    answer:
      "OFFLINE ASSISTANCE\n\nThis version answers from its built-in disaster knowledge base without contacting an online AI service.\n\nIt cannot access live weather, current alerts, updated maps, or newly submitted database records while offline. Those features may require connectivity.\n\nFollow official emergency instructions and use locally available emergency contacts.",
  },
];

const QUICK_QUESTIONS = [
  "How do I prepare for a flood?",
  "What should an emergency kit contain?",
  "How do I report crop damage?",
  "Can you provide live disaster alerts?",
];

function findAnswer(question) {
  const normalized = question.toLowerCase();

  const matches = KNOWLEDGE_BASE.map((item) => ({
    ...item,
    score: item.keywords.reduce(
      (score, keyword) =>
        score + (normalized.includes(keyword) ? keyword.length : 0),
      0
    ),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    return matches[0].answer;
  }

  return (
    "I couldn't find a matching topic in my offline knowledge base yet.\n\n" +
    "Try asking about floods, cyclones, earthquakes, fires, landslides, " +
    "emergency kits, agricultural impact, or reporting an incident.\n\n" +
    "This version works without an online AI service, so its answers are limited " +
    "to the information stored in the application."
  );
}

export default function DisasterAssistant() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text:
        "Hello! I'm the ResQBridge Disaster Assistant.\n\n" +
        "I can answer common disaster-preparedness questions offline. " +
        "Choose a suggested question or type your own.",
    },
  ]);

  const [input, setInput] = useState("");

  function sendMessage(text = input) {
    const question = text.trim();

    if (!question) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      text: question,
    };

    const reply = {
      id: Date.now() + 1,
      role: "assistant",
      text: findAnswer(question),
    };

    setMessages((previous) => [...previous, userMessage, reply]);
    setInput("");
  }

  function clearChat() {
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        text: "Chat cleared. Ask me a disaster-preparedness question.",
      },
    ]);
  }

  return (
    <main className="disaster-assistant-page">
      <header className="assistant-header">
        <div className="assistant-title-icon">
          <Bot size={30} />
        </div>

        <div className="assistant-heading">
          <p className="eyebrow">OFFLINE DISASTER SUPPORT</p>
          <h2>Disaster Assistant</h2>
          <p>Preparedness guidance, even without internet access.</p>
        </div>

        <div className="assistant-status">
          <WifiOff size={16} />
          Offline knowledge
        </div>
      </header>

      <div className="assistant-safety-note" role="note">
        <ShieldCheck size={20} />
        <div>
          <strong>Safety first</strong>
          <p>
            This assistant provides general guidance, not live emergency
            alerts or verified local conditions. Follow official instructions.
          </p>
        </div>
      </div>

      <section
        className="assistant-chat"
        aria-label="Disaster assistant conversation"
      >
        <div className="assistant-chat-toolbar">
          <span>Conversation</span>
          <button
            type="button"
            className="assistant-clear-button"
            onClick={clearChat}
          >
            <Trash2 size={15} />
            Clear chat
          </button>
        </div>

        <div className="assistant-messages" aria-live="polite">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`assistant-message assistant-message-${message.role}`}
            >
              <div className="assistant-message-avatar">
                {message.role === "assistant" ? (
                  <Bot size={18} />
                ) : (
                  <User size={18} />
                )}
              </div>

              <div className="assistant-message-content">
                <strong>
                  {message.role === "assistant" ? "ResQBridge AI" : "You"}
                </strong>
                <p>{message.text}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="assistant-quick-questions">
          <span>Try asking</span>
          <div>
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => sendMessage(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <form
          className="assistant-input-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about disaster preparedness..."
            aria-label="Your question"
            autoComplete="off"
          />

          <button type="submit" disabled={!input.trim()}>
            <Send size={18} />
            <span>Send</span>
          </button>
        </form>

        <p className="assistant-local-note">
          Responses use a built-in knowledge base. No remote AI request is made.
        </p>
      </section>
    </main>
  );
}