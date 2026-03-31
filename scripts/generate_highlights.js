// @ts-check

import fs from 'node:fs';
import path from 'node:path';

import builtins from './builtin.js';
import {
  ATTRIBUTE_KEYWORDS,
  HIGHLIGHT_TYPE_QUALIFIER_KEYWORDS,
  TYPE_KEYWORDS,
  flattenKeywordGroups,
} from './keywords.js';

const TEMPLATE_PATH = path.join(import.meta.dirname, '..', 'queries', 'highlights.in');
const OUTPUT_PATH = path.join(import.meta.dirname, '..', 'queries', 'highlights.scm');

/**
 * Returns a sorted array of unique strings.
 *
 * @param {string[]} values Strings to deduplicate and sort.
 * @returns {string[]} Sorted unique strings.
 */
function sortedUnique(values) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

/**
 * Wraps quoted strings into query lines with a fixed indent.
 *
 * @param {string[]} names Built-in names to render.
 * @param {string} indent Line indent to apply.
 * @param {number} maxWidth Maximum line width before wrapping.
 * @returns {string[]} Wrapped query lines.
 */
function wrapQuotedNames(names, indent, maxWidth = 88) {
  /** @type {string[]} */
  const lines = [];
  let current = indent;

  for (const name of names) {
    const quoted = `"${name}"`;
    const next =
      current.trim().length === 0 ?
        `${indent}${quoted}` :
        `${current} ${quoted}`;

    if (current !== indent && next.length > maxWidth) {
      lines.push(current);
      current = `${indent}${quoted}`;
      continue;
    }

    current = next;
  }

  if (current !== indent) {
    lines.push(current);
  }

  return lines;
}

/**
 * Renders a `#any-of?` predicate block for a query capture.
 *
 * @param {string} capture Query capture name without the `@`.
 * @param {string[]} names Built-in names to match.
 * @returns {string} Rendered predicate block.
 */
function renderAnyOfPredicate(capture, names) {
  if (names.length === 0) {
    throw new Error(`Cannot render empty predicate for @${capture}`);
  }

  const valueLines = wrapQuotedNames(names, '  ');
  const lastLine = valueLines.pop();

  if (!lastLine) {
    throw new Error(`Failed to render predicate for @${capture}`);
  }

  return [` (#any-of? @${capture}`, ...valueLines, `${lastLine})`].join('\n');
}

/**
 * Renders a bracketed string list captured as a single highlight class.
 *
 * @param {string} capture Query capture name without the `@`.
 * @param {string[]} names Keyword names to match.
 * @returns {string} Rendered query block.
 */
function renderKeywordCapture(capture, names) {
  if (names.length === 0) {
    throw new Error(`Cannot render empty keyword block for @${capture}`);
  }

  const valueLines = wrapQuotedNames(names, '  ');

  return ['[', ...valueLines, `] @${capture}`].join('\n');
}

/**
 * Renders layout argument names captured as attributes.
 *
 * @param {string[]} names Layout qualifier names to match.
 * @returns {string} Rendered query block.
 */
function renderAttributeCapture(names) {
  return [
    '((layout_argument',
    '   (identifier) @attribute)',
    renderAnyOfPredicate('attribute', names),
    ')',
  ].join('\n');
}

/**
 * Builds all generated highlight query fragments derived from builtin.js.
 *
 * @returns {Record<string, string>} Placeholder replacements.
 */
function buildReplacements() {
  const extensionBuckets = Object.values(builtins.extensions);

  // Route macro aliases into the appropriate builtin lists based on their role.
  /** @type {Record<string, string[]>} */
  const macrosByRole = {};
  for (const bucket of extensionBuckets) {
    for (const [name, role] of Object.entries(bucket.macros)) {
      (macrosByRole[role] ??= []).push(name);
    }
  }

  const builtinTypeNames = sortedUnique([
    ...builtins.core.types,
    ...builtins.glsl.types,
    ...builtins.vulkan.types,
    ...extensionBuckets.flatMap((bucket) => bucket.types),
    ...(macrosByRole['type.builtin'] || []),
  ]);

  const builtinVariables = sortedUnique([
    ...builtins.core.variables,
    ...builtins.glsl.variables,
    ...builtins.vulkan.variables,
    ...extensionBuckets.flatMap((bucket) => bucket.variables),
    ...(macrosByRole['variable.builtin'] || []),
  ]);

  const builtinConstants = sortedUnique([
    ...builtins.core.constants,
    ...builtins.glsl.constants,
    ...builtins.vulkan.constants,
    ...extensionBuckets.flatMap((bucket) => bucket.constants),
    ...(macrosByRole['constant.builtin'] || []),
  ]);

  const builtinFunctions = sortedUnique([
    ...builtins.core.functions,
    ...builtins.glsl.functions,
    ...extensionBuckets.flatMap((bucket) => bucket.functions),
    ...(macrosByRole['function.builtin'] || []),
  ]);

  const builtinVkFunctions = sortedUnique(builtins.vulkan.functions);

  return {
    '{{GENERATED_TYPE_BUILTIN_KEYWORDS}}': renderKeywordCapture(
      'type.builtin',
      flattenKeywordGroups(TYPE_KEYWORDS),
    ),
    '{{GENERATED_TYPE_QUALIFIER_KEYWORDS}}': renderKeywordCapture(
      'type.qualifier',
      flattenKeywordGroups(HIGHLIGHT_TYPE_QUALIFIER_KEYWORDS),
    ),
    '{{GENERATED_ATTRIBUTE_KEYWORDS}}': renderAttributeCapture(
      flattenKeywordGroups(ATTRIBUTE_KEYWORDS).filter(
        (name) => name !== 'shared',
      ),
    ),
    '{{GENERATED_BUILTIN_CONSTANT_PREDICATE}}': renderAnyOfPredicate(
      'constant.builtin',
      builtinConstants,
    ),
    '{{GENERATED_BUILTIN_VARIABLE_PREDICATE}}': renderAnyOfPredicate(
      'variable.builtin',
      builtinVariables,
    ),
    '{{GENERATED_BUILTIN_TYPE_NAME_PREDICATE}}': renderAnyOfPredicate(
      'type.builtin',
      builtinTypeNames,
    ),
    '{{GENERATED_POSTFIX_VK_FUNCTION_PREDICATE}}': renderAnyOfPredicate(
      'function.builtin.vk',
      builtinVkFunctions,
    ),
    '{{GENERATED_POSTFIX_FUNCTION_PREDICATE}}': renderAnyOfPredicate(
      'function.builtin',
      builtinFunctions,
    ),
  };
}

/**
 * Generates the final highlights query from the template and builtin registry.
 *
 * @returns {void}
 */
function generateHighlights() {
  let output = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  for (const [placeholder, replacement] of Object.entries(
    buildReplacements(),
  )) {
    output = output.replace(placeholder, replacement);
  }

  if (output.includes('{{GENERATED_')) {
    throw new Error(
      'Unresolved generated highlight placeholder remained in template output',
    );
  }

  const header = [
    '; This file is generated by generate_highlights.js.',
    '; Edit queries/highlights.in or builtin.js, then regenerate.',
    '',
    '',
  ].join('\n');

  fs.writeFileSync(OUTPUT_PATH, `${header}${output}`);
}

generateHighlights();
