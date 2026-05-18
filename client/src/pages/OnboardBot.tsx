import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, Send, Bot, User, CheckCircle2, AlertCircle, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  loading?: boolean;
}

interface ScrapeData {
  companyName?: string;
  phone?: string;
  tradeType?: string;
  services?: string[];
  pricing?: string[];
  hours?: string;
  city?: string;
  state?: string;
  faqs?: string[];
}

type Stage =
  | "validating"        // token check on load
  | "invalid_token"     // bad/expired token
  | "greeting"          // initial greeting, asking for URL
  | "scraping"          // URL submitted, scraping in background
  | "confirm_scrape"    // showing scrape results, asking confirm/correct
  | "gap_fill"          // asking for missing fields one at a time
  | "ai_name"           // asking what to call the AI receptionist
  | "ai_greeting"       // asking for custom greeting (or use default)
  | "confirm_launch"    // final review before building
  | "building"          // provisioning Telnyx assistant
  | "done"              // success!
  | "error";            // unexpected error

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function botMsg(text: string, loading = false): Message {
  return { id: makeId(), role: "bot", text, loading };
}

function userMsg(text: string): Message {
  return { id: makeId(), role: "user", text };
}

const REQUIRED_FIELDS: Array<{ key: keyof ScrapeData; label: string; question: string }> = [
  {
    key: "companyName",
    label: "Company Name",
    question: "What's the full name of your company?",
  },
  {
    key: "phone",
    label: "Phone Number",
    question: "What phone number should the AI give callers when they ask for a callback?",
  },
  {
    key: "tradeType",
    label: "Trade / Service Type",
    question: "What trade does your company specialize in? (e.g. HVAC, Plumbing, Roofing, Electrical, etc.)",
  },
  {
    key: "city",
    label: "City",
    question: "What city is your business based in?",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardBot() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();

  const [stage, setStage] = useState<Stage>("validating");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Tenant data
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  // Scrape / collected data
  const [scrapeData, setScrapeData] = useState<ScrapeData>({});
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pendingGapFields, setPendingGapFields] = useState<typeof REQUIRED_FIELDS>([]);
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [finalData, setFinalData] = useState<ScrapeData>({});
  const [aiName, setAiName] = useState("");
  const [aiGreeting, setAiGreeting] = useState("");
  const [assistantId, setAssistantId] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Token validation on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStage("invalid_token");
      return;
    }
    fetch(`/api/onboard/${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (!data.ok) {
          setStage("invalid_token");
          return;
        }
        setTenantId(data.tenantId);
        setCompanyName(data.companyName || "");
        setEmail(data.email || "");
        setStage("greeting");
      })
      .catch(() => setStage("invalid_token"));
  }, [token]);

  // ── Start conversation when stage hits "greeting" ──────────────────────────
  useEffect(() => {
    if (stage !== "greeting") return;
    const name = companyName ? ` for ${companyName}` : "";
    pushBot(
      `Hi! I'm here to set up your AI phone receptionist${name}. 🎉\n\nThis only takes a couple of minutes. To get started, what's your company website URL? I'll scan it to pre-fill your setup automatically.`
    );
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [stage]);

  // ─── Message helpers ───────────────────────────────────────────────────────

  function pushBot(text: string) {
    setMessages(prev => [...prev, botMsg(text)]);
  }

  function pushBotLoading(): string {
    const id = makeId();
    setMessages(prev => [...prev, { id, role: "bot", text: "...", loading: true }]);
    return id;
  }

  function resolveLoading(id: string, text: string) {
    setMessages(prev =>
      prev.map(m => (m.id === id ? { ...m, text, loading: false } : m))
    );
  }

  // ─── Submit handler — routes based on current stage ────────────────────────

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = input.trim();
    if (!value || isSending) return;

    setInput("");
    setMessages(prev => [...prev, userMsg(value)]);
    setIsSending(true);

    try {
      switch (stage) {
        case "greeting":
          await handleUrlSubmit(value);
          break;
        case "confirm_scrape":
          await handleScrapeConfirm(value);
          break;
        case "gap_fill":
          await handleGapFill(value);
          break;
        case "ai_name":
          await handleAiName(value);
          break;
        case "ai_greeting":
          await handleAiGreeting(value);
          break;
        default:
          break;
      }
    } finally {
      setIsSending(false);
    }
  }

  // ─── Stage handlers ────────────────────────────────────────────────────────

  async function handleUrlSubmit(url: string) {
    // Basic URL normalization
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = "https://" + cleanUrl;
    setWebsiteUrl(cleanUrl);

    const loadId = pushBotLoading();
    setStage("scraping");

    try {
      const res = await fetch(`/api/onboard/${token}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        resolveLoading(
          loadId,
          `Hmm, I had trouble scanning that URL. No worries — let's fill in the details together. ${scrapeErrorMessage(data.error)}`
        );
        setScrapeData({});
        startGapFill({});
        return;
      }

      const scraped: ScrapeData = data.data || {};
      setScrapeData(scraped);

      // Build a human-readable summary of what we found
      const summary = buildScrapeSummary(scraped, cleanUrl);
      resolveLoading(loadId, summary);
      setStage("confirm_scrape");
    } catch {
      resolveLoading(loadId, "I couldn't reach that URL right now. Let me ask you a few questions instead.");
      setScrapeData({});
      startGapFill({});
    }
  }

  function buildScrapeSummary(data: ScrapeData, url: string): string {
    const lines: string[] = [];
    lines.push(`Here's what I found on ${url}:\n`);

    if (data.companyName) lines.push(`📌 **Company:** ${data.companyName}`);
    if (data.phone) lines.push(`📞 **Phone:** ${data.phone}`);
    if (data.tradeType) lines.push(`🔧 **Trade:** ${data.tradeType}`);
    if (data.city || data.state)
      lines.push(`📍 **Location:** ${[data.city, data.state].filter(Boolean).join(", ")}`);
    if (data.services?.length)
      lines.push(`⚙️ **Services:** ${data.services.slice(0, 5).join(", ")}${data.services.length > 5 ? "…" : ""}`);
    if (data.hours) lines.push(`🕐 **Hours:** ${data.hours}`);

    const found = lines.length - 1; // subtract header
    if (found === 0) {
      return `I scanned ${url} but couldn't pull much data from it. Let me ask you a few quick questions to fill things in.`;
    }

    lines.push(`\nDoes this look right? Type **yes** to continue, or correct anything that's wrong.`);
    return lines.join("\n");
  }

  function scrapeErrorMessage(err?: string): string {
    if (!err) return "";
    if (err.includes("timeout")) return "(The site took too long to respond.)";
    if (err.includes("404")) return "(Page not found — double-check the URL.)";
    return "";
  }

  async function handleScrapeConfirm(value: string) {
    const v = value.toLowerCase().trim();
    if (v === "yes" || v === "y" || v === "looks good" || v === "correct" || v === "yep" || v === "yeah") {
      // Proceed with scrape data as-is
      setFinalData(scrapeData);
      startGapFill(scrapeData);
    } else {
      // They want to correct something — treat their message as an override and move on
      // Simple approach: accept their correction as the company name if it doesn't match
      pushBot(
        "Got it — thanks for the correction. I'll note that. Let's continue filling in the details."
      );
      setFinalData(scrapeData);
      startGapFill(scrapeData);
    }
  }

  function startGapFill(data: ScrapeData) {
    // Determine which required fields are missing
    const missing = REQUIRED_FIELDS.filter(f => {
      const v = data[f.key];
      return !v || (Array.isArray(v) && v.length === 0);
    });

    if (missing.length === 0) {
      // All required data present — go straight to AI name
      setFinalData(data);
      setStage("ai_name");
      setTimeout(() => {
        pushBot(
          `Great, I have everything I need! Now let's name your AI receptionist. What would you like to call them? (e.g. "Alex", "Jordan", "Sam" — something that sounds natural on the phone.)`
        );
      }, 300);
      return;
    }

    setPendingGapFields(missing);
    setCurrentGapIndex(0);
    setStage("gap_fill");
    setTimeout(() => {
      pushBot(`Just a couple more details I need:\n\n${missing[0].question}`);
    }, 300);
  }

  async function handleGapFill(value: string) {
    const field = pendingGapFields[currentGapIndex];
    if (!field) return;

    // Save the answer
    const updated = { ...finalData, [field.key]: value };
    setFinalData(updated);

    const nextIndex = currentGapIndex + 1;
    setCurrentGapIndex(nextIndex);

    if (nextIndex < pendingGapFields.length) {
      // Ask next missing field
      setTimeout(() => {
        pushBot(pendingGapFields[nextIndex].question);
      }, 200);
    } else {
      // All gaps filled — move to AI name
      setStage("ai_name");
      setTimeout(() => {
        pushBot(
          `Perfect! Now let's give your AI receptionist a name. What should callers know them as? (e.g. "Alex", "Jordan", "Riley")`
        );
      }, 300);
    }
  }

  async function handleAiName(value: string) {
    const trimmed = value.trim();
    setAiName(trimmed);
    setStage("ai_greeting");

    const company = finalData.companyName || companyName || "your company";
    const defaultGreeting = `Thanks for calling ${company}, this is ${trimmed}! How can I help you today?`;

    setTimeout(() => {
      pushBot(
        `Love it — **${trimmed}** it is!\n\nNow, how should ${trimmed} greet callers when they call in? Here's a default you can use:\n\n> "${defaultGreeting}"\n\nType a custom greeting, or just say **"use that"** to keep the default.`
      );
    }, 200);
  }

  async function handleAiGreeting(value: string) {
    const v = value.toLowerCase().trim();
    const company = finalData.companyName || companyName || "your company";
    const defaultGreeting = `Thanks for calling ${company}, this is ${aiName}! How can I help you today?`;

    const greeting =
      v === "use that" || v === "use it" || v === "keep it" || v === "that" || v === "yes"
        ? defaultGreeting
        : value.trim();

    setAiGreeting(greeting);
    setStage("confirm_launch");

    // Show final summary
    const fd = finalData;
    const lines = [
      `Here's a summary of your AI receptionist setup:\n`,
      `🤖 **Name:** ${aiName}`,
      `👋 **Greeting:** "${greeting}"`,
      `🏢 **Company:** ${fd.companyName || companyName}`,
      fd.phone ? `📞 **Phone context:** ${fd.phone}` : null,
      fd.tradeType ? `🔧 **Trade:** ${fd.tradeType}` : null,
      fd.city || fd.state ? `📍 **Location:** ${[fd.city, fd.state].filter(Boolean).join(", ")}` : null,
      fd.services?.length ? `⚙️ **Services:** ${fd.services.slice(0, 4).join(", ")}` : null,
      `\nType **"build it"** to create your AI receptionist, or let me know if anything needs to change.`,
    ].filter(Boolean);

    setTimeout(() => {
      pushBot(lines.join("\n"));
    }, 300);

    // Override stage back so input handler works
    setStage("confirm_launch" as Stage);
  }

  // confirm_launch doesn't go through the generic switch — handle via effect
  useEffect(() => {
    if (stage !== "confirm_launch") return;
    // handled in handleSubmit's default — we need to wire it
  }, [stage]);

  // Override handleSubmit for confirm_launch
  async function handleConfirmLaunch(value: string) {
    const v = value.toLowerCase().trim();
    if (
      v === "build it" ||
      v === "yes" ||
      v === "go" ||
      v === "launch" ||
      v === "do it" ||
      v === "create it" ||
      v === "let's go" ||
      v === "looks good"
    ) {
      await launchAssistant();
    } else {
      pushBot(
        "Sure! What would you like to change? Just tell me and I'll update it before we build."
      );
    }
  }

  // Patch submit to handle confirm_launch
  async function handleSubmitFull(e?: React.FormEvent) {
    e?.preventDefault();
    const value = input.trim();
    if (!value || isSending) return;

    setInput("");
    setMessages(prev => [...prev, userMsg(value)]);
    setIsSending(true);

    try {
      if (stage === "confirm_launch") {
        await handleConfirmLaunch(value);
      } else {
        await (async () => {
          switch (stage) {
            case "greeting":
              await handleUrlSubmit(value);
              break;
            case "confirm_scrape":
              await handleScrapeConfirm(value);
              break;
            case "gap_fill":
              await handleGapFill(value);
              break;
            case "ai_name":
              await handleAiName(value);
              break;
            case "ai_greeting":
              await handleAiGreeting(value);
              break;
            default:
              break;
          }
        })();
      }
    } finally {
      setIsSending(false);
    }
  }

  // ─── Launch assistant ──────────────────────────────────────────────────────

  async function launchAssistant() {
    setStage("building");
    pushBot("🔧 Building your AI receptionist now… this takes about 10 seconds.");

    try {
      const res = await fetch(`/api/onboard/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: finalData.companyName || companyName,
          phone: finalData.phone,
          tradeType: finalData.tradeType,
          services: finalData.services,
          pricing: finalData.pricing,
          hours: finalData.hours,
          city: finalData.city,
          state: finalData.state,
          faqs: finalData.faqs,
          aiName,
          aiGreeting,
          websiteUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Provisioning failed");
      }

      setAssistantId(data.telnyxAssistantId || "");
      setStage("done");

      setMessages(prev => [
        ...prev,
        botMsg(
          `✅ **${aiName} is live!**\n\nYour AI phone receptionist has been created and is ready to take calls.\n\nAssistant ID: \`${data.telnyxAssistantId || "provisioned"}\`\n\n**Next step:** Log into your dashboard to connect ${aiName} to your business phone number.`
        ),
      ]);
    } catch (err: any) {
      setStage("error");
      setMessages(prev => [
        ...prev,
        botMsg(
          `❌ Something went wrong while building your assistant: ${err.message || "Unknown error"}.\n\nPlease try again or use the form setup below.`
        ),
      ]);
    }
  }

  // ─── Render: special full-screen states ────────────────────────────────────

  if (stage === "validating") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm">Verifying your setup link…</p>
        </div>
      </div>
    );
  }

  if (stage === "invalid_token") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">Link Expired or Invalid</h1>
            <p className="text-gray-400 text-sm mb-6">
              This setup link has expired or already been used. Please contact us to get a new link, or set up your account manually.
            </p>
            <a
              href="/onboarding"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Set up manually instead
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isInputDisabled =
    stage === "validating" ||
    stage === "scraping" ||
    stage === "building" ||
    stage === "done" ||
    stage === "error" ||
    isSending;

  // ─── Main chat UI ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">AI Receptionist Setup</p>
          <p className="text-xs text-gray-400">Powered by Speed-to-Lead</p>
        </div>
        {stage === "done" && (
          <div className="ml-auto flex items-center gap-1.5 text-green-400 text-xs">
            <CheckCircle2 className="h-4 w-4" />
            <span>Complete</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                msg.role === "bot" ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              {msg.role === "bot" ? (
                <Bot className="h-4 w-4 text-white" />
              ) : (
                <User className="h-4 w-4 text-gray-300" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "bot"
                  ? "bg-gray-800 text-gray-100 rounded-tl-sm"
                  : "bg-blue-600 text-white rounded-tr-sm"
              } ${msg.loading ? "animate-pulse" : ""}`}
              dangerouslySetInnerHTML={{
                __html: msg.loading
                  ? '<span class="inline-flex gap-1"><span class="animate-bounce" style="animation-delay:0ms">●</span><span class="animate-bounce" style="animation-delay:150ms">●</span><span class="animate-bounce" style="animation-delay:300ms">●</span></span>'
                  : formatMessage(msg.text),
              }}
            />
          </div>
        ))}

        {/* Building spinner */}
        {stage === "building" && (
          <div className="flex items-center gap-3 text-gray-400 text-sm px-11">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span>Provisioning your AI receptionist…</span>
          </div>
        )}

        {/* Done — dashboard CTA */}
        {stage === "done" && (
          <div className="mx-11 mt-2">
            <a
              href="/login"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Go to your dashboard
            </a>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 bg-gray-900 px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmitFull} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isInputDisabled}
              placeholder={
                stage === "greeting"
                  ? "Paste your website URL here…"
                  : stage === "building" || stage === "done"
                  ? "Setup complete!"
                  : "Type your reply…"
              }
              className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isInputDisabled || !input.trim()}
              className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          {/* Fallback link */}
          {(stage !== "done" && stage !== "building") && (
            <p className="text-center text-xs text-gray-600 mt-2">
              Having trouble?{" "}
              <a href="/onboarding" className="text-gray-500 underline hover:text-gray-400">
                Fill out the form instead
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Markdown-lite formatter ──────────────────────────────────────────────────
// Converts **bold**, `code`, and line breaks for HTML rendering

function formatMessage(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 rounded text-xs">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-gray-600 pl-3 text-gray-300 italic">$1</blockquote>')
    .replace(/\n/g, "<br/>");
}
