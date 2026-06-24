import { NextResponse } from "next/server";
import { SYSTEM_PROMPT, buildUserPrompt } from "../../../lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---- helpers -------------------------------------------------------------

function extractJson(text) {
  if (!text) throw new Error("Empty response from the AI provider.");
  let t = text.trim();
  // strip ```json ... ``` fences if present
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // grab from the first { to the last } (fall back to open-ended if truncated)
  const first = t.indexOf("{");
  if (first === -1) throw new Error("No JSON object found in AI response.");
  const last = t.lastIndexOf("}");
  let slice = last > first ? t.slice(first, last + 1) : t.slice(first);

  // 1) try as-is
  try {
    return JSON.parse(slice);
  } catch (_) {}

  // 2) remove trailing commas before } or ]
  let repaired = slice.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(repaired);
  } catch (_) {}

  // 3) last-ditch: balance any unclosed brackets/braces (handles truncation)
  try {
    let depthCurly = 0;
    let depthSquare = 0;
    let inStr = false;
    let esc = false;
    for (const ch of repaired) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === "{") depthCurly++;
      else if (ch === "}") depthCurly--;
      else if (ch === "[") depthSquare++;
      else if (ch === "]") depthSquare--;
    }
    if (inStr) repaired += '"';
    repaired += "]".repeat(Math.max(0, depthSquare));
    repaired += "}".repeat(Math.max(0, depthCurly));
    repaired = repaired.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired);
  } catch (_) {}

  throw new Error("Invalid JSON structure in AI response.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One Gemini call with a hard per-request timeout. Without this, a hung
// upstream connection would block until Vercel kills the function at 60s.
async function callGeminiOnce({ apiKey, model, system, user, timeoutMs = 18000 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          // Disable "thinking" so the full token budget goes to the JSON answer.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Gemini API error (${res.status}): ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  } catch (e) {
    if (e?.name === "AbortError") {
      const te = new Error(`Gemini request timed out after ${timeoutMs}ms.`);
      te.status = 504;
      throw te;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Walks an ordered, de-duplicated model list, each call time-boxed. Transient
// failures (overload / rate limit / timeout / 5xx) fall through to the next
// model. The whole plan is bounded (<= 3 calls * 13s) to stay under the 60s
// function limit, so a 503 spike on one model never hangs the request.
async function callGemini({ apiKey, models, system, user }) {
  const plan = models.slice(0, 3);
  // Overall wall-clock budget, comfortably under the 60s function limit. Each
  // attempt is time-boxed to whatever remains, so we try as many fallback
  // models as fit without ever risking a hard 60s function timeout.
  const deadline = Date.now() + 52000;
  let lastErr;
  for (let i = 0; i < plan.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) break; // not enough time for a meaningful attempt
    const timeoutMs = Math.min(18000, remaining - 500);
    try {
      const text = await callGeminiOnce({ apiKey, model: plan[i], system, user, timeoutMs });
      if (text) return text;
      lastErr = new Error("Empty response from Gemini.");
    } catch (e) {
      lastErr = e;
      console.warn(`[gemini] model "${plan[i]}" failed: ${e.status || "?"} ${e.message}`);
      const retryable =
        e.status === 503 || e.status === 429 || e.status === 504 || (e.status >= 500 && e.status < 600);
      // Permanent errors (e.g. 400/404 for a model) also move on to the next
      // candidate. Brief pause before the next try on transient errors.
      if (retryable && i < plan.length - 1 && deadline - Date.now() > 4000) await sleep(250);
    }
  }
  throw lastErr || new Error("Gemini request failed.");
}

async function callAnthropic({ apiKey, model, system, user }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = (data?.content || []).map((b) => b.text || "").join("");
  return text;
}

// ---- route ---------------------------------------------------------------

export async function POST(req) {
  try {
    const body = await req.json();
    let { article, focusKeyword } = body || {};

    if (!article || typeof article !== "string" || article.trim().length < 80) {
      return NextResponse.json(
        { error: "Please paste a story of at least ~80 characters." },
        { status: 400 }
      );
    }

    // Cap input so a single request can't run up huge token cost / latency.
    const MAX_CHARS = 30000;
    if (article.length > MAX_CHARS) article = article.slice(0, MAX_CHARS);
    if (typeof focusKeyword === "string") focusKeyword = focusKeyword.slice(0, 200);

    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const system = SYSTEM_PROMPT;
    const user = buildUserPrompt(article, focusKeyword);

    let raw;
    let provider;

    if (geminiKey) {
      provider = "gemini";
      // With paid billing enabled, gemini-2.5-flash is the quality sweet spot
      // for this task. GEMINI_MODEL (Vercel env) overrides the primary, so the
      // model can be changed without a code edit. flash-lite stays in the chain
      // as a fast, always-available fallback if the primary is overloaded.
      const envModel = (process.env.GEMINI_MODEL || "").trim();
      const models = [
        ...new Set(
          [
            envModel || "gemini-2.5-flash",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-flash-latest",
          ].filter(Boolean)
        ),
      ];
      raw = await callGemini({ apiKey: geminiKey, models, system, user });
    } else if (anthropicKey) {
      provider = "anthropic";
      raw = await callAnthropic({
        apiKey: anthropicKey,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        system,
        user,
      });
    } else {
      return NextResponse.json(
        {
          error:
            "No AI key configured. Add GEMINI_API_KEY (free at aistudio.google.com) — or ANTHROPIC_API_KEY — as an environment variable in your Vercel project settings, then redeploy.",
        },
        { status: 500 }
      );
    }

    let result;
    try {
      result = extractJson(raw);
    } catch (e) {
      return NextResponse.json(
        { error: `Could not parse the AI response as JSON. ${e.message}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ provider, result });
  } catch (err) {
    const msg = err?.message || "Unexpected server error.";
    if (/\b(503|504|UNAVAILABLE|high demand|overloaded|timed out)\b/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "The AI model is busy right now (a temporary demand spike on Google’s side). Please wait a few seconds and try again.",
        },
        { status: 503 }
      );
    }
    if (/\b429\b|quota|rate limit/i.test(msg)) {
      return NextResponse.json(
        { error: "Rate limit reached for now. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
