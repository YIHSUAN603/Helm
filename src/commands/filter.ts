// Fuzzy command filtering for the palette (pure, node-testable).
// Score per command: title prefix > word start > substring > subsequence;
// category/keywords match at a slight discount so title hits rank first.
import type { Command } from "./types";

function isSubsequence(query: string, text: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function scoreText(text: string, query: string): number {
  const t = text.toLowerCase();
  if (t.startsWith(query)) return 3;
  const idx = t.indexOf(query);
  if (idx > 0 && /[\s：:／/\-（(]/.test(t[idx - 1])) return 2;
  if (idx >= 0) return 1;
  return isSubsequence(query, t) ? 0.5 : 0;
}

function scoreCommand(c: Command, query: string): number {
  const extra = scoreText(`${c.category ?? ""} ${c.keywords ?? ""}`, query);
  return Math.max(scoreText(c.title, query), extra * 0.9);
}

/** Commands matching the query, best first; empty query keeps registry order. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  const scored = commands
    .map((c, i) => ({ c, i, score: scoreCommand(c, q) }))
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.c);
}
