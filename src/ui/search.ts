import { ACTIONS, type Action, availableKnobs, type Knob, type Option } from "./catalog";

export interface Result {
  knob: Knob;
  /** The value to set, or null to open the knob's editor. */
  option: Option | null;
  score: number;
}

/** How many results a query shows at most. */
const LIMIT = 40;

/** A typed value scores under a word that matches outright, so the catalog wins ties. */
const TYPED = 2.5;

/** Lower case words, a leading plus dropped, so `+2d` and `2d` meet. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/_,·]+/)
    .map((word) => word.replace(/^\+/, ""))
    .filter((word) => word !== "");
}

/** The query as typed, split on spaces, each piece with its words. */
interface Token {
  raw: string;
  words: string[];
}

function tokenize(query: string): Token[] {
  return query
    .trim()
    .split(/\s+/)
    .map((raw) => ({ raw, words: words(raw) }))
    .filter((token) => token.words.length > 0);
}

/** 3 for a whole word, 2 for the start of one, 1 for the middle of a long one, else 0. */
function wordScore(word: string, pool: readonly string[]): number {
  let best = 0;
  for (const candidate of pool) {
    if (candidate === word) return 3;
    if (candidate.startsWith(word)) best = Math.max(best, 2);
    else if (word.length >= 3 && candidate.includes(word)) best = Math.max(best, 1);
  }
  return best;
}

/** A token scores by its weakest word, so every word has to land. */
function tokenScore(token: Token, pool: readonly string[]): number {
  return Math.min(...token.words.map((word) => wordScore(word, pool)));
}

const knobWords = new WeakMap<Knob, string[]>();
const optionWords = new WeakMap<Option, string[]>();

function namesOf(knob: Knob): string[] {
  let pool = knobWords.get(knob);
  if (!pool) {
    pool = [knob.label, ...knob.aliases].flatMap(words);
    knobWords.set(knob, pool);
  }
  return pool;
}

function valuesOf(option: Option): string[] {
  let pool = optionWords.get(option);
  if (!pool) {
    pool = [option.label, option.long ?? "", ...(option.aliases ?? [])].flatMap(words);
    optionWords.set(option, pool);
  }
  return pool;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Best score first, the catalog's order between equals. */
function rank<T extends { score: number }>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.score - a.entry.score || a.index - b.index)
    .map(({ entry }) => entry);
}

/** One knob's results: the knob itself, its values, and a value typed out in full. */
function matchKnob(knob: Knob, tokens: Token[]): Result[] {
  const names = namesOf(knob);
  const named = tokens.map((token) => tokenScore(token, names));
  const results: Result[] = [];
  if (named.every((score) => score > 0)) results.push({ knob, option: null, score: sum(named) });
  const seen = new Set<string>();
  const consider = (option: Option, needsValue: boolean) => {
    const values = valuesOf(option);
    let hitValue = false;
    const scores = tokens.map((token, index) => {
      const value = tokenScore(token, values);
      if (value > 0) hitValue = true;
      return Math.max(value, named[index] ?? 0);
    });
    if (scores.some((score) => score === 0) || (needsValue && !hitValue)) return;
    seen.add(option.value);
    // A value found only through the knob's name follows the knob itself.
    results.push({ knob, option, score: sum(scores) - (hitValue ? 0 : 0.5) });
  };
  for (const option of knob.options) consider(option, false);
  for (const option of knob.extra?.() ?? []) consider(option, true);
  if (knob.parse) {
    const free = tokens.filter((_, index) => !((named[index] ?? 0) > 0));
    const namedAny = free.length < tokens.length;
    if (free.length > 0 && (namedAny || knob.bare)) {
      const option = knob.parse(free.map((token) => token.raw).join(" "));
      if (option && !seen.has(option.value)) {
        const score = sum(named.filter((value) => value > 0)) + TYPED * free.length;
        results.push({ knob, option, score });
      }
    }
  }
  return results;
}

/**
 * The knobs and values a query finds, best first. Every word of the query has
 * to land on a knob's name, one of its values or their aliases, a whole word
 * scoring over the start of one. A value typed out in full (`500`, `+3d`,
 * `pt-BR`, `Europe/Paris`) is offered as well, under the values the catalog has.
 */
export function search(query: string, knobs: readonly Knob[] = availableKnobs()): Result[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const best = new Map<string, Result>();
  for (const result of rank(knobs.flatMap((knob) => matchKnob(knob, tokens)))) {
    const key = `${result.knob.id}:${result.option?.value ?? ""}`;
    if (!best.has(key)) best.set(key, result);
  }
  return Array.from(best.values()).slice(0, LIMIT);
}

/** The actions a query finds, by name or alias, every word of it landing. */
export function searchActions(query: string, actions: readonly Action[] = ACTIONS): Action[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return actions.filter((action) => {
    const pool = [action.label, ...action.aliases].flatMap(words);
    return tokens.every((token) => tokenScore(token, pool) > 0);
  });
}

/**
 * The values a list editor shows for its filter: the knob's own values that
 * match, then those search reaches, then one typed out in full. An empty
 * filter shows the knob's own values.
 */
export function filterOptions(knob: Knob, filter: string): Option[] {
  const tokens = tokenize(filter);
  if (tokens.length === 0) return [...knob.options];
  const scored: { option: Option; score: number }[] = [];
  for (const option of [...knob.options, ...(knob.extra?.() ?? [])]) {
    const values = valuesOf(option);
    const scores = tokens.map((token) => tokenScore(token, values));
    if (scores.every((score) => score > 0)) scored.push({ option, score: sum(scores) });
  }
  const typed = knob.parse?.(filter);
  if (typed && !scored.some((entry) => entry.option.value === typed.value)) {
    scored.push({ option: typed, score: TYPED * tokens.length });
  }
  return rank(scored)
    .slice(0, LIMIT)
    .map((entry) => entry.option);
}

/** What a result reads as: the knob's name, then the value. */
export function resultText(result: Result): { knob: string; value: string } {
  const value = result.option ? (result.option.long ?? result.option.label) : "";
  return { knob: result.knob.label, value };
}
