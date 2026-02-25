/**
 * know.help Mindset Capture — Content Script
 * Detects methodology signals in AI conversations and offers capture.
 *
 * Supported platforms: Claude.ai, ChatGPT, Perplexity
 */

(() => {
  "use strict";

  // Prevent double-injection
  if (window.__knowHelpCapture) return;
  window.__knowHelpCapture = true;

  // ── Platform detection ──────────────────────────────────────────────────

  function detectPlatform() {
    const host = location.hostname;
    if (host.includes("claude.ai")) return "claude";
    if (host.includes("openai.com") || host.includes("chatgpt.com")) return "chatgpt";
    if (host.includes("perplexity.ai")) return "perplexity";
    return "unknown";
  }

  const PLATFORM = detectPlatform();
  if (PLATFORM === "unknown") return;

  // ── Signal type definitions ─────────────────────────────────────────────

  const SIGNAL_PATTERNS = [
    {
      type: "correction",
      patterns: [
        /actually,?\s+(that's not|you're wrong|that doesn't|the correct|I'd push back)/gi,
        /no,?\s+(I|we|you)\s+(should|would|need|prefer)/gi,
        /that's\s+(incorrect|inaccurate|misleading|wrong)/gi,
        /I\s+(disagree|wouldn't|don't think|have a different)/gi,
      ],
      confidence: 0.85,
    },
    {
      type: "explanation",
      patterns: [
        /the\s+reason\s+(I|we)\s+(do|use|prefer|avoid|choose)/gi,
        /here's\s+(why|how|what)\s+(I|we)/gi,
        /my\s+(approach|methodology|framework|process|reasoning)/gi,
        /in\s+my\s+experience/gi,
        /the\s+way\s+I\s+(think about|approach|handle)/gi,
      ],
      confidence: 0.8,
    },
    {
      type: "opinion",
      patterns: [
        /I\s+(strongly\s+)?(believe|think|feel|maintain|argue)/gi,
        /my\s+(professional\s+)?(opinion|view|stance|position)/gi,
        /from\s+my\s+perspective/gi,
        /I'd\s+(recommend|suggest|advise|argue for)/gi,
      ],
      confidence: 0.75,
    },
    {
      type: "red_line",
      patterns: [
        /never\s+(do|use|implement|deploy|accept|allow)/gi,
        /always\s+(ensure|verify|check|validate|require)/gi,
        /I\s+(refuse|won't|cannot|will never)/gi,
        /non-?negotiable|must\s+have|hard\s+requirement/gi,
        /deal\s*-?\s*breaker|absolute(ly)?\s+(not|must)/gi,
      ],
      confidence: 0.9,
    },
    {
      type: "framework",
      patterns: [
        /step\s+\d+[:.]/gi,
        /my\s+(framework|process|checklist|workflow|protocol)/gi,
        /first.*then.*finally/gi,
        /the\s+\d+\s+(steps?|phases?|stages?)\s+(I|we)/gi,
      ],
      confidence: 0.8,
    },
    {
      type: "preference",
      patterns: [
        /I\s+(prefer|favor|lean toward|like to|tend to)/gi,
        /my\s+(default|go-to|preferred|standard)\s+(choice|approach|tool)/gi,
        /over\s+(X|Y|the alternative|other options)/gi,
      ],
      confidence: 0.7,
    },
  ];

  // ── Message extraction per platform ─────────────────────────────────────

  function getUserMessages() {
    switch (PLATFORM) {
      case "claude": return getClaudeMessages();
      case "chatgpt": return getChatGPTMessages();
      case "perplexity": return getPerplexityMessages();
      default: return [];
    }
  }

  function getClaudeMessages() {
    const msgs = [];
    // Claude.ai uses data-testid="human-turn" for user messages
    const turns = document.querySelectorAll('[data-testid="human-turn"]');
    turns.forEach((turn) => {
      const text = turn.textContent?.trim();
      if (text && text.length > 40) {
        msgs.push({ text, element: turn });
      }
    });

    // Fallback: look for human message containers
    if (msgs.length === 0) {
      document.querySelectorAll(".font-user-message, .human-turn").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 40) {
          msgs.push({ text, element: el });
        }
      });
    }

    return msgs;
  }

  function getChatGPTMessages() {
    const msgs = [];
    // ChatGPT uses data-message-author-role="user"
    const turns = document.querySelectorAll('[data-message-author-role="user"]');
    turns.forEach((turn) => {
      const text = turn.textContent?.trim();
      if (text && text.length > 40) {
        msgs.push({ text, element: turn });
      }
    });
    return msgs;
  }

  function getPerplexityMessages() {
    const msgs = [];
    // Perplexity: query text areas or user messages
    document.querySelectorAll(".prose, .query-text, [class*='UserMessage']").forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 40) {
        msgs.push({ text, element: el });
      }
    });
    return msgs;
  }

  // ── Signal detection ────────────────────────────────────────────────────

  function detectSignals(text) {
    const signals = [];

    for (const signalDef of SIGNAL_PATTERNS) {
      for (const pattern of signalDef.patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match) {
          // Extract surrounding context (sentence containing the match)
          const start = Math.max(0, text.lastIndexOf(".", match.index - 1) + 1);
          const end = text.indexOf(".", match.index + match[0].length);
          const sentence = text.slice(start, end > 0 ? end + 1 : undefined).trim();

          signals.push({
            type: signalDef.type,
            content: sentence.slice(0, 500),
            matchText: match[0],
            confidence: signalDef.confidence,
          });
          break; // One match per type per message
        }
      }
    }

    return signals;
  }

  // ── Capture chip UI ─────────────────────────────────────────────────────

  let chipContainer = null;

  function createChipContainer() {
    if (chipContainer) return chipContainer;

    chipContainer = document.createElement("div");
    chipContainer.id = "kh-capture-container";
    document.body.appendChild(chipContainer);
    return chipContainer;
  }

  function showCaptureChip(signal, messageElement) {
    const container = createChipContainer();

    // Position near the message
    const rect = messageElement.getBoundingClientRect();

    const chip = document.createElement("div");
    chip.className = "kh-capture-chip";
    chip.innerHTML = `
      <div class="kh-chip-header">
        <span class="kh-chip-badge kh-badge-${signal.type}">${signal.type}</span>
        <span class="kh-chip-label">Methodology signal detected</span>
        <button class="kh-chip-close">&times;</button>
      </div>
      <div class="kh-chip-content">${escapeHTML(signal.content.slice(0, 200))}${signal.content.length > 200 ? "..." : ""}</div>
      <div class="kh-chip-actions">
        <button class="kh-btn-capture">Capture for Mindset</button>
        <button class="kh-btn-dismiss">Dismiss</button>
      </div>
    `;

    chip.querySelector(".kh-chip-close").addEventListener("click", () => chip.remove());
    chip.querySelector(".kh-btn-dismiss").addEventListener("click", () => {
      chip.classList.add("kh-chip-dismissed");
      setTimeout(() => chip.remove(), 300);
    });

    chip.querySelector(".kh-btn-capture").addEventListener("click", () => {
      captureSignal(signal);
      chip.innerHTML = `<div class="kh-chip-captured">Captured! Will sync on next push.</div>`;
      setTimeout(() => chip.remove(), 2000);
    });

    container.appendChild(chip);

    // Auto-remove after 15 seconds
    setTimeout(() => {
      if (chip.parentNode) {
        chip.classList.add("kh-chip-dismissed");
        setTimeout(() => chip.remove(), 300);
      }
    }, 15000);
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Capture storage ─────────────────────────────────────────────────────

  async function captureSignal(signal) {
    const captured = {
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      signal_type: signal.type,
      content: signal.content,
      context: signal.matchText,
      platform: PLATFORM,
      url: location.href.split("?")[0], // Strip query params
      confidence: signal.confidence,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    // Store locally
    const { pending = [] } = await chrome.storage.local.get("pending");
    pending.push(captured);
    await chrome.storage.local.set({ pending });

    // Update badge
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: pending.length });
  }

  // ── Observer — watch for new messages ───────────────────────────────────

  const processedMessages = new WeakSet();
  const processedTexts = new Set(); // Dedup by content hash

  function scanNewMessages() {
    const messages = getUserMessages();

    for (const msg of messages) {
      if (processedMessages.has(msg.element)) continue;
      processedMessages.add(msg.element);

      // Content-based dedup
      const hash = msg.text.slice(0, 100);
      if (processedTexts.has(hash)) continue;
      processedTexts.add(hash);

      const signals = detectSignals(msg.text);
      if (signals.length > 0) {
        // Show chip for the highest-confidence signal
        const best = signals.reduce((a, b) => (a.confidence > b.confidence ? a : b));
        showCaptureChip(best, msg.element);
      }
    }
  }

  // ── MutationObserver to watch for DOM changes ───────────────────────────

  let scanTimeout = null;

  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanNewMessages, 1500);
  }

  const observer = new MutationObserver((mutations) => {
    // Only scan if new nodes were added
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        debouncedScan();
        break;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial scan after page load
  setTimeout(scanNewMessages, 3000);
})();
