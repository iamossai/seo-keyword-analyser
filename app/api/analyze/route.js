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
  // grab the outermost JSON object
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON object found in AI response.");
  const slice = t.slice(first, last + 1);
  return JSON.parse(slice);
}

async function callGemini({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text;
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
      raw = await callGemini({
        apiKey: geminiKey,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        system,
        user,
      });
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
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
