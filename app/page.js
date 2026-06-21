"use client";

import { useMemo, useState } from "react";
import { analyzeText } from "../lib/metrics";

const SAMPLE = `Remote work has changed how teams operate. Many companies now let employees work from home. This article looks at the benefits and the challenges.

Working remotely can save time on commuting. It also gives people more flexibility. But it can make collaboration harder. Some workers feel isolated.

Tools like video calls and chat apps help teams stay connected. Managers need to set clear expectations. Trust is important. With the right approach, remote teams can be very productive.`;

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
      setError("Please paste an article of at least ~80 characters.");
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
    ? [k?.primary, ...(k?.secondary || []), ...(k?.semantic || []), ...(k?.longTail || [])]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="container">
      <div className="header">
        <span className="badge"><span className="dot" /> AI-powered on-page SEO</span>
        <h1>SEO Keyword Analyser</h1>
        <p className="subtitle">
          Paste an article and get an optimized headline, a complete keyword strategy, and concrete
          structure fixes — graded against modern 2026 on-page SEO standards.
        </p>
      </div>

      <div className="grid">
        {/* INPUT */}
        <div className="panel">
          <h2>Your article</h2>
          <p className="hint">Paste the full article text (plain text or markdown headings).</p>
          <textarea
            value={article}
            placeholder="Paste your article here…"
            onChange={(e) => setArticle(e.target.value)}
          />
          <div className="input-meta">
            <span>
              {metrics.wordCount} words · {metrics.readingTime} min read · {metrics.headings.total} headings
            </span>
            <span>
              Readability: {metrics.flesch} ({metrics.readabilityLabel})
            </span>
          </div>

          <div className="controls">
            <input
              type="text"
              value={focus}
              placeholder="Optional: target/focus keyword"
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>

          <div className="actions">
            <button onClick={analyze} disabled={loading}>
              {loading ? "Analyzing…" : "Analyze SEO"}
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
          <h2>SEO report</h2>
          <p className="hint">
            {provider ? `Generated with ${provider}.` : "Recommendations appear here after analysis."}
          </p>

          {!data && !loading && !error && (
            <div className="placeholder">
              <p>Paste an article and click <strong>Analyze SEO</strong>.</p>
              <p style={{ fontSize: 13 }}>
                You’ll get 4 headline options, primary/secondary/semantic/question keywords, a meta
                description, structure fixes, a recommended outline, content gaps, and scores.
              </p>
            </div>
          )}

          {loading && (
            <div className="placeholder">
              <div className="spinner" />
              <p className="loadnote">Running the SEO analysis…</p>
            </div>
          )}

          {error && (
            <div className="error">
              <strong>Couldn’t analyze.</strong>
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
                    ["structure", "Structure"],
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

              {(data.detectedTopic || data.searchIntent) && (
                <div className="block">
                  <h3>Detected intent</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                    <strong>{data.detectedTopic}</strong>
                    {data.searchIntent ? ` · ${data.searchIntent} intent` : ""}
                  </p>
                </div>
              )}

              {/* HEADLINES */}
              {data.headlines?.length > 0 && (
                <div className="block">
                  <h3>Suggested headlines</h3>
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

              {/* META + SLUG */}
              {data.metaDescription && (
                <div className="block">
                  <h3>Meta description ({data.metaDescription.length} ch)</h3>
                  <div className="meta-desc">{data.metaDescription}</div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <Copyable text={data.metaDescription}>Copy meta</Copyable>
                    {data.slug && <Copyable text={data.slug}>Copy slug: /{data.slug}</Copyable>}
                  </div>
                </div>
              )}

              {/* KEYWORDS */}
              {k && (
                <div className="block">
                  <h3>Keyword strategy</h3>
                  <div className="copy-row">
                    <Copyable text={allKeywords}>Copy all keywords</Copyable>
                  </div>
                  {k.primary && (
                    <>
                      <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 6px" }}>PRIMARY</div>
                      <div className="chips">
                        <span className="chip primary">{k.primary}</span>
                      </div>
                      {k.primaryDensityComment && (
                        <div className="why" style={{ marginTop: 6 }}>{k.primaryDensityComment}</div>
                      )}
                    </>
                  )}
                  {k.secondary?.length > 0 && (
                    <Group label="Secondary" items={k.secondary} />
                  )}
                  {k.semantic?.length > 0 && (
                    <Group label="Semantic / LSI" items={k.semantic} />
                  )}
                  {k.questions?.length > 0 && (
                    <Group label="Questions (FAQ / AI Overviews)" items={k.questions} />
                  )}
                  {k.longTail?.length > 0 && (
                    <Group label="Long-tail" items={k.longTail} />
                  )}
                </div>
              )}

              {/* STRUCTURE */}
              {data.structure?.length > 0 && (
                <div className="block">
                  <h3>Structure recommendations</h3>
                  <ul className="recs">
                    {data.structure.map((s, i) => (
                      <li key={i} className={`sev-${(s.severity || "low").toLowerCase()}`}>
                        <span className="tag">{s.type}</span>
                        <strong>{s.issue}</strong> — {s.recommendation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* OUTLINE */}
              {data.suggestedOutline && (
                <div className="block">
                  <h3>Recommended outline</h3>
                  <pre className="outline">{data.suggestedOutline}</pre>
                  <Copyable text={data.suggestedOutline}>Copy outline</Copyable>
                </div>
              )}

              {/* CONTENT GAPS */}
              {data.contentGaps?.length > 0 && (
                <div className="block">
                  <h3>Content gaps to fill</h3>
                  <ul className="recs">
                    {data.contentGaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* QUICK WINS */}
              {data.quickWins?.length > 0 && (
                <div className="block">
                  <h3>Quick wins (highest impact)</h3>
                  <ul className="recs">
                    {data.quickWins.map((g, i) => (
                      <li key={i} className="sev-high">{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.snippetTip && (
                <div className="block">
                  <h3>Featured snippet / AI Overview</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{data.snippetTip}</p>
                </div>
              )}

              {data.eeat && (
                <div className="block">
                  <h3>E-E-A-T signals</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{data.eeat}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer>
        Built with Next.js · AI provider configured via environment variables · No article text is
        stored.
      </footer>
    </div>
  );
}

function Group({ label, items }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 6px" }}>{label.toUpperCase()}</div>
      <div className="chips">
        {items.map((it, i) => (
          <span className="chip" key={i}>{it}</span>
        ))}
      </div>
    </>
  );
}
