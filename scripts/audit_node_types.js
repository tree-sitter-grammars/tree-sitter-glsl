#!/usr/bin/env node
/**
 * Exhaustive audit of grammar node types via src/node-types.json.
 *
 * Checks:
 *   1. Wrapper nodes — named nodes whose only possible child is a single
 *      named node (unnecessary nesting).
 *   2. Missing field names — nodes with multiple named children where some
 *      lack field labels.
 *   3. Coverage — parses all corpus source code with tree-sitter and
 *      compares actually-seen parent→child combinations against every
 *      combination node-types.json says is possible.
 *   4. Usefulness — greedy set-cover: which tests are redundant?
 *
 * Usage:
 *   node scripts/audit_node_types.js [options]
 *
 * Options:
 *   --coverage               report untested node-type combinations
 *   --usefulness [file]      greedy set-cover redundancy analysis;
 *                            if file given, show only that test's details
 *   --verbose                show per-rule detail in coverage report
 *
 * Examples:
 *   node scripts/audit_node_types.js --coverage
 *   node scripts/audit_node_types.js --usefulness
 *   node scripts/audit_node_types.js --usefulness test/corpus/vk_raytrace/compress.glsl.txt
 */

import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {xml2js} from 'xml-js';

const ROOT = path.resolve(import.meta.dirname, '..');
const nodeTypes = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/node-types.json'), 'utf8'),
);

// ── Argument parsing ─────────────────────────────────────────────────────

const ARGS = {
  coverage: false,
  usefulness: false,
  usefulnessFiles: [],
  verbose: false,
};

{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--coverage':
        ARGS.coverage = true;
        break;
      case '--usefulness': {
        ARGS.usefulness = true;
        while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          ARGS.usefulnessFiles.push(path.resolve(argv[++i]));
        }
        break;
      }
      case '--verbose':
        ARGS.verbose = true;
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        process.exit(1);
    }
  }
}

// Expression node types — any of these can appear in any expression slot.
// Testing every combination is combinatorial noise; we only care that at
// least ONE expression type was seen in each expression-accepting slot.
const EXPRESSION_TYPES = new Set([
  'assignment_expression',
  'binary_expression',
  'bool_literal',
  'comma_expression',
  'conditional_expression',
  'field_expression',
  'function_call',
  'identifier',
  'macro_invocation',
  'number_literal',
  'parenthesized_expression',
  'subscript_expression',
  'unary_expression',
  'update_expression',
]);

// Validate EXPRESSION_TYPES against node-types.json
const knownNamedTypes = new Set(
  nodeTypes.filter((n) => n.named).map((n) => n.type),
);
for (const t of EXPRESSION_TYPES) {
  if (!knownNamedTypes.has(t)) {
    console.error(
      `WARNING: EXPRESSION_TYPES contains "${t}" which does not exist in node-types.json — remove or update it`,
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Collect all named child types a node can contain.
 *
 * @param {object} node
 */
function collectNamedChildren(node) {
  const result = {fielded: {}, bare: []};
  if (node.fields) {
    for (const [name, field] of Object.entries(node.fields)) {
      result.fielded[name] = field.types.filter((t) => t.named);
    }
  }
  if (node.children) {
    result.bare = node.children.types.filter((t) => t.named);
  }
  return result;
}

/**
 *
 * @param {object} node
 */
function isSupertype(node) {
  return Array.isArray(node.subtypes) && node.subtypes.length > 0;
}

/**
 * Build supertype → Set<concrete_type> expansion map.
 * When node-types.json says a child can be `statement`, we expand
 * that to all concrete subtypes (`if_statement`, `for_statement`, etc.)
 * so the coverage check matches the concrete types seen in XML output.
 */
function buildSupertypeMap() {
  const map = {};
  for (const node of nodeTypes) {
    if (!isSupertype(node)) continue;
    map[node.type] = new Set(
      node.subtypes.filter((t) => t.named).map((t) => t.type),
    );
  }
  return map;
}

const SUPERTYPE_MAP = buildSupertypeMap();

/**
 * Recursively expand a type name to its concrete (non-supertype) types.
 *
 * @param {string} typeName
 */
function expandType(typeName) {
  if (!SUPERTYPE_MAP[typeName]) return new Set([typeName]);
  const result = new Set();
  for (const sub of SUPERTYPE_MAP[typeName]) {
    for (const concrete of expandType(sub)) result.add(concrete);
  }
  return result;
}

// ── Build expected combinations from node-types.json ─────────────────────

/**
 * Build expected combinations from node-types.json.
 *
 * Returns { parent_type: { combos: Set<string>, exprSlots: Set<string> } }
 *
 * `combos` contains every possible "child_type" or "field:child_type"
 *   with supertypes expanded to concrete types.
 * `collapsedSlots` maps slot names to Sets of concrete types that should
 *   be collapsed: the slot counts as ONE combo, covered if ANY type in
 *   the set was seen. This applies to:
 *   - Expression slots (all children are expression types)
 *   - Supertype slots (children expanded from a single supertype)
 */
function buildExpectedCombinations() {
  const expected = {};
  for (const node of nodeTypes) {
    if (!node.named || isSupertype(node)) continue;
    const combos = new Set();
    /** slot_name → { label, types: Set<concrete_type> } */
    const collapsedSlots = {};
    const {fielded, bare} = collectNamedChildren(node);

    for (const [fieldName, types] of Object.entries(fielded)) {
      const namedTypes = types.filter((t) => t.named);
      // Expand and collect all concrete types for this field
      const allConcrete = [];
      for (const t of namedTypes) {
        const concrete = expandType(t.type);
        if (concrete.size > 1) {
          // Supertype: collapse its expansion into one group
          for (const c of concrete) {
            combos.add(`${fieldName}:${c}`); allConcrete.push(c);
          }
          const key = `${fieldName}__${t.type}`;
          collapsedSlots[key] = {
            label: `${fieldName}:<${t.type}>`,
            field: fieldName,
            types: concrete,
          };
        } else {
          combos.add(`${fieldName}:${t.type}`);
          allConcrete.push(t.type);
        }
      }
      // Collapse expression types within the slot (even if mixed with
      // non-expression types). If 2+ expression types are present,
      // they form one collapsed group; non-expression types stay individual.
      const exprInSlot = allConcrete.filter((t) => EXPRESSION_TYPES.has(t));
      if (exprInSlot.length > 1) {
        const key = `${fieldName}__expr`;
        collapsedSlots[key] = {
          label: `${fieldName}:<expr>`,
          field: fieldName,
          types: new Set(exprInSlot),
        };
      }
    }

    // Bare children
    const namedBare = bare.filter((t) => t.named);
    const allBareConcrete = [];
    for (const t of namedBare) {
      const concrete = expandType(t.type);
      if (concrete.size > 1) {
        for (const c of concrete) {
          combos.add(c); allBareConcrete.push(c);
        }
        const key = `_bare__${t.type}`;
        collapsedSlots[key] = {
          label: `<${t.type}>`,
          field: '_bare',
          types: concrete,
        };
      } else {
        combos.add(t.type);
        allBareConcrete.push(t.type);
      }
    }
    const bareExprInSlot = allBareConcrete.filter((t) => EXPRESSION_TYPES.has(t));
    if (bareExprInSlot.length > 1) {
      const key = `_bare__expr`;
      collapsedSlots[key] = {
        label: `<expr>`,
        field: '_bare',
        types: new Set(bareExprInSlot),
      };
    }

    if (combos.size > 0) expected[node.type] = {combos, collapsedSlots};
  }
  return expected;
}

// ── Structural checks ───────────────────────────────────────────────────

/**
 *
 */
function runStructuralChecks() {
  const issues = [];

  for (const node of nodeTypes) {
    if (!node.named || isSupertype(node)) continue;
    const {fielded, bare} = collectNamedChildren(node);
    const fieldNames = Object.keys(fielded);
    const totalBareTypes = bare.length;

    // Wrapper nodes
    if (
      totalBareTypes === 1 &&
      fieldNames.length === 0 &&
      !node.children?.multiple
    ) {
      const child = bare[0];
      if (child.named) {
        issues.push({
          type: 'wrapper',
          message: `\`${node.type}\` always wraps a single \`${child.type}\``,
        });
      }
    }

    // Multiple bare named children without fields
    if (totalBareTypes > 1 && !node.children?.multiple) {
      issues.push({
        type: 'missing_fields',
        message: `\`${node.type}\` has ${totalBareTypes} bare named children (${bare.map((t) => t.type).join(', ')})`,
      });
    }

    // Mix of fielded and bare
    if (fieldNames.length > 0 && totalBareTypes > 0) {
      const bareNamed = bare.filter((t) => t.named);
      if (bareNamed.length > 0) {
        issues.push({
          type: 'mixed_fields',
          message: `\`${node.type}\` has fields [${fieldNames.join(', ')}] but also bare: ${bareNamed.map((t) => t.type).join(', ')}`,
        });
      }
    }
  }
  return issues;
}

// ── Corpus extraction ───────────────────────────────────────────────────

/**
 * Extract source code from a corpus .txt file (before the --- separator).
 *
 * @param {string} corpusPath
 */
function extractSource(corpusPath) {
  const content = fs.readFileSync(corpusPath, 'utf8');
  // Format: === header ===\n\nsource\n\n---\n\n(tree)
  const parts = content.split(
    /^-{3,}\s*$/m,
  );
  if (parts.length < 2) return null;
  // Source is between the === header and ---
  const headerAndSource = parts[0];
  const lines = headerAndSource.split('\n');
  // Skip header lines (=== ... ===) and blank lines after
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^={3,}/.test(lines[i])) {
      start = i + 1;
    }
  }
  // Skip leading blank lines after header
  while (start < lines.length && lines[start].trim() === '') start++;
  return lines.slice(start).join('\n').trim();
}

/**
 * Build a set of parent types that have fields coming from aliased rules.
 * For these nodes, field-annotated grandchildren should be bubbled up.
 */
const ALIAS_FIELD_PARENTS = new Set(
  nodeTypes
    .filter((n) => n.named && !isSupertype(n) && n.fields && n.children)
    .filter((n) => {
      // Node has both fields AND bare children — fields may come from alias
      const fieldNames = Object.keys(n.fields);
      const bareTypes = n.children.types.filter((t) => t.named).map((t) => t.type);
      return fieldNames.length > 0 && bareTypes.length > 0;
    })
    .map((n) => n.type),
);

/**
 * Recursively walk XML elements and record parent→child combinations.
 *
 * @param {object} element
 * @param {Record<string, Set<string>>} seen
 */
function walkXml(element, seen) {
  if (!element.elements) return;
  const parentType = element.name;
  // Skip non-node elements
  if (!parentType || parentType === 'sources' || parentType === 'source') {
    for (const child of element.elements) walkXml(child, seen);
    return;
  }

  for (const child of element.elements) {
    if (child.type !== 'element' || !child.name) continue;
    const childType = child.name;

    // Named nodes have snake_case names; anonymous tokens don't.
    if (!/^[a-z_][a-z0-9_]*$/.test(childType)) continue;

    const fieldAttr = child.attributes?.field;
    const key = fieldAttr ? `${fieldAttr}:${childType}` : childType;

    if (!seen[parentType]) seen[parentType] = new Set();
    seen[parentType].add(key);

    // Bubble up field-annotated grandchildren for alias parents.
    // When a rule aliases another (e.g., macro_invocation aliases
    // _macro_function_call as function_call), the aliased rule's
    // field annotations appear on the grandchildren in XML but
    // node-types.json attributes them to the grandparent.
    if (ALIAS_FIELD_PARENTS.has(parentType) && child.elements) {
      for (const grandchild of child.elements) {
        if (grandchild.type !== 'element' || !grandchild.name) continue;
        const gcType = grandchild.name;
        if (!/^[a-z_][a-z0-9_]*$/.test(gcType)) continue;
        const gcField = grandchild.attributes?.field;
        if (gcField) {
          seen[parentType].add(`${gcField}:${gcType}`);
        }
      }
    }

    walkXml(child, seen);
  }
}

// ── Corpus parsing ──────────────────────────────────────────────────────

/** Find all corpus .txt files. */
function findCorpusFiles() {
  const corpusDir = path.join(ROOT, 'test/corpus');
  const files = [];
  /**
   *
   * @param {string} dir
   */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.txt')) files.push(full);
    }
  }
  walk(corpusDir);
  return files;
}

/**
 * Parse all corpus files and return per-file combination sets.
 * Returns { perFile: Map<filePath, seen>, parsed, errors }
 * where `seen` is { parentType: Set<comboKey> }.
 *
 * @param {string[]} corpusFiles
 */
function parseAllCorpusFiles(corpusFiles) {
  const perFile = new Map();
  let parsed = 0;
  let errors = 0;

  for (const file of corpusFiles) {
    const source = extractSource(file);
    if (!source) continue;

    const tmpFile = path.join(
      '/tmp',
      `audit_${path.basename(file, '.txt')}_${process.pid}.glsl`,
    );
    fs.writeFileSync(tmpFile, source);

    try {
      const xmlOutput = execSync(
        `npx tree-sitter parse --xml "${tmpFile}" 2>/dev/null`,
        {encoding: 'utf8', timeout: 30000},
      );
      const doc = xml2js(xmlOutput, {compact: false});
      const fileSeen = {};
      walkXml(doc, fileSeen);
      perFile.set(file, fileSeen);
      parsed++;
    } catch {
      errors++;
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
    }
  }
  return {perFile, parsed, errors};
}

/**
 * Merge multiple per-file seen maps into one combined map.
 *
 * @param {Iterable<Record<string, Set<string>>>} fileMaps
 */
function mergeSeen(fileMaps) {
  const merged = {};
  for (const fileSeen of fileMaps) {
    for (const [parent, combos] of Object.entries(fileSeen)) {
      if (!merged[parent]) merged[parent] = new Set();
      for (const c of combos) merged[parent].add(c);
    }
  }
  return merged;
}

// ── Scoring ─────────────────────────────────────────────────────────────

/**
 * Check if a combo key belongs to a collapsed slot group.
 * Returns the group key if it does, null otherwise.
 *
 * @param {string} combo
 * @param {Record<string, {label: string, field: string, types: Set<string>}>} collapsedSlots
 */
function findCollapsedGroup(combo, collapsedSlots) {
  const colonIdx = combo.indexOf(':');
  const slotName = colonIdx >= 0 ? combo.substring(0, colonIdx) : '_bare';
  const childType = colonIdx >= 0 ? combo.substring(colonIdx + 1) : combo;

  for (const [key, group] of Object.entries(collapsedSlots)) {
    if (group.field === slotName && group.types.has(childType)) {
      return key;
    }
  }
  return null;
}

/**
 * Check if any type in a collapsed group was seen.
 *
 * @param {{label: string, field: string, types: Set<string>}} group
 * @param {Record<string, Set<string>>} seenCombos
 */
function isGroupSeen(group, seenCombos) {
  for (const t of group.types) {
    const key = group.field === '_bare' ? t : `${group.field}:${t}`;
    if (seenCombos.has(key)) return true;
  }
  return false;
}

/**
 * Compute coverage scores from a `seen` map against expected combinations.
 * Collapsed slots (supertypes + expression slots) count as one combo each.
 * Returns { coveredRules, totalRules, coveredCombos, totalCombos }
 *
 * @param {Record<string, {combos: Set<string>, collapsedSlots: object}>} expected
 * @param {Record<string, Set<string>>} seen
 */
function scoreCoverage(expected, seen) {
  let totalRules = 0;
  let coveredRules = 0;
  let totalCombos = 0;
  let coveredCombos = 0;

  for (const [parent, {combos: expectedCombos, collapsedSlots}] of Object.entries(expected)) {
    totalRules++;
    const seenCombos = seen[parent] || new Set();
    let ruleMissing = 0;
    const countedGroups = new Set();

    for (const combo of expectedCombos) {
      const groupKey = findCollapsedGroup(combo, collapsedSlots);
      if (groupKey) {
        if (countedGroups.has(groupKey)) continue;
        countedGroups.add(groupKey);
        totalCombos++;
        if (isGroupSeen(collapsedSlots[groupKey], seenCombos)) coveredCombos++;
        else ruleMissing++;
        continue;
      }

      totalCombos++;
      if (seenCombos.has(combo)) coveredCombos++;
      else ruleMissing++;
    }

    if (ruleMissing === 0) coveredRules++;
  }

  return {coveredRules, totalRules, coveredCombos, totalCombos};
}

/**
 * Count raw (uncollapsed) coverage — every concrete combo individually.
 *
 * @param {Record<string, {combos: Set<string>, collapsedSlots: object}>} expected
 * @param {Record<string, Set<string>>} seen
 * @returns {{rawCovered: number, rawTotal: number}}
 */
function scoreRawCoverage(expected, seen) {
  let rawTotal = 0;
  let rawCovered = 0;
  for (const [parent, {combos}] of Object.entries(expected)) {
    const seenCombos = seen[parent] || new Set();
    for (const combo of combos) {
      rawTotal++;
      if (seenCombos.has(combo)) rawCovered++;
    }
  }
  return {rawCovered, rawTotal};
}

// ── Coverage analysis ───────────────────────────────────────────────────

/**
 *
 */
function runCoverage() {
  const expected = buildExpectedCombinations();
  const corpusFiles = findCorpusFiles();
  const {perFile, parsed, errors} = parseAllCorpusFiles(corpusFiles);

  const allSeen = mergeSeen(perFile.values());

  // Score overall coverage (collapsed + raw)
  const {coveredRules, totalRules, coveredCombos, totalCombos} =
    scoreCoverage(expected, allSeen);
  const {rawCovered, rawTotal} = scoreRawCoverage(expected, allSeen);

  // Build missing-combo details for reporting (using collapsed slots)
  const uncoveredByRule = {};
  for (const [parent, {combos: expectedCombos, collapsedSlots}] of Object.entries(expected)) {
    const seenCombos = allSeen[parent] || new Set();
    const missing = [];
    const countedGroups = new Set();
    for (const combo of expectedCombos) {
      const groupKey = findCollapsedGroup(combo, collapsedSlots);
      if (groupKey) {
        if (countedGroups.has(groupKey)) continue;
        countedGroups.add(groupKey);
        if (!isGroupSeen(collapsedSlots[groupKey], seenCombos)) {
          missing.push(collapsedSlots[groupKey].label);
        }
        continue;
      }
      if (!seenCombos.has(combo)) missing.push(combo);
    }
    if (missing.length > 0) uncoveredByRule[parent] = missing;
  }

  const rulePct = ((coveredRules / totalRules) * 100).toFixed(1);
  const comboPct = ((coveredCombos / totalCombos) * 100).toFixed(1);
  const rawPct = ((rawCovered / rawTotal) * 100).toFixed(1);

  console.log(`## Coverage Summary\n`);
  console.log(`  Corpus files parsed: ${parsed} (${errors} errors)`);
  console.log(`  Rule coverage:        ${coveredRules}/${totalRules} (${rulePct}%)`);
  console.log(`  Combination coverage: ${coveredCombos}/${totalCombos} (${comboPct}%) collapsed`);
  console.log(`  Concrete combinations: ${rawCovered}/${rawTotal} (${rawPct}%)\n`);

  const uncoveredEntries = Object.entries(uncoveredByRule);
  if (uncoveredEntries.length > 0) {
    uncoveredEntries.sort((a, b) => b[1].length - a[1].length);

    // Use scoreCoverage per-rule to determine fully vs partially uncovered
    const fullyUncovered = uncoveredEntries.filter(([parent, missing]) => {
      const single = {[parent]: expected[parent]};
      const {totalCombos} = scoreCoverage(single, {});
      return missing.length === totalCombos;
    });
    const partiallyUncovered = uncoveredEntries.filter(
      ([parent]) => !fullyUncovered.some(([p]) => p === parent),
    );

    if (fullyUncovered.length > 0) {
      console.log(`## Completely Untested Rules (${fullyUncovered.length})\n`);
      for (const [parent, missing] of fullyUncovered) {
        console.log(`  - \`${parent}\` (${missing.length} combinations)`);
        if (ARGS.verbose) {
          for (const m of missing) console.log(`      ${m}`);
        }
      }
      console.log();
    }

    if (partiallyUncovered.length > 0) {
      console.log(`## Partially Tested Rules (${partiallyUncovered.length})\n`);
      for (const [parent, missing] of partiallyUncovered) {
        console.log(`  - \`${parent}\` — missing: ${missing.join(', ')}`);
      }
      console.log();
    }
  }
}

// ── Usefulness analysis ──────────────────────────────────────────────────

/**
 * Check if a corpus file is a core test (hand-crafted, in test/corpus/ root).
 *
 * @param {string} filePath
 */
function isCoreTest(filePath) {
  const rel = path.relative(path.join(ROOT, 'test/corpus'), filePath);
  return !rel.includes(path.sep); // no subdirectory = core
}

/**
 * Greedy set-cover usefulness analysis.
 *
 * Core tests are picked first (hand-crafted), then external tests are
 * ranked by marginal contribution. This avoids the leave-one-out blind
 * spot where N tests covering the same thing all report as redundant.
 */
function runUsefulness() {
  const expected = buildExpectedCombinations();
  const corpusFiles = findCorpusFiles();
  const {perFile, parsed, errors} = parseAllCorpusFiles(corpusFiles);

  // Flatten expected into collapsed "parent::combo" keys
  /**
   *
   */
  function flattenExpected() {
    const all = new Set();
    for (const [parent, {combos, collapsedSlots}] of Object.entries(expected)) {
      const countedGroups = new Set();
      for (const combo of combos) {
        const groupKey = findCollapsedGroup(combo, collapsedSlots);
        if (groupKey) {
          if (countedGroups.has(groupKey)) continue;
          countedGroups.add(groupKey);
          all.add(`${parent}::${collapsedSlots[groupKey].label}`);
          continue;
        }
        all.add(`${parent}::${combo}`);
      }
    }
    return all;
  }

  /**
   * Get the set of collapsed combo keys a file covers.
   *
   * @param {Record<string, Set<string>>} fileSeen
   */
  function fileCombosCollapsed(fileSeen) {
    const covered = new Set();
    for (const [parent, seenCombos] of Object.entries(fileSeen)) {
      const entry = expected[parent];
      if (!entry) continue;
      const {combos, collapsedSlots} = entry;
      const countedGroups = new Set();
      for (const combo of combos) {
        const groupKey = findCollapsedGroup(combo, collapsedSlots);
        if (groupKey) {
          if (countedGroups.has(groupKey)) continue;
          countedGroups.add(groupKey);
          if (isGroupSeen(collapsedSlots[groupKey], seenCombos)) {
            covered.add(`${parent}::${collapsedSlots[groupKey].label}`);
          }
          continue;
        }
        if (seenCombos.has(combo)) covered.add(`${parent}::${combo}`);
      }
    }
    return covered;
  }

  const allExpectedKeys = flattenExpected();
  const globalCovered = new Set();
  const results = [];

  // Phase 1: Core tests first — pick all, track their contributions
  const coreFiles = [...perFile.entries()].filter(([f]) => isCoreTest(f));
  const externalFiles = [...perFile.entries()].filter(([f]) => !isCoreTest(f));

  for (const [file, fileSeen] of coreFiles) {
    const fileCombos = fileCombosCollapsed(fileSeen);
    const marginalSet = new Set([...fileCombos].filter((c) => !globalCovered.has(c)));
    results.push({
      file: path.relative(ROOT, file),
      tier: 'core',
      added: marginalSet.size,
      combos: marginalSet,
    });
    for (const c of fileCombos) globalCovered.add(c);
  }

  // Phase 2: External tests — greedy by marginal contribution
  const remaining = [...externalFiles];
  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestMarginal = -1;
    let bestMarginalSet = null;
    let bestAllCombos = null;
    for (let i = 0; i < remaining.length; i++) {
      const fileCombos = fileCombosCollapsed(remaining[i][1]);
      const marginal = [...fileCombos].filter((c) => !globalCovered.has(c));
      if (marginal.length > bestMarginal) {
        bestMarginal = marginal.length;
        bestIdx = i;
        bestMarginalSet = new Set(marginal);
        bestAllCombos = fileCombos;
      }
    }

    const [file] = remaining.splice(bestIdx, 1);
    results.push({
      file: path.relative(ROOT, file[0]),
      tier: 'external',
      added: bestMarginal,
      combos: bestMarginalSet,
    });
    if (bestAllCombos) {
      for (const c of bestAllCombos) globalCovered.add(c);
    }
  }

  // ── File detail mode ──
  if (ARGS.usefulnessFiles.length) {
    for (const targetFile of ARGS.usefulnessFiles) {
      const targetRel = path.relative(ROOT, targetFile);
      const entry = results.find((r) => r.file === targetRel);
      if (!entry) {
        console.error(`File not found in corpus: ${targetRel}`);
        continue;
      }
      console.log(`## Usefulness: ${entry.file}\n`);
      console.log(`  Tier: ${entry.tier}`);
      console.log(`  Marginal contribution: +${entry.added} combinations\n`);
      if (entry.added === 0) {
        console.log(`  Redundant — covered by higher-priority tests.\n`);
      } else {
        const grouped = {};
        for (const c of entry.combos) {
          const [parent, combo] = c.split('::');
          if (!grouped[parent]) grouped[parent] = [];
          grouped[parent].push(combo);
        }
        for (const [parent, combos] of Object.entries(grouped).sort()) {
          console.log(`    ${parent}: ${combos.join(', ')}`);
        }
        console.log();
      }
    }
    return;
  }

  // ── Full report ──
  console.log(`## Test Usefulness (greedy set-cover)\n`);
  console.log(`  Corpus files: ${parsed} (${errors} parse errors)`);
  console.log(`  Total combinations: ${allExpectedKeys.size}`);
  console.log(`  Covered: ${globalCovered.size} (${((globalCovered.size / allExpectedKeys.size) * 100).toFixed(1)}%)\n`);

  const coreResults = results.filter((r) => r.tier === 'core');
  const extResults = results.filter((r) => r.tier === 'external');

  console.log(`  ### Core tests (${coreResults.length})\n`);
  const coreCoveredAfter = coreResults.reduce((s, r) => s + r.added, 0);
  console.log(`  Combined: ${coreCoveredAfter}/${allExpectedKeys.size} (${((coreCoveredAfter / allExpectedKeys.size) * 100).toFixed(1)}%)\n`);
  for (const r of coreResults) {
    const tag = r.added === 0 ? ' (redundant)' : '';
    console.log(`    ${r.file}  +${r.added}${tag}`);
  }
  console.log();

  const extValuable = extResults.filter((r) => r.added > 0);
  const extRedundant = extResults.filter((r) => r.added === 0);

  if (extValuable.length > 0) {
    console.log(`  ### External tests adding coverage (${extValuable.length})\n`);
    for (const r of extValuable) {
      console.log(`    ${r.file}  +${r.added}`);
    }
    console.log();
  }

  if (extRedundant.length > 0) {
    console.log(`  ### External tests — redundant (${extRedundant.length})\n`);
    for (const r of extRedundant) {
      console.log(`    ${r.file}`);
    }
    console.log();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

// Skip structural checks when querying a single file
if (!ARGS.usefulnessFiles.length) {
  console.log('=== Node Type Audit ===\n');

  const issues = runStructuralChecks();
  const wrappers = issues.filter((i) => i.type === 'wrapper');
  const missingFields = issues.filter((i) => i.type === 'missing_fields');
  const mixedFields = issues.filter((i) => i.type === 'mixed_fields');

  if (wrappers.length) {
    console.log(`## Potential Wrapper Nodes (${wrappers.length})\n`);
    for (const w of wrappers) console.log(`  - ${w.message}`);
    console.log();
  }

  if (missingFields.length) {
    console.log(`## Multiple Bare Named Children (${missingFields.length})\n`);
    for (const m of missingFields) console.log(`  - ${m.message}`);
    console.log();
  }

  if (mixedFields.length) {
    console.log(`## Mixed Fielded + Bare Children (${mixedFields.length})\n`);
    for (const m of mixedFields) console.log(`  - ${m.message}`);
    console.log();
  }

  if (!ARGS.coverage && !ARGS.usefulness) {
    const total = issues.length;
    if (total === 0) {
      console.log('No structural issues found.');
    } else {
      console.log(`Total: ${total} structural issue(s)`);
    }
  }
}

if (ARGS.coverage) runCoverage();
if (ARGS.usefulness) runUsefulness();
