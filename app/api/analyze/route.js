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

async function callGeminiOnce({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        // Disable "thinking" so the full token budget goes to the JSON answer
        // (prevents truncated/invalid JSON on gemini-2.5-flash).
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
}

// Tries each model in turn, retrying transient errors (overload / rate limit /
// 5xx) with exponential backoff so a temporary Gemini spike is invisible.
async function callGemini({ apiKey, models, system, user }) {
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await callGeminiOnce({ apiKey, model, system, user });
        if (text) return text;
        lastErr = new Error("Empty response from Gemini.");
      } catch (e) {
        lastErr = e;
        const transient = e.status === 503 || e.status === 429 || (e.status >= 500 && e.status < 600);
        if (!transient) break; // permanent error for this model — move to next model
        if (attempt < 2) await sleep(500 * Math.pow(2, attempt)); // 500ms, 1s
      }
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
    const { article, focusKeyword } = await req.json();

    if (!article || article.trim().length < 80) {
      return NextResponse.json(
        { error: "Please paste an article of at least ~80 characters." },
        { status: 400 }
      );
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const system = SYSTEM_PROMPT;
    const user = buildUserPrompt(article, focusKeyword);

    let raw;
    let provider;

    if (geminiKey) {
      provider = "gemini";
      const primary = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      // Primary first, then lighter / aliased models that tend to stay available
      // when the primary is under high demand.
      const models = [...new Set([primary, "gemini-2.5-flash-lite", "gemini-flash-latest"])];
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
    if (/\b(503|UNAVAILABLE|high demand|overloaded)\b/i.test(msg)) {
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
