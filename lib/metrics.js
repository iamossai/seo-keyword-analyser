// Fast, dependency-free client-side text metrics (instant, no API needed).

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return word.length ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

export function analyzeText(text) {
  const clean = (text || "").trim();
  const words = clean ? clean.match(/[A-Za-z0-9'’-]+/g) || [] : [];
  const wordCount = words.length;
  const sentences = clean ? (clean.match(/[.!?]+(?:\s|$)/g) || []).length || (wordCount ? 1 : 0) : 0;
  const chars = clean.length;
  const readingTime = Math.max(1, Math.round(wordCount / 225)); // ~225 wpm

  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  let flesch = 0;
  if (wordCount > 0 && sentences > 0) {
    flesch =
      206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  }
  flesch = Math.max(0, Math.min(100, Math.round(flesch)));

  // Heading detection: markdown (#, ##) or short standalone Title Case lines
  const lines = clean.split(/\r?\n/);
  let h1 = 0,
    h2 = 0,
    h3plus = 0;
  for (const lnRaw of lines) {
    const ln = lnRaw.trim();
    if (!ln) continue;
    const md = ln.match(/^(#{1,6})\s+/);
    if (md) {
      const level = md[1].length;
      if (level === 1) h1++;
      else if (level === 2) h2++;
      else h3plus++;
      continue;
    }
    // heuristic: short line, no ending punctuation, looks like a heading
    if (ln.length <= 70 && !/[.:;,!?]$/.test(ln) && ln.split(/\s+/).length <= 9 && /[A-Za-z]/.test(ln)) {
      // crude — only count if Title Case-ish
      const wordsInLine = ln.split(/\s+/);
      const capped = wordsInLine.filter((w) => /^[A-Z]/.test(w)).length;
      if (capped / wordsInLine.length >= 0.5) h2++;
    }
  }

  const paragraphs = clean ? clean.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;

  let readabilityLabel = "Very difficult";
  if (flesch >= 80) readabilityLabel = "Very easy";
  else if (flesch >= 70) readabilityLabel = "Easy";
  else if (flesch >= 60) readabilityLabel = "Standard";
  else if (flesch >= 50) readabilityLabel = "Fairly difficult";
  else if (flesch >= 30) readabilityLabel = "Difficult";

  return {
    wordCount,
    chars,
    sentences,
    paragraphs,
    readingTime,
    flesch,
    readabilityLabel,
    headings: { h1, h2, h3plus, total: h1 + h2 + h3plus },
  };
}
