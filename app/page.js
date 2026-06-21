"use client";

import { useMemo, useState } from "react";
import { analyzeText } from "../lib/metrics";

const SAMPLE = `City council approved a new $40 million budget last night to repair roads and expand public transit across the metro area. The vote passed 7 to 2 after a two-hour debate.

Officials said most of the funding will go toward fixing potholes and resurfacing major routes that have deteriorated over the past three winters. About $12 million is set aside to add new bus lines connecting the east side to downtown.

Residents who attended the meeting were divided. Some praised the focus on transit, while others worried about a possible rise in property taxes to cover the costs. The mayor said the budget would not require a tax increase this year. Work is expected to begin in the spring.`;

function ccClass(n) {
  if (n >= 50 && n <= 60) return "cc-good";
  if (n > 60 && n <= 65) return "cc-warn";
  if (n >= 40 && n < 50) return "cc-warn";
  return "cc-bad";
}

function scoreColor(n) {
  if (n >= 75) return "var(--good)";
  if (n >= 50) return "var(--warn)";
  return "var(--bad)";
}

function Copyable({ text, children, label = "Copy" }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {}
      }}
    >
      {ok ? "✓ Copied" : children || label}
    </button>
  );
}

export default function Home() {
  const [article, setArticle] = useState("");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [provider, setProvider] = useState("");

  const metrics = useMemo(() => analyzeText(article), [article]);

  async function analyze() {
    setError("");
    setData(null);
    if (article.trim().length < 80) {
      setError("Please paste a story of at least ~80 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article, focusKeyword: focus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed.");
      setData(json.result);
      setProvider(json.provider);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const k = data?.keywords;
  const allKeywords = data
    ? [
        k?.primary,
        ...(k?.secondary || []),
        ...(k?.semantic || []),
        ...(k?.questions || []),
        ...(k?.longTail || []),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="container">
      <div className="header">
        <span className="badge"><span className="dot" /> Quick pre-publish SEO check</span>
        <h1>SEO Keyword Analyser</h1>
        <p className="subtitle">
          Paste your news story and get the few fixes that matter most before you hit publish — a
          better headline, the right keywords, the search snippet, and a quick checklist.
        </p>
      </div>

      <div className="grid">
        {/* INPUT */}
        <div className="panel">
          <h2>Your story</h2>
          <p className="hint">Paste the full story text below.</p>
          <textarea
            value={article}
            placeholder="Paste your news story here…"
            onChange={(e) => setArticle(e.target.value)}
          />
          <div className="input-meta">
            <span>{metrics.wordCount} words · {metrics.readingTime} min read</span>
            <span>Readability: {metrics.flesch} ({metrics.readabilityLabel})</span>
          </div>

          <div className="controls">
            <input
              type="text"
              value={focus}
              placeholder="Optional: main keyword you're targeting"
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>

          <div className="actions">
            <button onClick={analyze} disabled={loading}>
              {loading ? "Checking…" : "Check my story"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setArticle(SAMPLE);
                setData(null);
                setError("");
              }}
              disabled={loading}
            >
              Load sample
            </button>
          </div>
        </div>

        {/* RESULTS */}
        <div className="panel">
          <h2>Your report</h2>
          <p className="hint">
            {provider ? `Checked with ${provider}.` : "Your quick fixes appear here."}
          </p>

          {!data && !loading && !error && (
            <div className="placeholder">
              <p>Paste a story and click <strong>Check my story</strong>.</p>
              <p style={{ fontSize: 13.5 }}>
                You’ll get headline options, keywords (ordered by importance), a search snippet, a
                URL slug, and a short pre-publish checklist.
              </p>
            </div>
          )}

          {loading && (
            <div className="placeholder">
              <div className="spinner" />
              <p className="loadnote">Checking your story…</p>
            </div>
          )}

          {error && (
            <div className="error">
              <strong>Couldn’t check the story.</strong>
              <div style={{ marginTop: 6 }}>{error}</div>
            </div>
          )}

          {data && (
            <div>
              {/* SCORES */}
              {data.scores && (
                <div className="scores">
                  {[
                    ["overall", "Overall"],
                    ["headline", "Headline"],
                    ["keywords", "Keywords"],
                    ["readability", "Readability"],
                  ].map(([key, lbl]) => (
                    <div className="score" key={key}>
                      <div className="num" style={{ color: scoreColor(data.scores[key] ?? 0) }}>
                        {data.scores[key] ?? "—"}
                      </div>
                      <div className="lbl">{lbl}</div>
                    </div>
                  ))}
                </div>
              )}

              {data.detectedTopic && (
                <div className="block">
                  <h3>Your story is about</h3>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                    <strong>{data.detectedTopic}</strong>
                  </p>
                </div>
              )}

              {/* HEADLINES */}
              {data.headlines?.length > 0 && (
                <div className="block">
                  <h3>Better headlines</h3>
                  {data.headlines.map((h, i) => {
                    const n = h.charCount || (h.title ? h.title.length : 0);
                    return (
                      <div className="headline-card" key={i}>
                        <div className="ht">
                          <span className="title">{h.title}</span>
                          <span className={`charcount ${ccClass(n)}`}>{n} ch</span>
                        </div>
                        {h.rationale && <div className="why">{h.rationale}</div>}
                        <div style={{ marginTop: 8 }}>
                          <Copyable text={h.title}>Copy headline</Copyable>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* KEYWORDS */}
              {k && (
                <div className="block">
                  <h3>Keywords</h3>
                  {k.primary && (
                    <>
                      <div style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 6px", fontWeight: 600 }}>MAIN KEYWORD</div>
                      <div className="chips">
                        <span className="chip primary">{k.primary}</span>
                      </div>
                    </>
                  )}
                  {/* keyword groups, ordered by importance */}
                  {k.secondary?.length > 0 && <Group label="Secondary" items={k.secondary} />}
                  {k.semantic?.length > 0 && <Group label="Semantic / LSI" items={k.semantic} />}
                  {k.questions?.length > 0 && (
                    <Group label="Questions (FAQ / AI Overviews)" items={k.questions} />
                  )}
                  {k.longTail?.length > 0 && <Group label="Long-tail" items={k.longTail} />}
                  {k.usageTip && <div className="why" style={{ marginTop: 12 }}>{k.usageTip}</div>}
                  {allKeywords && (
                    <div style={{ marginTop: 10 }}>
                      <Copyable text={allKeywords}>Copy all keywords</Copyable>
                    </div>
                  )}
                </div>
              )}

              {/* META + SLUG */}
              {data.metaDescription && (
                <div className="block">
                  <h3>Search snippet ({data.metaDescription.length} ch)</h3>
                  <div className="meta-desc">{data.metaDescription}</div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Copyable text={data.metaDescription}>Copy snippet</Copyable>
                    {data.slug && <Copyable text={data.slug}>Copy URL: /{data.slug}</Copyable>}
                  </div>
                </div>
              )}

              {/* SNIPPET / OPENING TIP */}
              {data.snippetTip && (
                <div className="block">
                  <h3>Opening line tip</h3>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>{data.snippetTip}</p>
                </div>
              )}

              {/* PRE-PUBLISH CHECKLIST */}
              {data.quickChecks?.length > 0 && (
                <div className="block">
                  <h3>Before you publish</h3>
                  <ul className="recs">
                    {data.quickChecks.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer>Built by Ossai Samuel</footer>
    </div>
  );
}

function Group({ label, items }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "14px 0 6px", fontWeight: 600 }}>
        {label.toUpperCase()}
      </div>
      <div className="chips">
        {items.map((it, i) => (
          <span className="chip" key={i}>{it}</span>
        ))}
      </div>
    </>
  );
}
