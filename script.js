"use strict";

/**
 * ExplainLikeAI Prototype
 * Vanilla JS implementation with:
 * - Difficulty segmented controls
 * - Chameleon themes + dark mode
 * - Context modal / saved notes
 * - LLM JSON-trick prompt + history memory
 * - Building-block capsules
 * - Jargon tooltip on highlighted text
 * - YouTube Data API embed
 */

// -----------------------------
// API keys
// -----------------------------


// -----------------------------
// Global state
// -----------------------------
let selectedDifficulty = "child"; // Feature 1 global difficulty variable
let savedContextNotes = ""; // Feature 4 context memory
const chatHistory = []; // Feature 5 contextual memory requested by user

// -----------------------------
// DOM references
// -----------------------------
const segButtons = document.querySelectorAll(".seg-btn");
const darkModeToggle = document.getElementById("darkModeToggle");
const majorInput = document.getElementById("majorInput");
const queryInput = document.getElementById("queryInput");
const explainBtn = document.getElementById("explainBtn");
const explanationOutput = document.getElementById("explanationOutput");
const buildingBlocksContainer = document.getElementById(
  "buildingBlocksContainer",
);
const youtubeContainer = document.getElementById("youtubeContainer");

const openContextModalBtn = document.getElementById("openContextModal");
const contextModal = document.getElementById("contextModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const contextTextarea = document.getElementById("contextTextarea");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveContextBtn = document.getElementById("saveContextBtn");

const jargonTooltip = document.getElementById("jargonTooltip");
let responseCount = 0;

// -----------------------------
// Utility helpers
// -----------------------------
function escapeHTML(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function difficultyToneMap(level) {
  if (level === "child") return "Playful and simple";
  if (level === "expert") return "Rigorous and technical";
  return "Clean and textbook-friendly";
}

function openModal() {
  contextModal.classList.remove("hidden");
  contextModal.setAttribute("aria-hidden", "false");
  contextTextarea.value = savedContextNotes;
}

function closeModal() {
  contextModal.classList.add("hidden");
  contextModal.setAttribute("aria-hidden", "true");
}

function setLoadingState(isLoading) {
  explainBtn.disabled = isLoading;
  explainBtn.textContent = isLoading ? "Thinking..." : "Explain It";
}

/**
 * Parse raw LLM response and robustly extract JSON.
 * Handles responses wrapped in markdown code fences.
 */
function extractJsonFromText(rawText) {
  const trimmed = String(rawText || "").trim();
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch (_) {
      return null;
    }
  };
  let parsed = tryParse(trimmed);
  if (parsed) return parsed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    parsed = tryParse(fenceMatch[1].trim());
    if (parsed) return parsed;
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    parsed = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (parsed) return parsed;
  }
  throw new Error("No valid JSON found in model response.");
}

/**
 * Normalize explanation payload from model into a string.
 * The model can occasionally return arrays/objects even when prompted for string.
 */
function normalizeExplanation(explanationValue) {
  if (typeof explanationValue === "string") return explanationValue;
  if (Array.isArray(explanationValue)) {
    return explanationValue
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }
  if (explanationValue && typeof explanationValue === "object") {
    // If keys are bullet-like content, flatten to lines; fallback to JSON text.
    const values = Object.values(explanationValue).filter((v) => v != null);
    if (values.length) {
      return values
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join("\n");
    }
    return JSON.stringify(explanationValue);
  }
  return String(explanationValue ?? "");
}

/**
 * Mock jargon definition helper (Feature 9 prototype behavior).
 * You can replace this with a real API call later.
 */
async function getDefinitionForTerm(term) {
  return `Quick simplify: "${term}" means this concept in an easier way. Think of it as a key step in how the system works.`;
}

// -----------------------------
// Feature 10: YouTube fetch + embed (IFrame API + fallback queue)
// -----------------------------
let youtubeIframeApiPromise = null;
function loadYouTubeIframeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!youtubeIframeApiPromise) {
    youtubeIframeApiPromise = new Promise((resolve) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prior === "function") prior();
        resolve();
      };
      if (!document.querySelector('script[src*="iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    });
  }
  return youtubeIframeApiPromise;
}

async function fetchYouTubeVideo(searchQuery) {
  if (!searchQuery || !searchQuery.trim()) {
    youtubeContainer.innerHTML =
      '<p class="muted">No video query available yet.</p>';
    return;
  }

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("q", searchQuery);
    endpoint.searchParams.set("maxResults", "12");
    endpoint.searchParams.set("type", "video");
    endpoint.searchParams.set("key", YT_API_KEY);

    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    const candidateIds = (data?.items || [])
      .map((item) => item?.id?.videoId)
      .filter(Boolean);

    if (!candidateIds.length) {
      youtubeContainer.innerHTML =
        '<p class="muted">No matching video found.</p>';
      return;
    }

    const detailsEndpoint = new URL(
      "https://www.googleapis.com/youtube/v3/videos",
    );
    detailsEndpoint.searchParams.set("part", "status");
    detailsEndpoint.searchParams.set("id", candidateIds.join(","));
    detailsEndpoint.searchParams.set("key", YT_API_KEY);

    const detailsResponse = await fetch(detailsEndpoint.toString());
    if (!detailsResponse.ok) {
      throw new Error(`YouTube video details error: ${detailsResponse.status}`);
    }

    const detailsData = await detailsResponse.json();
    const statusById = Object.fromEntries(
      (detailsData?.items || []).map((v) => [v.id, v]),
    );
    const validIds = candidateIds.filter((id) => {
      const v = statusById[id];
      return (
        v?.status?.embeddable === true &&
        v?.status?.privacyStatus === "public"
      );
    });

    if (!validIds.length) {
      youtubeContainer.innerHTML =
        '<p class="muted">No embeddable video available for this topic right now.</p>';
      return;
    }

    const hostId = `yt-host-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    youtubeContainer.innerHTML = `
      <div class="yt-player-wrapper w-full h-full min-h-0 bg-black">
        <div id="${hostId}"></div>
      </div>
      <p class="muted" style="margin-top:8px"><a class="yt-watch-link" href="#" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>
    `;
    const watchLink = youtubeContainer.querySelector(".yt-watch-link");
    const setWatchHref = (id) => {
      watchLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    };
    const queue = validIds.slice();
    setWatchHref(queue[0]);

    const measurePlayerSize = () => {
      const wrap = youtubeContainer.querySelector(".yt-player-wrapper");
      const w = Math.floor(
        (wrap && wrap.getBoundingClientRect().width) ||
          youtubeContainer.getBoundingClientRect().width ||
          640,
      );
      const width = Math.max(280, w);
      const height = Math.round((width * 9) / 16);
      return { width, height };
    };

    await loadYouTubeIframeAPI();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    let { width: pW, height: pH } = measurePlayerSize();
    if (pW < 100) {
      pW = 640;
      pH = 360;
    }

    let player;
    const failSlot = youtubeContainer.querySelector(".yt-player-wrapper");
    const onPlayerError = () => {
      queue.shift();
      if (!queue.length) {
        if (player && typeof player.destroy === "function")
          player.destroy();
        failSlot.innerHTML =
          '<p class="muted">These videos could not be embedded here. Use the YouTube app or site to watch.</p>';
        return;
      }
      setWatchHref(queue[0]);
      player.loadVideoById(queue[0]);
      const { width, height } = measurePlayerSize();
      if (width >= 100) player.setSize(width, height);
    };

    player = new YT.Player(hostId, {
      videoId: queue[0],
      width: pW,
      height: pH,
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (e) => {
          try {
            const { width, height } = measurePlayerSize();
            if (width >= 100) e.target.setSize(width, height);
            const id = e.target.getVideoData().videoId;
            if (id) setWatchHref(id);
          } catch (_) {}
        },
        onError: onPlayerError,
      },
    });

    if (typeof ResizeObserver !== "undefined" && failSlot) {
      const ro = new ResizeObserver(() => {
        if (!player || typeof player.setSize !== "function") return;
        const { width, height } = measurePlayerSize();
        if (width >= 100) player.setSize(width, height);
      });
      ro.observe(failSlot);
    }
  } catch (error) {
    youtubeContainer.innerHTML = `<p class="muted">Could not load video: ${escapeHTML(error.message)}</p>`;
  }
}

// -----------------------------
// Feature 6 + 7: Core AI fetch using JSON trick
// -----------------------------
async function fetchLLMResponse(userQuestion) {
  const major = majorInput.value.trim() || "General";
  const tone = difficultyToneMap(selectedDifficulty);

  /**
   * System prompt enforces JSON output with required keys.
   * Also enforces bullet formatting + real-life application requirement.
   */
  const systemPrompt = `
You are ExplainLikeAI, an educational explanation engine.
Return one JSON object only (no markdown fences, no text before or after).

Required keys as double-quoted JSON keys:
"explanation": string
"buildingBlocks": array of exactly 3 strings
"youtubeSearchQuery": string

CRITICAL: All string values must be in double quotes. Never write "explanation": * or bare markdown bullets as JSON values.
Put bullets INSIDE the "explanation" string using newlines; each line may start with "- ". Do not use * at line starts.

Rules:
1) explanation ends with a line "- Real-Life Application:" and a practical example.
2) Adapt to difficulty "${selectedDifficulty}" (${tone}).
3) Tailor to major "${major}".
4) Use chat history for context.
`.trim();

  // Combine user query and optional pasted context.
  const userPrompt = `
User Question: ${userQuestion}
User Major/Profession: ${major}
Difficulty: ${selectedDifficulty}
Additional Notes/Context: ${savedContextNotes || "None"}
`.trim();

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...chatHistory.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: userPrompt },
  ];

  const baseBody = {
    model: GROQ_MODEL,
    messages: groqMessages,
    temperature: 0.45,
  };

  let res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      ...baseBody,
      response_format: { type: "json_object" },
    }),
  });

  if (
    !res.ok &&
    res.status === 400
  ) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = String(errBody?.error?.message || "");
    } catch (_) {}
    if (
      /response_format|json_object|json mode|does not support|invalid.?value/i.test(
        detail,
      )
    ) {
      res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify(baseBody),
      });
    }
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail =
        errBody?.error?.message ||
        JSON.stringify(errBody?.error || errBody);
    } catch (_) {}
    throw new Error(
      detail
        ? `Groq error ${res.status}: ${detail}`
        : `LLM API error: ${res.status}`,
    );
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content || "";
  if (!rawText) {
    throw new Error("Groq returned an empty response.");
  }
  try {
    return extractJsonFromText(rawText);
  } catch (parseErr) {
    throw new Error(
      `Invalid JSON from model: ${parseErr.message}. Try again.`,
    );
  }
}

// -----------------------------
// Feature 8: Prerequisite capsules rendering
// -----------------------------
function renderBuildingBlocks(blocks = []) {
  buildingBlocksContainer.innerHTML = "";

  if (!Array.isArray(blocks) || blocks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No building blocks generated yet.";
    buildingBlocksContainer.appendChild(empty);
    return;
  }

  blocks.forEach((term) => {
    const capsule = document.createElement("button");
    capsule.className = "capsule";
    capsule.type = "button";
    capsule.textContent = term;
    capsule.title = `Explain "${term}" next`;

    // Clicking a capsule triggers another search automatically
    capsule.addEventListener("click", () => {
      queryInput.value = term;
      runExplainFlow(term);
    });

    buildingBlocksContainer.appendChild(capsule);
  });
}

function formatExplanationTextToHTML(explanationText) {
  /**
   * Convert line-based bullet text into an HTML list when possible.
   * If lines already include bullets, preserve their structure.
   */
  const safeText = normalizeExplanation(explanationText);
  const lines = safeText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "<p>No explanation generated.</p>";

  const allBulletLike = lines.every((line) => /^[-*•]/.test(line));
  if (allBulletLike) {
    const items = lines
      .map((line) => line.replace(/^[-*•]\s*/, ""))
      .map((line) => `<li>${escapeHTML(line)}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  return lines.map((line) => `<p>${escapeHTML(line)}</p>`).join("");
}

function appendExplanationEntry(question, explanationHTML) {
  // Replace placeholder text on first real response.
  if (responseCount === 0) {
    explanationOutput.innerHTML = "";
  }

  responseCount += 1;
  const userBlock = document.createElement("section");
  userBlock.className = "explanation-entry";
  userBlock.innerHTML = `<p class="entry-question"><strong>You</strong></p><div class="entry-answer"><p>${escapeHTML(question)}</p></div>`;

  const aiBlock = document.createElement("section");
  aiBlock.className = "explanation-entry";
  aiBlock.innerHTML = `<p class="entry-question"><strong>Athena</strong></p><div class="entry-answer">${explanationHTML}</div>`;

  explanationOutput.appendChild(userBlock);
  explanationOutput.appendChild(aiBlock);
  explanationOutput.scrollTop = explanationOutput.scrollHeight;
}

function normalizeBuildingBlocks(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v))
      .filter(Boolean)
      .slice(0, 3);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  return [];
}

async function runExplainFlow(forcedQuestion = "") {
  const question = forcedQuestion || queryInput.value.trim();
  if (!question) {
    explanationOutput.textContent = "Please type a concept/question first.";
    return;
  }

  // Clear typed question once submitted by user for next prompt.
  if (!forcedQuestion) {
    queryInput.value = "";
  }

  setLoadingState(true);
  jargonTooltip.classList.add("hidden");

  try {
    const llmJson = await fetchLLMResponse(question);

    const explanation = normalizeExplanation(
      llmJson?.explanation || "No explanation returned.",
    );
    const buildingBlocks = normalizeBuildingBlocks(llmJson?.buildingBlocks);
    const youtubeSearchQuery = String(llmJson?.youtubeSearchQuery || "");

    const explanationHTML = formatExplanationTextToHTML(explanation);
    appendExplanationEntry(question, explanationHTML);
    renderBuildingBlocks(buildingBlocks);
    await fetchYouTubeVideo(youtubeSearchQuery);

    // Feature 5: Save both user and assistant messages for memory
    chatHistory.push({ role: "user", content: question });
    chatHistory.push({
      role: "assistant",
      content: JSON.stringify(
        {
          explanation,
          buildingBlocks,
          youtubeSearchQuery,
        },
        null,
        2,
      ),
    });
  } catch (error) {
    const errorBlock = document.createElement("section");
    errorBlock.className = "explanation-entry";
    errorBlock.innerHTML = `<p class="entry-question"><strong>Athena</strong></p><div class="entry-answer"><p>Something went wrong: ${escapeHTML(error.message)}</p></div>`;
    explanationOutput.appendChild(errorBlock);
    explanationOutput.scrollTop = explanationOutput.scrollHeight;
  } finally {
    setLoadingState(false);
  }
}

// -----------------------------
// Event wiring
// -----------------------------

// Feature 1 + 2 difficulty switching
segButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    document.body.setAttribute("data-difficulty", selectedDifficulty);

    segButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
  });
});

// Dark mode toggle (separate from difficulty selection)
darkModeToggle.addEventListener("change", (event) => {
  document.body.classList.toggle("dark-mode", event.target.checked);
});

// Feature 4 context modal open/close/save
openContextModalBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
saveContextBtn.addEventListener("click", () => {
  savedContextNotes = contextTextarea.value.trim();
  closeModal();
});

// Main explain button
explainBtn.addEventListener("click", () => runExplainFlow());

// Enter shortcut in query input (Shift+Enter still creates newline)
queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runExplainFlow();
  }
});

// Auto-grow composer input for modern chat-app behavior.
queryInput.addEventListener("input", () => {
  queryInput.style.height = "auto";
  queryInput.style.height = `${Math.min(queryInput.scrollHeight, 180)}px`;
});

// Feature 9: Hover-to-simplify using selected text near cursor
explanationOutput.addEventListener("mouseup", async (event) => {
  const selected = window.getSelection().toString().trim();
  if (!selected || selected.length < 3) {
    jargonTooltip.classList.add("hidden");
    return;
  }

  const definition = await getDefinitionForTerm(selected);
  jargonTooltip.textContent = definition;
  jargonTooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 280)}px`;
  jargonTooltip.style.top = `${Math.max(event.clientY + 12, 8)}px`;
  jargonTooltip.classList.remove("hidden");
});

// Hide tooltip when user clicks elsewhere
document.addEventListener("click", (event) => {
  const clickedInsideExplanation = explanationOutput.contains(event.target);
  const clickedTooltip = jargonTooltip.contains(event.target);
  if (!clickedInsideExplanation && !clickedTooltip) {
    jargonTooltip.classList.add("hidden");
  }
});

// -----------------------------
// Initial UI setup
// -----------------------------
document.body.setAttribute("data-difficulty", selectedDifficulty);
