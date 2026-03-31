#!/usr/bin/env node
// @ts-check
//
// Scrapes identifier-like tokens from the GLSL specification sources.
//
// Collects all .adoc files from specification/chapters/ and all
// <vendor>/<extension>.txt files from specification/extensions/, then
// runs format-specific scrapers to extract anything that looks like a
// GLSL identifier. The result is a superset of what builtin.js,
// keywords.js and extensions.js contain — false positives are expected
// and the output is meant for manual review, not direct consumption.
//
// Usage:
//   node scripts/scrape_identifiers.js [options] [specification-dir]
//
// Options:
//   --list-handled    Include identifiers already in our JS registries
//                     (builtin.js, keywords.js, extensions.js).
//                     By default these are excluded from output.
//   --list-unhandled  Instead of scraping, list identifiers present in
//                     our JS registries but NOT found by the scraper.
//                     Useful for auditing whether the scraper's filters
//                     are too aggressive.
//   --file <name>     Only process the file with matching basename
//                     (with or without extension) from discovered files.

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const LIST_HANDLED = args.includes('--list-handled');
const LIST_UNHANDLED = args.includes('--list-unhandled');
const FILE_FILTER = (() => {
  const idx = args.indexOf('--file');
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
})();
const SPEC_DIR =
  args.find((a) => !a.startsWith('--') && a !== FILE_FILTER) ||
  path.join(__dirname, '..', 'specification');

/** Relative paths (from SPEC_DIR) of chapter files to skip. */
const CHAPTER_BLACKLIST = new Set([
  'chapters/preamble.adoc',
  'chapters/acknowledgements.adoc',
  'chapters/grammar.adoc',
  'chapters/references.adoc',
  'chapters/introduction.adoc',
]);

/** Directories under extensions/ that are not vendor directories. */
const EXTENSION_DIR_BLACKLIST = new Set(['extension_headers']);

/** Known GL extension vendor suffixes. */
const VENDOR_SUFFIXES = [
  'AMD', 'ARB', 'ARM', 'EXT', 'GOOGLE', 'HUAWEI', 'INTEL',
  'KHR', 'MESA', 'NV', 'NVX', 'OVR', 'QCOM',
];

/** Bare vendor names are not GLSL identifiers. */
const VENDOR_SUFFIX_SET = new Set(VENDOR_SUFFIXES);

/** Matches a word ending with any known vendor suffix. */
const VENDOR_SUFFIX_RE = new RegExp(
  `(?:${VENDOR_SUFFIXES.join('|')})$`,
);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** @returns {string[]} Absolute paths of chapter .adoc files to scrape. */
function discoverChapters() {
  const dir = path.join(SPEC_DIR, 'chapters');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.adoc'))
    .filter((f) => !CHAPTER_BLACKLIST.has(`chapters/${f}`))
    .sort()
    .map((f) => path.join(dir, f));
}

/** @returns {string[]} Absolute paths of extension .txt files to scrape. */
function discoverExtensions() {
  const dir = path.join(SPEC_DIR, 'extensions');
  /** @type {string[]} */
  const results = [];
  for (const vendor of fs.readdirSync(dir).sort()) {
    if (EXTENSION_DIR_BLACKLIST.has(vendor)) continue;
    const vendorDir = path.join(dir, vendor);
    if (!fs.statSync(vendorDir).isDirectory()) continue;
    for (const file of fs.readdirSync(vendorDir).sort()) {
      if (file.endsWith('.txt')) {
        results.push(path.join(vendorDir, file));
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Identifier extraction helpers
// ---------------------------------------------------------------------------

/**
 * Matches a single C-like identifier: letter or underscore followed by
 * alphanumerics / underscores.
 */
const IDENT_RE = /[a-zA-Z_][a-zA-Z0-9_]*/g;

/**
 * @typedef {{ line: number, id: string }} IdentHit
 */

/**
 * Extracts all identifier-like tokens from raw text with line numbers.
 *
 * @param {string} text
 * @returns {IdentHit[]}
 */
function _extractIdentsWithLines(text) { // eslint-disable-line no-unused-vars
  /** @type {IdentHit[]} */
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(IDENT_RE)) {
      hits.push({line: i + 1, id: m[0]});
    }
  }
  return hits;
}

/**
 * Extracts all identifier-like tokens from raw text (no line tracking).
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function _extractIdents(text) { // eslint-disable-line no-unused-vars
  const set = new Set();
  for (const m of text.matchAll(IDENT_RE)) {
    set.add(m[0]);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Adoc scraper
// ---------------------------------------------------------------------------

/**
 * Scrapes identifier-like tokens from an AsciiDoc chapter file.
 *
 * Identifiers appear in several contexts:
 *   - Bold markup:    *vec4*, *float*
 *   - Italic markup:  _gl_Position_
 *   - Code blocks:    [source,glsl]\n----\n...\n----
 *   - Table cells:    | *sampler2D* +
 *
 * We extract from these marked-up contexts rather than from raw prose to
 * cut down on English-word noise while still capturing the identifiers
 * the spec highlights.
 *
 * @param {string} content  Full file content.
 * @returns {IdentHit[]}
 */
function scrapeAdoc(content) {
  /** @type {IdentHit[]} */
  const hits = [];

  /**
   * Returns the 1-based line number for a character offset in content.
   *
   * @param {number} offset
   * @returns {number}
   */
  const lineAt = (() => {
    /** @type {number[]} */
    const starts = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') starts.push(i + 1);
    }
    return (/** @type {number} */ offset) => {
      let lo = 0; let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    };
  })();

  // 1. Bold markup: *word* (but not ** which is adoc bold delimiters)
  for (const m of content.matchAll(/\*([a-zA-Z_][a-zA-Z0-9_]*)\*/g)) {
    hits.push({line: lineAt(/** @type {number} */ (m.index)), id: m[1]});
  }

  // 2. Italic markup: _word_
  for (const m of content.matchAll(/(?<![a-zA-Z0-9])_([a-zA-Z_][a-zA-Z0-9_]*)_(?![a-zA-Z0-9])/g)) {
    hits.push({line: lineAt(/** @type {number} */ (m.index)), id: m[1]});
  }

  // 3. Code blocks between ---- delimiters.
  for (const m of content.matchAll(/^----\s*\n([\s\S]*?)\n----/gm)) {
    const blockStart = /** @type {number} */ (m.index);
    const headerLen = m[0].indexOf(m[1]);
    const blockLines = m[1].split('\n');
    const firstLine = lineAt(blockStart + headerLen);
    for (let i = 0; i < blockLines.length; i++) {
      for (const im of blockLines[i].matchAll(IDENT_RE)) {
        hits.push({line: firstLine + i, id: im[0]});
      }
    }
  }

  // 4. Inline monospace: `word` or +word+
  for (const m of content.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g)) {
    hits.push({line: lineAt(/** @type {number} */ (m.index)), id: m[1]});
  }
  for (const m of content.matchAll(/\+([a-zA-Z_][a-zA-Z0-9_]*)\+/g)) {
    hits.push({line: lineAt(/** @type {number} */ (m.index)), id: m[1]});
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Extension .txt scraper
// ---------------------------------------------------------------------------

/**
 * Returns the set of 1-based line numbers that belong to sentence
 * paragraphs — runs of prose ending with a period.
 *
 * A paragraph is a sequence of non-blank lines where continuation lines
 * start with whitespace. When the joined paragraph contains a sentence
 * (two or more words ending with a period), ALL of its constituent
 * lines are marked as sentence lines.
 *
 * Lines marked as sentence lines are skipped during the second pass of
 * txt extraction, but the first pass still reads them for strong-shape
 * identifiers.
 *
 * @param {string[]} lines  File content split by newline.
 * @returns {Set<number>}   Set of 1-based line numbers that are sentences.
 */
function findSentenceLines(lines) {
  /** @type {Set<number>} */
  const sentenceLines = new Set();
  /** @type {number[]} line indices (0-based) in the current paragraph */
  let paraIndices = [];

  /**
   *
   */
  function flushParagraph() {
    if (paraIndices.length === 0) return;
    const joined = paraIndices.map((i) => lines[i]).join(' ');
    // If the paragraph contains a sentence (two+ words ending with a
    // period), mark all its lines.
    if (/[^\s.]+(?:\s+[^\s.]+)+\./.test(joined)) {
      for (const i of paraIndices) sentenceLines.add(i + 1);
    }
    paraIndices = [];
  }

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*$/.test(lines[i])) {
      flushParagraph();
    } else if (/^[ \t]/.test(lines[i]) && paraIndices.length > 0) {
      paraIndices.push(i);
    } else {
      flushParagraph();
      paraIndices.push(i);
    }
  }
  flushParagraph();

  return sentenceLines;
}

/**
 * Scrapes identifier-like tokens from an extension .txt file.
 *
 * Extension specs are plain-text with indentation-based structure. GLSL
 * identifiers appear in code-like declarations, SPIR-V mapping tables,
 * and section headers, but the majority of the text is English prose
 * organised into sentences ending with periods.
 *
 * Two-pass extraction:
 *  1. From ALL lines, extract tokens with a strong GLSL shape (gl_*,
 *     camelCase, vendor suffixes, etc.) — these are unambiguously not
 *     English even when embedded in sentences.
 *  2. From non-sentence lines only, extract all remaining identifiers.
 *
 * @param {string} content  Full file content.
 * @returns {IdentHit[]}
 */
function scrapeTxt(content) {
  const lines = content.split('\n');
  const sentenceLines = findSentenceLines(lines);
  /** @type {Map<string, number>} id → first line seen */
  const seen = new Map();

  // Strip parenthesized content — these are prose asides, not code.
  const stripped = lines.map((l) => l.replace(/\([^)]*\)/g, ''));

  // Pass 1: rescue strong-shape identifiers from ALL lines.
  for (let i = 0; i < stripped.length; i++) {
    for (const m of stripped[i].matchAll(IDENT_RE)) {
      if (hasStrongGLSLShape(m[0]) && !seen.has(m[0])) {
        seen.set(m[0], i + 1);
      }
    }
  }

  // Pass 2: extract everything from non-sentence lines.
  for (let i = 0; i < stripped.length; i++) {
    if (sentenceLines.has(i + 1)) continue;
    for (const m of stripped[i].matchAll(IDENT_RE)) {
      if (!seen.has(m[0])) {
        seen.set(m[0], i + 1);
      }
    }
  }

  /** @type {IdentHit[]} */
  const hits = [];
  for (const [id, line] of seen) {
    hits.push({line, id});
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Noise filtering
// ---------------------------------------------------------------------------

/**
 * Very common English / AsciiDoc / spec boilerplate words that are not
 * GLSL identifiers. This is intentionally conservative — we would rather
 * keep a false positive than drop a real identifier.
 */
const NOISE = new Set([
  // Single-letter / trivially short
  // NOTE: "in" is a GLSL keyword but also extremely common English — kept
  // OUT of this list so the scraper finds it.
  'a', 'A', 'an', 'An', 'as', 'As', 'at', 'At', 'be', 'Be', 'by', 'By',
  'do', 'Do', 'go', 'Go', 'if', 'If', 'is', 'Is', 'it', 'It',
  'no', 'No', 'of', 'Of', 'on', 'On', 'or', 'Or', 'so', 'So', 'to', 'To',
  'up', 'Up', 'we', 'We',
  // Common English words unlikely to be identifiers
  // NOTE: words that double as GLSL keywords/builtins are deliberately
  // kept OUT of this list: all, any, equal, in, not (builtins);
  // cross, false, float, length, match, offset, output, patch, return,
  // round, sample, shared, struct (keywords/builtins).
  'also', 'and', 'are', 'been', 'but', 'can', 'did', 'each',
  'for', 'from', 'get', 'had', 'has', 'have', 'her', 'him', 'his', 'how',
  'its', 'just', 'let', 'may', 'more', 'most', 'must', 'new', 'nor',
  'now', 'off', 'old', 'one', 'only', 'our', 'own', 'per', 'put', 'ran',
  'run', 'say', 'she', 'six', 'ten', 'the', 'The', 'too', 'two',
  'use', 'via', 'was', 'way', 'who', 'why', 'win', 'won', 'yet', 'you',
  'able', 'about', 'above', 'added', 'adds', 'after', 'also', 'been',
  'both', 'case', 'cast', 'come', 'does', 'done', 'down', 'else', 'even',
  'from', 'full', 'give', 'goes', 'gone', 'good', 'half', 'here', 'high',
  'hold', 'into', 'just', 'keep', 'kept', 'know', 'last', 'left', 'like',
  'line', 'list', 'look', 'made', 'make', 'many', 'mean', 'mode', 'more',
  'most', 'much', 'must', 'name', 'need', 'next', 'note', 'Note', 'once',
  'only', 'open', 'over', 'part', 'pass', 'past', 'pick', 'read', 'rest',
  'rule', 'runs', 'said', 'same', 'seen', 'show', 'side', 'size', 'some',
  'such', 'sure', 'take', 'tell', 'text', 'than', 'that', 'them', 'then',
  'they', 'this', 'This', 'thus', 'time', 'true', 'turn', 'type', 'upon',
  'used', 'uses', 'very', 'want', 'well', 'were', 'what', 'when', 'When',
  'will', 'with', 'word', 'work', 'your',
  'above', 'after', 'allow', 'along', 'array', 'avoid', 'being', 'below',
  'block', 'calls', 'cause', 'could', 'count', 'depth', 'early',
  'error', 'every', 'exist', 'extra', 'final', 'first',
  'fixed', 'found', 'front', 'given', 'going', 'group', 'hence',
  'inner', 'later', 'least', 'level', 'limit', 'local',
  'might', 'named', 'never', 'order', 'other', 'outer', 'owned',
  'place', 'plane', 'point', 'power', 'prior', 'range', 'right',
  'rules', 'scope', 'shall', 'since', 'space', 'stage',
  'start', 'state', 'still', 'store', 'taken', 'their', 'there', 'these',
  'those', 'three', 'times', 'total', 'track', 'under', 'union', 'until',
  'upper', 'using', 'valid', 'value', 'where', 'Where', 'which', 'while',
  'whose', 'would', 'write',
  'accept', 'access', 'across', 'always', 'amount', 'appear', 'before',
  'behave', 'bottom', 'called', 'cannot', 'change', 'choose', 'commit',
  'common', 'create', 'decode', 'define', 'effect', 'either', 'enable',
  'enough', 'entire', 'exists', 'expect', 'expose', 'extend', 'follow',
  'format', 'former', 'global', 'handle', 'having', 'higher', 'ignore',
  'inside', 'itself', 'larger', 'latest', 'latter', 'launch',
  'lookup', 'mapped', 'marker', 'member', 'method', 'modify',
  'namely', 'needed', 'newest', 'normal', 'notice', 'number', 'object',
  'obtain', 'origin', 'packed', 'prefix', 'rather',
  'reason', 'record', 'reduce', 'remain', 'remove', 'render', 'repeat',
  'report', 'result', 'review', 'second', 'select',
  'shader', 'should', 'simple', 'single', 'source', 'stored',
  'string', 'strike', 'suffix', 'supply', 'target', 'tested',
  'toggle', 'unlike', 'update', 'vertex', 'within',
  // Spec / AsciiDoc boilerplate
  'adoc', 'endif', 'ifdef', 'ifndef', 'GLSL', 'ESSL', 'OpenGL', 'Vulkan',
  'SPIR', 'section', 'Section', 'Chapter', 'chapter', 'Table', 'table',
  'paragraph', 'specification', 'Specification', 'extension', 'Extension',
  'revision', 'Revision', 'version', 'Version', 'behavior', 'Behavior',
  'description', 'Description', 'Overview', 'overview', 'Status', 'status',
  'Contact', 'contact', 'Contributors', 'contributors', 'Dependencies',
  'dependencies', 'Interactions', 'interactions', 'Issues', 'issues',
  'Errors', 'errors', 'History', 'history', 'None', 'none', 'Pending',
  'pending', 'Complete', 'complete', 'TBD', 'Syntax', 'syntax',
  'Meaning', 'meaning', 'Type', 'Returns', 'Modifications', 'Additions',
  'Mapping', 'undefined',
  // Git / build noise
  'Copyright', 'SPDX', 'License', 'Identifier',
]);

/**
 * Returns true if `word` has a shape that is distinctly GLSL-like and
 * unlikely to be an English word. Used by the txt scraper's first pass
 * to rescue identifiers from sentences before they are stripped.
 *
 * @param {string} word
 * @returns {boolean}
 */
function hasStrongGLSLShape(word) {
  if (/^gl_/i.test(word)) return true;
  if (/^GL_/.test(word)) return true;
  if (/_/.test(word)) return true;
  if (/\d/.test(word)) return true;
  if (/[a-z][A-Z]/.test(word)) return true;
  if (VENDOR_SUFFIX_RE.test(word)) return true;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(word)) return true;
  return false;
}

/**
 * Returns true if `word` looks like it could plausibly be a GLSL
 * identifier rather than an English word or AsciiDoc boilerplate.
 *
 * Heuristic — intentionally permissive:
 *  - Has a strong GLSL shape (gl_*, digits, underscores, camelCase,
 *    vendor suffixes, all-caps macros)
 *  - Is at least 2 characters and not in the noise list
 *
 * @param {string} word
 * @returns {boolean}
 */
function isPlausibleIdent(word) {
  if (word.length < 2) return false;
  if (NOISE.has(word)) return false;
  if (VENDOR_SUFFIX_SET.has(word)) return false;

  // SPIR-V instruction names (Op*) and extension names (SPV_*).
  if (/^Op[A-Z]/.test(word)) return false;
  if (/^SPV_/.test(word)) return false;

  // Single capitalized word (e.g. "Aaron", "Buffer", "Vertex") — these
  // are people names and section headers from extension txt files. Real
  // GLSL identifiers are either all-lowercase, camelCase, or ALL_CAPS.
  if (/^[A-Z][a-z]+$/.test(word)) return false;

  if (hasStrongGLSLShape(word)) return true;

  // Everything else that survived the noise set passes through.
  // Short lowercase words like "mix", "abs", "sin" are real builtins,
  // so we don't filter by length — the NOISE set handles English words.
  return true;
}

// ---------------------------------------------------------------------------
// Known identifiers from JS registries
// ---------------------------------------------------------------------------

/**
 * Collects every identifier string from builtin.js, keywords.js and
 * the extension name keys from extensions.js into a single Set.
 *
 * @returns {Set<string>}
 */
async function collectKnownIdents() {
  const rootDir = path.join(import.meta.dirname, '..');
  const builtins = (await import(path.join(rootDir, 'builtin.js'))).default;
  const {KEYWORDS} = await import(path.join(rootDir, 'keywords.js'));
  const EXTENSIONS = (await import(path.join(rootDir, 'extensions.js'))).default;

  const known = new Set();

  // Builtins: all.types/variables/constants/functions/macros
  for (const list of Object.values(builtins.all)) {
    if (Array.isArray(list)) for (const v of list) known.add(v);
  }

  // Keywords: all scopes × all categories
  for (const scope of [KEYWORDS.core, KEYWORDS.glsl, KEYWORDS.vulkan]) {
    for (const list of Object.values(scope)) {
      if (Array.isArray(list)) for (const v of list) known.add(v);
    }
  }
  for (const bucket of Object.values(KEYWORDS.extensions)) {
    for (const list of Object.values(bucket)) {
      if (Array.isArray(list)) for (const v of list) known.add(v);
    }
  }

  // Extension names themselves (GL_EXT_*, GL_NV_*, …)
  for (const name of Object.keys(EXTENSIONS)) {
    known.add(name);
  }

  return known;
}

// ---------------------------------------------------------------------------
// SPIR-V / prose noise filter (applied only to unknown identifiers)
// ---------------------------------------------------------------------------

/**
 * Returns true if `word` is almost certainly SPIR-V noise or prose rather
 * than a GLSL identifier. Only applied to identifiers NOT already in our
 * registries, so it can be aggressive without risking false negatives.
 *
 * @param {string} word
 * @returns {boolean}
 */
function isSpirvOrProseNoise(word) {
  // SPIR-V instruction names: Op*
  if (/^Op[A-Z]/.test(word)) return true;

  // Single capitalized word: people names, section headers.
  if (/^[A-Z][a-z]+$/.test(word)) return true;

  // PascalCase with vendor suffix but no gl_/GL_ prefix: SPIR-V enum
  // values (e.g. CullBackFacingTrianglesKHR, RayTmaxKHR).
  if (
    /^[A-Z]/.test(word) &&
    !/^gl_/i.test(word) &&
    !/^GL_/.test(word) &&
    VENDOR_SUFFIX_RE.test(word) &&
    /[a-z]/.test(word)
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * @typedef {{ file: string, line: number }} Location
 */

/**
 * Scrapes all spec files and returns the filtered identifier→location map.
 * Each identifier maps to its first occurrence location.
 *
 * @returns {{ chapters: number, extensions: number, all: Map<string, Location> }}
 */
function scrape() {
  let chapters = discoverChapters();
  let extensions = discoverExtensions();

  if (FILE_FILTER) {
    const match = (/** @type {string} */ f) =>
      path.basename(f, path.extname(f)) === FILE_FILTER ||
      path.basename(f) === FILE_FILTER;
    chapters = chapters.filter(match);
    extensions = extensions.filter(match);
  }

  // Collect extension names from .txt filenames (e.g. "GL_EXT_foo")
  // and their unprefixed variants (e.g. "EXT_foo") so cross-references
  // to other extensions are excluded from output.
  const extensionNames = new Set();
  for (const f of extensions) {
    const name = path.basename(f, '.txt');
    extensionNames.add(name);
    extensionNames.add(name.replace(/^GL(?:SL)?_/, ''));
  }

  /** @type {Map<string, Location>} identifier → first occurrence */
  const all = new Map();

  for (const file of chapters) {
    const label = path.relative(SPEC_DIR, file);
    const content = fs.readFileSync(file, 'utf-8');
    for (const hit of scrapeAdoc(content)) {
      if (!isPlausibleIdent(hit.id)) continue;
      if (extensionNames.has(hit.id)) continue;
      if (!all.has(hit.id)) all.set(hit.id, {file: label, line: hit.line});
    }
  }

  for (const file of extensions) {
    const label = path.relative(SPEC_DIR, file);
    const content = fs.readFileSync(file, 'utf-8');
    for (const hit of scrapeTxt(content)) {
      if (!isPlausibleIdent(hit.id)) continue;
      if (extensionNames.has(hit.id)) continue;
      if (!all.has(hit.id)) all.set(hit.id, {file: label, line: hit.line});
    }
  }

  return {chapters: chapters.length, extensions: extensions.length, all, extensionNames};
}

/**
 *
 */
async function main() {
  const known = await collectKnownIdents();
  const {chapters, extensions, all, extensionNames} = scrape();

  if (LIST_UNHANDLED) {
    // Show identifiers in our registries that the scraper did NOT find.
    // Extension names from filenames count as "found" for this check.
    const scraped = new Set([...all.keys(), ...extensionNames]);
    const missing = [...known].filter((id) => !scraped.has(id)).sort();
    console.log(`# Identifiers in JS registries but not found by scraper`);
    console.log(`# Total: ${missing.length} / ${known.size}`);
    console.log();
    for (const id of missing) {
      console.log(id);
    }
    return;
  }

  // Default: exclude already-handled identifiers unless --list-handled.
  // Also filter SPIR-V noise that shares shape with real GLSL identifiers
  // (PascalCase with vendor suffix, Op* instructions, single capitalized
  // words). These are never excluded from --list-unhandled because they
  // could be real identifiers our registries already track.
  /** @type {[string, Location][]} */
  let entries;
  if (LIST_HANDLED) {
    entries = [...all.entries()];
  } else {
    entries = [...all.entries()]
      .filter(([id]) => !known.has(id))
      .filter(([id]) => !isSpirvOrProseNoise(id));
  }

  // Sort by file path, then line number.
  entries.sort((a, b) =>
    a[1].file.localeCompare(b[1].file) || a[1].line - b[1].line,
  );

  const suffix = LIST_HANDLED ? '' : ' (excluding already-handled)';
  console.log(`# Scraped identifiers from ${chapters} chapter(s) and ${extensions} extension(s)${suffix}`);
  console.log(`# Total unique identifiers: ${entries.length}`);
  console.log();

  for (const [id, loc] of entries) {
    console.log(`${loc.file}:${loc.line}: found \`${id}\``);
  }
}

main();
