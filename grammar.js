/**
 * @file GLSL grammar for tree-sitter
 * @license MIT
 */

// @ts-check

import {
  INTERPOLATION_QUALIFIER_KEYWORDS,
  PRECISION_QUALIFIER_KEYWORDS,
  STORAGE_QUALIFIER_KEYWORDS,
  TYPE_KEYWORDS,
  flattenKeywordGroups,
} from './keywords.js';

import EXTENSIONS from './extensions.js';

/**
 * Collect all `grammarExtension` rule builders from the extension registry
 * into a single flat object suitable for `Object.assign()` into rules.
 *
 * @returns {RuleBuilders<string, never>}
 */
function collectExtensionRules() {
  /** @type {RuleBuilders<string, never>} */
  const rules = {};
  for (const ext of Object.values(EXTENSIONS)) {
    if (ext.grammarExtension) {
      Object.assign(rules, ext.grammarExtension);
    }
  }
  return rules;
}

const EXTENSION_RULES = collectExtensionRules();

/**
 * Conditionally include an extension rule in a `choice()`.
 * Returns `[$.rule_name]` if the extension defines it, `[]` otherwise.
 *
 * @param {GrammarSymbols<string>} $ Grammar symbols.
 * @param {string} ruleName Name of the extension-defined rule.
 * @returns {RuleOrLiteral[]}
 */
function extRule($, ruleName) {
  return ruleName in EXTENSION_RULES ? [$[ruleName]] : [];
}

/**
 * Parser configuration flags.
 *
 * The first three extend the core GLSL grammar to handle real-world
 * shader code (preprocessor structure, unexpanded macros, shared
 * C++/GLSL headers). `ESSL` restricts it to the OpenGL ES subset.
 *
 * Document any rule drift caused by these flags at the affected rules.
 */
const OPT = {
  /**
   * Parse preprocessor directives (`#define`, `#if`, `#pragma`, etc.)
   *  into structured nodes instead of opaque `preproc_call`.
   */
  MACRO_PARSING: true,
  /**
   * Accept unexpanded macros as qualifiers, types, and expressions.
   *  E.g. `COMPAT_PRECISION float x;`, `CONCAT(vec, 3) value;`.
   */
  MACRO_EXPANSION: true,
  /**
   * Recognize `#ifdef __cplusplus` / `#ifndef __STDC__` language
   *  guards and preserve non-GLSL branches for language injection.
   */
  MULTILINGUAL: true,
  /**
   * Restrict to the ESSL (OpenGL ES) subset: no aggregate
   *  initializers (`{ ... }`), no standalone `;` declarations.
   */
  ESSL: false,
};

/**
 * Expression precedence levels (specification/chapters/operators.adoc).
 * Higher number = higher precedence (binds tighter).
 * Used for prec.left/prec.right within each production.
 */
const PRECEDENCE = {
  COMMA: 1, // spec 17 (lowest)
  ASSIGNMENT: 2, // spec 16
  CONDITIONAL: 3, // spec 15
  LOGICAL_OR: 4, // spec 14
  LOGICAL_XOR: 5, // spec 13
  LOGICAL_AND: 6, // spec 12
  INCLUSIVE_OR: 7, // spec 11
  EXCLUSIVE_OR: 8, // spec 10
  AND: 9, // spec 9
  EQUALITY: 10, // spec 8
  RELATIONAL: 11, // spec 7
  SHIFT: 12, // spec 6
  ADDITIVE: 13, // spec 5
  MULTIPLICATIVE: 14, // spec 4
  UNARY: 15, // spec 3
  POSTFIX: 16, // spec 2
};

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a preprocessor regex rule.
 * Based on: ref/c_grammar.js preprocessor()
 *
 * @param {string} command Preprocessor directive name without `#`.
 * @returns {RuleOrLiteral} Tree-sitter alias rule for the directive token.
 */
function preprocessor(command) {
  return alias(token(prec(1, new RegExp('#[ \\t]*' + command))), '#' + command);
}

/**
 * Creates preproc_if / preproc_ifdef / preproc_else / preproc_elif rules
 * parameterized by a suffix and content rule, so they can appear in different
 * contexts (top-level, inside structs, inside statement lists).
 * Based on: ref/c_grammar.js preprocIf()
 *
 * @param {string} suffix Rule-name suffix used for specialized variants.
 * @param {($: any) => *} content Content builder for the directive body.
 * @param {number} precedence Precedence used for the generated rules. Defaults to `0`.
 * @returns {{[ruleName: string]: *}} Generated preprocessor rule builders.
 */
function preprocIf(suffix, content, precedence = 0) {
  /**
   * Builds the `#else` / `#elif` alternative branch for a generated rule.
   *
   * @param {*} $ Grammar symbols.
   * @returns {RuleOrLiteral} Alternative branch rule.
   */
  function alternativeBlock($) {
    return choice(
      suffix ?
        alias($['preproc_else' + suffix], $.preproc_else) :
        $.preproc_else,
      suffix ?
        alias($['preproc_elif' + suffix], $.preproc_elif) :
        $.preproc_elif,
    );
  }

  return {
    /**
     * @param {*} $ Grammar symbols.
     * @returns {RuleOrLiteral} Rule definition.
     */
    ['preproc_if' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          preprocessor('if'),
          field('condition', $._preproc_expression),
          token.immediate(/\r?\n/),
          repeat(content($)),
          field('alternative', optional(alternativeBlock($))),
          preprocessor('endif'),
        ),
      ),

    /**
     * @param {*} $ Grammar symbols.
     * @returns {RuleOrLiteral} Rule definition.
     */
    ['preproc_ifdef' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          choice(preprocessor('ifdef'), preprocessor('ifndef')),
          field('name', $.identifier),
          repeat(content($)),
          field('alternative', optional(alternativeBlock($))),
          preprocessor('endif'),
        ),
      ),

    /**
     * @param {*} $ Grammar symbols.
     * @returns {RuleOrLiteral} Rule definition.
     */
    ['preproc_else' + suffix]: ($) =>
      prec(precedence, seq(preprocessor('else'), repeat(content($)))),

    /**
     * @param {*} $ Grammar symbols.
     * @returns {RuleOrLiteral} Rule definition.
     */
    ['preproc_elif' + suffix]: ($) =>
      prec(
        precedence,
        seq(
          preprocessor('elif'),
          field('condition', $._preproc_expression),
          token.immediate(/\r?\n/),
          repeat(content($)),
          field('alternative', optional(alternativeBlock($))),
        ),
      ),
  };
}

/**
 * Creates a rule to optionally match one or more of the rules
 * separated by a comma.
 *
 * @param {*} rule Rule to repeat.
 * @returns {RuleOrLiteral} Optional comma-separated rule sequence.
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma.
 *
 * @param {*} rule Rule to repeat.
 * @returns {RuleOrLiteral} Comma-separated rule sequence.
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * Builds a logical negation wrapper around a rule fragment.
 *
 * @param {*} expr Rule fragment to negate.
 * @returns {RuleOrLiteral} Rule definition.
 */
function not(expr) {
  return seq('!', expr);
}

// ── OPT.MULTILINGUAL Helpers ─────────────────────────────────────────────

/**
 * Language check: `MACRO`, `defined MACRO`, or `defined(MACRO)`.
 *
 * @param {*} macro The language macro rule.
 * @returns {RuleOrLiteral} Rule definition.
 */
function langCheck(macro) {
  return choice(macro, seq('defined', macro), seq('defined', '(', macro, ')'));
}

/**
 * Compound condition patterns: `A || B`, `(A || B)`, `A && !B`, etc.
 *
 * @param {*} primary The primary language check (e.g. cpp).
 * @param {*} secondary The secondary language check (e.g. c).
 * @returns {Array} Alternatives to spread into a `choice()`.
 */
function langCompound(primary, secondary) {
  return [
    seq('(', primary, '||', secondary, ')'),
    seq('(', secondary, '||', primary, ')'),
    seq('(', primary, '&&', not(secondary), ')'),
    seq('(', not(secondary), '&&', primary, ')'),
    seq(primary, '||', secondary),
    seq(secondary, '||', primary),
    seq(primary, '&&', not(secondary)),
    seq(not(secondary), '&&', primary),
  ];
}

/**
 * Positive language guard body: condition selects foreign code.
 *
 * @param {*} condition The positive condition rule.
 * @param {*} codeBlock The foreign code block rule.
 * @returns {RuleOrLiteral} Rule definition.
 */
function langForeignBody(condition, codeBlock) {
  return seq(
    field('condition', condition),
    token.immediate(/\r?\n/),
    field('consequence', codeBlock),
  );
}

/**
 * Negated language guard body: condition excludes foreign code → body is GLSL.
 *
 * @param {*} $ Grammar symbols.
 * @param {*} condition The negated condition rule.
 * @param {*} foreignElse The foreign-language else rule.
 * @returns {RuleOrLiteral} Rule definition.
 */
function langGlslBody($, condition, foreignElse) {
  return seq(
    field('condition', condition),
    repeat($._top_level_item),
    field('alternative', optional(alias(foreignElse, $.preproc_else))),
  );
}

/**
 * `#ifdef` arm: foreign code in body, optional GLSL in `#else`.
 *
 * @param {*} $ Grammar symbols.
 * @param {*} macro The language macro rule.
 * @param {*} codeBlock The foreign code block rule.
 * @param {*} glslElse The GLSL else rule.
 * @returns {RuleOrLiteral} Rule definition.
 */
function langIfdefArm($, macro, codeBlock, glslElse) {
  return seq(
    field('name', macro),
    field('consequence', codeBlock),
    field('alternative', optional(alias(glslElse, $.preproc_else))),
  );
}

/**
 * `#ifndef` arm: GLSL in body, optional foreign code in `#else`.
 *
 * @param {*} $ Grammar symbols.
 * @param {*} macro The language macro rule.
 * @param {*} foreignElse The foreign-language else rule.
 * @returns {RuleOrLiteral} Rule definition.
 */
function langIfndefArm($, macro, foreignElse) {
  return seq(
    field('name', macro),
    repeat($._top_level_item),
    field('alternative', optional(alias(foreignElse, $.preproc_else))),
  );
}

export default grammar({
  name: 'glsl',

  conflicts: ($) => [
    // `const foo;` — GLSL allows bare type declarations like `const vec3;`
    // where `foo` is a _type_identifier starting a declarator_list, but
    // also `type_qualifier identifier_list SEMICOLON` where `foo` is a
    // plain identifier in identifier_list. Without a symbol table we
    // can't tell which.
    [$.identifier_list, $._type_identifier],

    ...(OPT.MACRO_EXPANSION ?
      [
        // `MYMACRO vec3 x;` — `MYMACRO` could be a type name
        // (constructor) or a macro_invocation standing in for a qualifier.
        // Resolved by context after the next token.
        [$._type_identifier, $.macro_invocation],

        // `MYMACRO(args) x;` — `MYMACRO(args)` could be a function-like
        // type constructor or a macro_invocation in type position.
        [$._type_specifier_nonarray, $.macro_invocation],

        // `foo[0]` — `foo` could be a variable (primary_expression) for
        // subscript or a type name for an array constructor. GLSL has no
        // way to distinguish TYPE_NAME from IDENTIFIER without a symbol
        // table.
        // `foo(` — `foo` could be a variable starting a function_call,
        // a macro_invocation, a type identifier, or a macro_function_call.
        [$._primary_expression, $._type_identifier, $.macro_invocation, $._macro_function_call],

        // `foo(` — identifier could start a macro_invocation or be a
        // primary_expression in various contexts.
        [$._primary_expression, $.macro_invocation],
        [$._primary_expression, $._type_identifier, $.macro_invocation],

        // `QUAL1 QUAL2 type x;` — when multiple identifiers appear as
        // qualifiers, the repeat in type_qualifier can't tell where
        // qualifiers end and the type begins without lookahead.
        [$.type_qualifier],

        // `MYMACRO;` at statement level — could be an expression
        // statement (identifier followed by `;`) or a macro_invocation
        // used as a statement-like construct.
        [$.expression_statement, $.macro_invocation],

        // Combination of the above two: `MYMACRO(args)` at statement
        // level is three-way ambiguous between expression statement,
        // type specifier starting a declaration, and macro_invocation.
        [
          $.expression_statement,
          $._type_specifier_nonarray,
          $.macro_invocation,
        ],
      ] :
      []),
  ],

  extras: ($) => [/\s|\\\r?\n/, $.comment],

  inline: (_) => [],

  supertypes: ($) => [$.statement, $.simple_statement, $.single_type_qualifier],

  word: ($) => $.identifier,

  rules: Object.assign(
    {
      // ── Top-level ── grammar.adoc ──────────────────────────────────────

      /**
       * ```bnf
       * translation_unit :
       *     external_declaration
       *     translation_unit external_declaration
       * ```
       *
       * Tree-sitter compromise: uses repeat() instead of left-recursive list.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      translation_unit: ($) => repeat($._top_level_item),

      /**
       * ```bnf
       * external_declaration :
       *     function_definition
       *     declaration
       *     SEMICOLON
       * ```
       *
       * Hidden: transparent pass-through so top-level items appear
       * directly under translation_unit.
       *
       * @param {GrammarSymbols<string>} $
       * @returns {RuleOrLiteral} Rule definition.
       */
      _external_declaration: ($) =>
        choice(
          $.function_definition,
          $.declaration,
          ...(OPT.ESSL ? [] : [';']),
        ),

      /**
       * ```bnf
       * function_definition :
       *     function_prototype compound_statement_no_new_scope
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      function_definition: ($) =>
        seq($.function_declarator, $.compound_statement),

      // ── Expressions ── grammar.adoc ────────────────────────────────────

      /**
       * ```bnf
       * primary_expression :
       *     variable_identifier
       *     INTCONSTANT
       *     UINTCONSTANT
       *     FLOATCONSTANT
       *     BOOLCONSTANT
       *     DOUBLECONSTANT
       *     LEFT_PAREN expression RIGHT_PAREN
       * ```
       *
       * Hidden: transparent pass-through so bare identifiers/literals
       * appear directly without a wrapper node.
       * variable_identifier is inlined (just IDENTIFIER).
       * BOOLCONSTANT is `true` or `false`.
       *
       * @param {GrammarSymbols<string>} $
       */
      _primary_expression: ($) =>
        choice(
          $.identifier,
          $.number_literal,
          $.bool_literal,
          $.parenthesized_expression,
          ...(OPT.MACRO_EXPANSION ?
            [prec.dynamic(-1, $.macro_invocation)] :
            []),
        ),

      /**
       * ```bnf
       * primary_expression : BOOLCONSTANT
       * ```
       *
       * @param {GrammarSymbols<string>} _
       */
      bool_literal: (_) => choice('true', 'false'),

      /**
       * ```bnf
       * primary_expression : LEFT_PAREN expression RIGHT_PAREN
       * ```
       *
       * Tree-sitter compromise: extracted from _primary_expression as
       * a named node for editor fold/highlight support.
       *
       * @param {GrammarSymbols<string>} $
       */
      parenthesized_expression: ($) => seq('(', $._expression, ')'),

      /**
       * ```bnf
       * postfix_expression :
       *     primary_expression
       *     postfix_expression LEFT_BRACKET integer_expression RIGHT_BRACKET
       *     function_call
       *     postfix_expression DOT FIELD_SELECTION
       *     postfix_expression INC_OP
       *     postfix_expression DEC_OP
       * ```
       *
       * Hidden: transparent pass-through. Public sub-rules
       * (subscript_expression, function_call, field_expression,
       * update_expression) are extracted as named nodes.
       * integer_expression is inlined (just expression).
       *
       * @param {GrammarSymbols<string>} $
       */
      _postfix_expression: ($) =>
        choice(
          $._primary_expression,
          $.subscript_expression,
          $.function_call,
          $.field_expression,
          alias($._postfix_update, $.update_expression),
        ),

      /**
       * Hidden helper: postfix increment/decrement, aliased to
       * update_expression in _postfix_expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      _postfix_update: ($) =>
        prec.left(
          PRECEDENCE.POSTFIX,
          seq(
            field('argument', $._postfix_expression),
            field('operator', choice('++', '--')),
          ),
        ),

      /**
       * ```bnf
       * postfix_expression :
       *     postfix_expression LEFT_BRACKET integer_expression RIGHT_BRACKET
       * ```
       *
       * Tree-sitter compromise: extracted from _postfix_expression as a
       * named node. integer_expression is just expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      subscript_expression: ($) =>
        prec(
          PRECEDENCE.POSTFIX,
          seq(
            field('argument', $._postfix_expression),
            '[',
            field('index', $._expression),
            ']',
          ),
        ),

      /**
       * ```bnf
       * postfix_expression : postfix_expression DOT FIELD_SELECTION
       * ```
       *
       * Tree-sitter compromise: extracted from _postfix_expression as a
       * named node. FIELD_SELECTION is aliased to field_identifier.
       *
       * @param {GrammarSymbols<string>} $
       */
      field_expression: ($) =>
        prec(
          PRECEDENCE.POSTFIX,
          seq(
            field('argument', $._postfix_expression),
            '.',
            field('field', alias($.identifier, $.field_identifier)),
          ),
        ),

      /**
       * ```bnf
       * function_call : function_call_or_method
       *
       * function_call_or_method : function_call_generic
       *
       * function_call_generic :
       *     function_call_header_with_parameters RIGHT_PAREN
       *     function_call_header_no_parameters RIGHT_PAREN
       *
       * function_call_header_no_parameters :
       *     function_call_header VOID
       *     function_call_header
       *
       * function_call_header_with_parameters :
       *     function_call_header assignment_expression
       *     function_call_header_with_parameters COMMA assignment_expression
       *
       * function_call_header :
       *     function_identifier LEFT_PAREN
       *
       * function_identifier :
       *     type_specifier
       *     postfix_expression
       * ```
       *
       * Tree-sitter compromise: the 6-level spec chain
       * (function_call → function_call_or_method → function_call_generic →
       * function_call_header_* → function_call_header → function_identifier)
       * is collapsed into a single function_call node.
       *
       * @param {GrammarSymbols<string>} $
       */
      function_call: ($) =>
        prec.dynamic(
          1,
          prec(
            PRECEDENCE.POSTFIX,
            seq(
              field(
                'function',
                choice($.type_specifier, $._postfix_expression),
              ),
              '(',
              optional(field('arguments', $.argument_list)),
              ')',
            ),
          ),
        ),

      /**
       * Tree-sitter compromise: preserves the spec's `void` no-argument form.
       *
       * @param {GrammarSymbols<string>} $
       */
      argument_list: ($) => choice('void', commaSep1($._assignment_expression)),

      /**
       * ```bnf
       * unary_expression :
       *     postfix_expression
       *     INC_OP unary_expression
       *     DEC_OP unary_expression
       *     unary_operator unary_expression
       *
       * unary_operator :
       *     PLUS | DASH | BANG | TILDE
       * ```
       *
       * Hidden: transparent pass-through. Public sub-rules
       * (unary_expression for operators, update_expression for ++/--)
       * are extracted as named nodes.
       *
       * @param {GrammarSymbols<string>} $
       */
      _unary_expression: ($) =>
        choice(
          $._postfix_expression,
          alias($._prefix_update, $.update_expression),
          $.unary_expression,
        ),

      /**
       * Hidden helper: prefix increment/decrement, aliased to
       * update_expression in _unary_expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      _prefix_update: ($) =>
        prec.right(
          PRECEDENCE.UNARY,
          seq(
            field('operator', choice('++', '--')),
            field('argument', $._unary_expression),
          ),
        ),

      /**
       * Public sub-rule of _unary_expression: only emitted when a
       * unary operator (+, -, !, ~) is present.
       *
       * @param {GrammarSymbols<string>} $
       */
      unary_expression: ($) =>
        prec.right(
          PRECEDENCE.UNARY,
          seq(
            field('operator', choice('+', '-', '!', '~')),
            field('argument', $._unary_expression),
          ),
        ),

      /**
       * Public alias target for both prefix and postfix ++/--
       * (via _postfix_update and _prefix_update).
       *
       * @param {GrammarSymbols<string>} $
       */
      update_expression: ($) => choice($._postfix_update, $._prefix_update),

      /**
       * ```bnf
       * multiplicative_expression :
       *     unary_expression
       *     multiplicative_expression STAR unary_expression
       *     multiplicative_expression SLASH unary_expression
       *     multiplicative_expression PERCENT unary_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _multiplicative_expression: ($) =>
        choice(
          $._unary_expression,
          alias($._multiplicative_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for multiplicative binary operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _multiplicative_operation: ($) =>
        prec.left(
          PRECEDENCE.MULTIPLICATIVE,
          seq(
            field('left', $._multiplicative_expression),
            field('operator', choice('*', '/', '%')),
            field('right', $._unary_expression),
          ),
        ),

      /**
       * ```bnf
       * additive_expression :
       *     multiplicative_expression
       *     additive_expression PLUS multiplicative_expression
       *     additive_expression DASH multiplicative_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _additive_expression: ($) =>
        choice(
          $._multiplicative_expression,
          alias($._additive_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for additive binary operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _additive_operation: ($) =>
        prec.left(
          PRECEDENCE.ADDITIVE,
          seq(
            field('left', $._additive_expression),
            field('operator', choice('+', '-')),
            field('right', $._multiplicative_expression),
          ),
        ),

      /**
       * ```bnf
       * shift_expression :
       *     additive_expression
       *     shift_expression LEFT_OP additive_expression
       *     shift_expression RIGHT_OP additive_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _shift_expression: ($) =>
        choice(
          $._additive_expression,
          alias($._shift_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for shift binary operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _shift_operation: ($) =>
        prec.left(
          PRECEDENCE.SHIFT,
          seq(
            field('left', $._shift_expression),
            field('operator', choice('<<', '>>')),
            field('right', $._additive_expression),
          ),
        ),

      /**
       * ```bnf
       * relational_expression :
       *     shift_expression
       *     relational_expression LEFT_ANGLE shift_expression
       *     relational_expression RIGHT_ANGLE shift_expression
       *     relational_expression LE_OP shift_expression
       *     relational_expression GE_OP shift_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _relational_expression: ($) =>
        choice(
          $._shift_expression,
          alias($._relational_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for relational binary operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _relational_operation: ($) =>
        prec.left(
          PRECEDENCE.RELATIONAL,
          seq(
            field('left', $._relational_expression),
            field('operator', choice('<', '>', '<=', '>=')),
            field('right', $._shift_expression),
          ),
        ),

      /**
       * ```bnf
       * equality_expression :
       *     relational_expression
       *     equality_expression EQ_OP relational_expression
       *     equality_expression NE_OP relational_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _equality_expression: ($) =>
        choice(
          $._relational_expression,
          alias($._equality_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for equality binary operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _equality_operation: ($) =>
        prec.left(
          PRECEDENCE.EQUALITY,
          seq(
            field('left', $._equality_expression),
            field('operator', choice('==', '!=')),
            field('right', $._relational_expression),
          ),
        ),

      /**
       * ```bnf
       * and_expression :
       *     equality_expression
       *     and_expression AMPERSAND equality_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _and_expression: ($) =>
        choice(
          $._equality_expression,
          alias($._and_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for bitwise-and operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _and_operation: ($) =>
        prec.left(
          PRECEDENCE.AND,
          seq(
            field('left', $._and_expression),
            field('operator', '&'),
            field('right', $._equality_expression),
          ),
        ),

      /**
       * ```bnf
       * exclusive_or_expression :
       *     and_expression
       *     exclusive_or_expression CARET and_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _exclusive_or_expression: ($) =>
        choice(
          $._and_expression,
          alias($._exclusive_or_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for bitwise-xor operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _exclusive_or_operation: ($) =>
        prec.left(
          PRECEDENCE.EXCLUSIVE_OR,
          seq(
            field('left', $._exclusive_or_expression),
            field('operator', '^'),
            field('right', $._and_expression),
          ),
        ),

      /**
       * ```bnf
       * inclusive_or_expression :
       *     exclusive_or_expression
       *     inclusive_or_expression VERTICAL_BAR exclusive_or_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _inclusive_or_expression: ($) =>
        choice(
          $._exclusive_or_expression,
          alias($._inclusive_or_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for bitwise-or operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _inclusive_or_operation: ($) =>
        prec.left(
          PRECEDENCE.INCLUSIVE_OR,
          seq(
            field('left', $._inclusive_or_expression),
            field('operator', '|'),
            field('right', $._exclusive_or_expression),
          ),
        ),

      /**
       * ```bnf
       * logical_and_expression :
       *     inclusive_or_expression
       *     logical_and_expression AND_OP inclusive_or_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_and_expression: ($) =>
        choice(
          $._inclusive_or_expression,
          alias($._logical_and_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for logical-and operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_and_operation: ($) =>
        prec.left(
          PRECEDENCE.LOGICAL_AND,
          seq(
            field('left', $._logical_and_expression),
            field('operator', '&&'),
            field('right', $._inclusive_or_expression),
          ),
        ),

      /**
       * ```bnf
       * logical_xor_expression :
       *     logical_and_expression
       *     logical_xor_expression XOR_OP logical_and_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_xor_expression: ($) =>
        choice(
          $._logical_and_expression,
          alias($._logical_xor_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for logical-xor operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_xor_operation: ($) =>
        prec.left(
          PRECEDENCE.LOGICAL_XOR,
          seq(
            field('left', $._logical_xor_expression),
            field('operator', '^^'),
            field('right', $._logical_and_expression),
          ),
        ),

      /**
       * ```bnf
       * logical_or_expression :
       *     logical_xor_expression
       *     logical_or_expression OR_OP logical_xor_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_or_expression: ($) =>
        choice(
          $._logical_xor_expression,
          alias($._logical_or_operation, $.binary_expression),
        ),

      /**
       * Hidden helper for logical-or operations.
       *
       * @param {GrammarSymbols<string>} $
       */
      _logical_or_operation: ($) =>
        prec.left(
          PRECEDENCE.LOGICAL_OR,
          seq(
            field('left', $._logical_or_expression),
            field('operator', '||'),
            field('right', $._logical_xor_expression),
          ),
        ),

      /**
       * Tree-sitter compromise: the spec's binary precedence ladder is parsed
       * via hidden rules but emitted as one consumer-facing node.
       *
       * @param {GrammarSymbols<string>} $
       */
      binary_expression: ($) =>
        choice(
          $._multiplicative_operation,
          $._additive_operation,
          $._shift_operation,
          $._relational_operation,
          $._equality_operation,
          $._and_operation,
          $._exclusive_or_operation,
          $._inclusive_or_operation,
          $._logical_and_operation,
          $._logical_xor_operation,
          $._logical_or_operation,
        ),

      /**
       * ```bnf
       * conditional_expression :
       *     logical_or_expression
       *     logical_or_expression QUESTION expression COLON
       *     assignment_expression
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _conditional_expression: ($) =>
        choice($._logical_or_expression, $.conditional_expression),

      /**
       * Tree-sitter compromise: visible conditional node only when `?:`
       * is present; the spec base case stays hidden in _conditional_expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      conditional_expression: ($) =>
        prec.right(
          PRECEDENCE.CONDITIONAL,
          seq(
            field('condition', $._logical_or_expression),
            '?',
            field('consequence', $._expression),
            ':',
            field('alternative', $._assignment_expression),
          ),
        ),

      /**
       * ```bnf
       * assignment_expression :
       *     conditional_expression
       *     unary_expression assignment_operator assignment_expression
       * ```
       *
       * ```bnf
       * assignment_operator :
       *     EQUAL | MUL_ASSIGN | DIV_ASSIGN | MOD_ASSIGN |
       *     ADD_ASSIGN | SUB_ASSIGN | LEFT_ASSIGN | RIGHT_ASSIGN |
       *     AND_ASSIGN | XOR_ASSIGN | OR_ASSIGN
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      _assignment_expression: ($) =>
        choice($._conditional_expression, $.assignment_expression),

      /**
       * Tree-sitter compromise: visible assignment node only when an
       * assignment operator is present; the spec base case stays hidden
       * in _assignment_expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      assignment_expression: ($) =>
        prec.right(
          PRECEDENCE.ASSIGNMENT,
          seq(
            field('left', $._unary_expression),
            field('operator', $.assignment_operator),
            field('right', $._assignment_expression),
          ),
        ),

      /**
       * ```bnf
       * assignment_operator :
       *     EQUAL | MUL_ASSIGN | DIV_ASSIGN | MOD_ASSIGN |
       *     ADD_ASSIGN | SUB_ASSIGN | LEFT_ASSIGN | RIGHT_ASSIGN |
       *     AND_ASSIGN | XOR_ASSIGN | OR_ASSIGN
       * ```
       *
       * @param {GrammarSymbols<string>} _
       */
      assignment_operator: (_) =>
        choice(
          '=',
          '*=',
          '/=',
          '%=',
          '+=',
          '-=',
          '<<=',
          '>>=',
          '&=',
          '^=',
          '|=',
        ),

      /**
       * ```bnf
       * expression :
       *     assignment_expression
       *     expression COMMA assignment_expression
       * ```
       *
       * Tree-sitter compromise: _expression is hidden; the comma-operator
       * form surfaces as comma_expression (visible).
       *
       * @param {GrammarSymbols<string>} $
       */
      _expression: ($) => choice($._assignment_expression, $.comma_expression),

      /**
       * ```bnf
       * expression : expression COMMA assignment_expression
       * ```
       *
       * Tree-sitter compromise: the comma-operator form is a separate
       * visible node; the single-assignment form is hidden in _expression.
       *
       * @param {GrammarSymbols<string>} $
       */
      comma_expression: ($) =>
        prec.left(
          PRECEDENCE.COMMA,
          seq(
            field('left', $._expression),
            ',',
            field('right', $._assignment_expression),
          ),
        ),

      /**
       * ```bnf
       * constant_expression : conditional_expression
       * ```
       *
       * Hidden: 1:1 pass-through so expressions appear directly in
       * layout arguments and array sizes.
       *
       * @param {GrammarSymbols<string>} $
       */
      _constant_expression: ($) => $._conditional_expression,

      // ── Types ── grammar.adoc ──────────────────────────────────────────

      /**
       * ```bnf
       * fully_specified_type :
       *     type_specifier
       *     type_qualifier type_specifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      type: ($) =>
        choice(seq($.type_qualifier, $.type_specifier), $.type_specifier),

      /**
       * ```bnf
       * type_qualifier :
       *     single_type_qualifier
       *     type_qualifier single_type_qualifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      type_qualifier: ($) => repeat1($.single_type_qualifier),

      /**
       * ```bnf
       * single_type_qualifier :
       *     storage_qualifier
       *     layout_qualifier
       *     precision_qualifier
       *     interpolation_qualifier
       *     invariant_qualifier
       *     precise_qualifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      single_type_qualifier: ($) =>
        choice(
          $.storage_qualifier,
          $.layout_qualifier,
          $.precision_qualifier,
          $.interpolation_qualifier,
          $.invariant_qualifier,
          $.precise_qualifier,
          ...(OPT.MACRO_EXPANSION ?
            [prec.dynamic(-1, $.macro_invocation)] :
            []),
        ),

      /**
       * ```bnf
       * storage_qualifier :
       *     CONST | IN | OUT | INOUT | CENTROID | PATCH | SAMPLE |
       *     UNIFORM | BUFFER | SHARED | COHERENT | VOLATILE |
       *     RESTRICT | READONLY | WRITEONLY |
       *     SUBROUTINE | SUBROUTINE LEFT_PAREN type_name_list RIGHT_PAREN
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      storage_qualifier: ($) =>
        choice(
          ...flattenKeywordGroups(STORAGE_QUALIFIER_KEYWORDS),
          seq('subroutine', '(', $.type_name_list, ')'),
        ),

      /**
       * ```bnf
       * type_name_list :
       *     TYPE_NAME
       *     type_name_list COMMA TYPE_NAME
       * ```
       *
       * GLSL-only (subroutine).
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      type_name_list: ($) => commaSep1($.identifier),

      /**
       * ```bnf
       * layout_qualifier :
       *     LAYOUT LEFT_PAREN layout_qualifier_id_list RIGHT_PAREN
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      layout_qualifier: ($) => seq('layout', '(', $._layout_arguments, ')'),

      /**
       * ```bnf
       * layout_qualifier_id_list :
       *     layout_qualifier_id
       *     layout_qualifier_id_list COMMA layout_qualifier_id
       * ```
       *
       * Hidden: transparent pass-through so layout_argument nodes
       * appear directly inside layout_qualifier.
       *
       * @param {GrammarSymbols<string>} $
       */
      _layout_arguments: ($) => commaSep1($.layout_argument),

      /**
       * ```bnf
       * layout_qualifier_id :
       *     IDENTIFIER
       *     IDENTIFIER EQUAL constant_expression
       *     SHARED
       * ```
       *
       * @param {GrammarSymbols<string>} $
       */
      layout_argument: ($) =>
        choice(
          seq(
            field('name', $.identifier),
            '=',
            field('value', $._constant_expression),
          ),
          $.identifier,
          'shared',
        ),

      /**
       * ```bnf
       * precision_qualifier :
       *     HIGH_PRECISION | MEDIUM_PRECISION | LOW_PRECISION
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      precision_qualifier: (_) =>
        choice(...flattenKeywordGroups(PRECISION_QUALIFIER_KEYWORDS)),

      /**
       * ```bnf
       * interpolation_qualifier :
       *     SMOOTH | FLAT | NOPERSPECTIVE
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      interpolation_qualifier: (_) =>
        choice(...flattenKeywordGroups(INTERPOLATION_QUALIFIER_KEYWORDS)),

      /**
       * ```bnf
       * invariant_qualifier : INVARIANT
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      invariant_qualifier: (_) => 'invariant',

      /**
       * ```bnf
       * precise_qualifier : PRECISE
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      precise_qualifier: (_) => 'precise',

      /**
       * ```bnf
       * type_specifier :
       *     type_specifier_nonarray
       *     type_specifier_nonarray array_specifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      type_specifier: ($) =>
        seq($._type_specifier_nonarray, optional($.array_specifier)),

      /**
       * ```bnf
       * array_specifier :
       *     LEFT_BRACKET RIGHT_BRACKET
       *     LEFT_BRACKET conditional_expression RIGHT_BRACKET
       *     array_specifier LEFT_BRACKET RIGHT_BRACKET
       *     array_specifier LEFT_BRACKET conditional_expression RIGHT_BRACKET
       * ```
       *
       * Tree-sitter compromise: uses repeat1() instead of left-recursion.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      array_specifier: ($) =>
        repeat1(seq('[', optional($._conditional_expression), ']')),

      /**
       * ```bnf
       * type_specifier_nonarray :
       *     VOID | FLOAT | DOUBLE | INT | UINT | BOOL |
       *     VEC2..4 | DVEC2..4 | BVEC2..4 | IVEC2..4 | UVEC2..4 |
       *     MAT2..4 | MAT2X2..MAT4X4 | DMAT2..4 | DMAT2X2..DMAT4X4 |
       *     ATOMIC_UINT | <sampler types> | <image types> |
       *     struct_specifier | TYPE_NAME
       * ```
       *
       * TYPE_NAME is an identifier that names a user-defined type.
       * Tree-sitter cannot distinguish TYPE_NAME from IDENTIFIER
       * semantically; here it is accepted as $._type_identifier.
       *
       * Extension: when OPT.MACRO_EXPANSION is enabled, a function-like macro
       * invocation is also accepted in type position so unexpanded forms like
       * `CONCAT(vec, 3)` can parse structurally. Bare identifiers remain
       * `type_identifier` because they are indistinguishable from user-defined
       * type names at parse time.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      _type_specifier_nonarray: ($) =>
        choice(
          ...flattenKeywordGroups(TYPE_KEYWORDS),
          $.struct_specifier,
          prec.dynamic(-1, $._type_identifier),
          ...(OPT.MACRO_EXPANSION ?
            [
              prec.dynamic(
                -3,
                alias($._macro_function_call, $.macro_invocation),
              ),
            ] :
            []),
        ),

      // ── Structs ── grammar.adoc ────────────────────────────────────────

      /**
       * ```bnf
       * struct_specifier :
       *     STRUCT IDENTIFIER LEFT_BRACE struct_declaration_list RIGHT_BRACE
       *     STRUCT LEFT_BRACE struct_declaration_list RIGHT_BRACE
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      struct_specifier: ($) =>
        seq(
          'struct',
          optional(field('name', $.identifier)),
          '{',
          $.field_declaration_list,
          '}',
        ),

      /**
       * ```bnf
       * struct_declaration_list :
       *     struct_declaration
       *     struct_declaration_list struct_declaration
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      field_declaration_list: ($) =>
        repeat1(
          choice(
            $.field_declaration,
            // Extension: preprocessor directives inside struct bodies
            $.preproc_call,
            ...(OPT.MACRO_PARSING ?
              [
                $.preproc_def,
                $.preproc_function_def,
                $.preproc_undef,
                alias($.preproc_if_in_struct_declaration, $.preproc_if),
                alias($.preproc_ifdef_in_struct_declaration, $.preproc_ifdef),
              ] :
              []),
          ),
        ),

      /**
       * ```bnf
       * struct_declaration :
       *     type_specifier struct_declarator_list SEMICOLON
       *     type_qualifier type_specifier struct_declarator_list SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      field_declaration: ($) =>
        seq(
          optional($.type_qualifier),
          $.type_specifier,
          $.field_declarator_list,
          ';',
        ),

      /**
       * ```bnf
       * struct_declarator_list :
       *     struct_declarator
       *     struct_declarator_list COMMA struct_declarator
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      field_declarator_list: ($) => commaSep1($.field_declarator),

      /**
       * ```bnf
       * struct_declarator :
       *     IDENTIFIER
       *     IDENTIFIER array_specifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      field_declarator: ($) =>
        seq(field('name', $.identifier), optional($.array_specifier)),

      // ── Declarations ── grammar.adoc ───────────────────────────────────

      /**
       * ```bnf
       * declaration :
       *     function_prototype SEMICOLON
       *     init_declarator_list SEMICOLON
       *     PRECISION precision_qualifier type_specifier SEMICOLON
       *     type_qualifier IDENTIFIER LEFT_BRACE struct_declaration_list
       *     RIGHT_BRACE SEMICOLON
       *     type_qualifier IDENTIFIER LEFT_BRACE struct_declaration_list
       *     RIGHT_BRACE IDENTIFIER SEMICOLON
       *     type_qualifier IDENTIFIER LEFT_BRACE struct_declaration_list
       *     RIGHT_BRACE IDENTIFIER array_specifier SEMICOLON
       *     type_qualifier SEMICOLON
       *     type_qualifier identifier_list SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      declaration: ($) =>
        choice(
          seq($.function_declarator, ';'),
          seq($.declarator_list, ';'),
          seq('precision', $.precision_qualifier, $.type_specifier, ';'),
          // Interface blocks
          seq(
            $.type_qualifier,
            field('name', $.identifier),
            '{',
            $.field_declaration_list,
            '}',
            optional(
              seq(
                field('instance_name', $.identifier),
                optional($.array_specifier),
              ),
            ),
            ';',
          ),
          seq($.type_qualifier, ';'),
          seq($.type_qualifier, $.identifier_list, ';'),
        ),

      /**
       * ```bnf
       * identifier_list :
       *     IDENTIFIER
       *     identifier_list COMMA IDENTIFIER
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      identifier_list: ($) => commaSep1($.identifier),

      /**
       * ```bnf
       * function_prototype : function_declarator RIGHT_PAREN
       *
       * function_declarator :
       *     function_header
       *     function_header_with_parameters
       *
       * function_header_with_parameters :
       *     function_header parameter_declaration
       *     function_header_with_parameters COMMA parameter_declaration
       *
       * function_header :
       *     fully_specified_type IDENTIFIER LEFT_PAREN
       * ```
       *
       * Tree-sitter compromise: function_prototype is inlined and its
       * sub-production (closing RIGHT_PAREN) collapsed here. The spec splits
       * LEFT_PAREN and RIGHT_PAREN across function_header and
       * function_prototype. They're merged here so the delimiter pair lives in
       * one node.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      function_declarator: ($) =>
        seq(
          field('return_type', $.type),
          field('name', $.identifier),
          '(',
          optional(field('parameters', $.parameter_list)),
          ')',
        ),

      /**
       * Tree-sitter compromise: replaces the spec's
       * function_header_with_parameters left-recursive chain.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      parameter_list: ($) => commaSep1($.parameter_declaration),

      /**
       * ```bnf
       * parameter_declaration :
       *     type_qualifier parameter_declarator
       *     parameter_declarator
       *     type_qualifier parameter_type_specifier
       *     parameter_type_specifier
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      parameter_declaration: ($) =>
        choice(
          seq(
            optional($.type_qualifier),
            field('type', $.type_specifier),
            field('name', $.identifier),
            optional($.array_specifier),
          ),
          seq(optional($.type_qualifier), field('type', $.type_specifier)),
        ),

      /**
       * ```bnf
       * init_declarator_list :
       *     single_declaration
       *     init_declarator_list COMMA IDENTIFIER
       *     init_declarator_list COMMA IDENTIFIER array_specifier
       *     init_declarator_list COMMA IDENTIFIER array_specifier EQUAL initializer
       *     init_declarator_list COMMA IDENTIFIER EQUAL initializer
       * ```
       *
       * Tree-sitter compromise: subsequent declarators (which omit the
       * type in the BNF) are wrapped in `declarator` nodes without a
       * `type` child, so every name/value pair is uniformly grouped.
       *
       * @param {GrammarSymbols<string>} $
       */
      declarator_list: ($) =>
        seq(
          $.declarator,
          repeat(
            seq(',', alias($._subsequent_declarator, $.declarator)),
          ),
        ),

      /**
       * ```bnf
       * single_declaration :
       *     fully_specified_type
       *     fully_specified_type IDENTIFIER
       *     fully_specified_type IDENTIFIER array_specifier
       *     fully_specified_type IDENTIFIER array_specifier EQUAL initializer
       *     fully_specified_type IDENTIFIER EQUAL initializer
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      declarator: ($) =>
        seq(
          $.type,
          optional(
            seq(
              field('name', $.identifier),
              optional($.array_specifier),
              optional(seq('=', field('value', $._initializer))),
            ),
          ),
        ),

      /**
       * Subsequent declarator in a comma-separated list (no type).
       *
       * @param {GrammarSymbols<string>} $
       */
      _subsequent_declarator: ($) =>
        seq(
          field('name', $.identifier),
          optional($.array_specifier),
          optional(seq('=', field('value', $._initializer))),
        ),

      // ── Initializers ── grammar.adoc ───────────────────────────────────

      /**
       * ```bnf
       * initializer :
       *     assignment_expression
       *     LEFT_BRACE initializer_list RIGHT_BRACE
       *     LEFT_BRACE initializer_list COMMA RIGHT_BRACE
       * ```
       *
       * Hidden: transparent pass-through for expressions; the aggregate
       * `{ ... }` form is extracted as the visible `initializer` node.
       *
       * @param {GrammarSymbols<string>} $
       */
      _initializer: ($) =>
        OPT.ESSL ?
          $._assignment_expression :
          choice($._assignment_expression, $.initializer),

      ...(OPT.ESSL ? {} : {
        /**
         * Aggregate initializer: `{ initializer_list }`. GLSL-only.
         *
         * @param {GrammarSymbols<string>} $
         */
        initializer: ($) => seq('{', $.initializer_list, '}'),
      }),

      /**
       * ```bnf
       * initializer_list :
       *     initializer
       *     initializer_list COMMA initializer
       * ```
       *
       * Trailing comma allowed per spec (`{ initializer_list COMMA }`).
       * GLSL-only (ESSL has no aggregate initializers).
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      ...(OPT.ESSL ? {} : {
        initializer_list: ($) => seq(commaSep1($._initializer), optional(',')),
      }),

      // ── Statements ── grammar.adoc ────────────────────────────────────

      /**
       * ```bnf
       * declaration_statement : declaration
       * ```
       *
       * Hidden: 1:1 pass-through so local_declaration appears directly.
       *
       * @param {GrammarSymbols<string>} $
       */
      _declaration_statement: ($) => prec.dynamic(-1, $.local_declaration),

      /**
       * Block-scope declaration form.
       *
       * This reuses the ordinary declarator list instead of splitting block
       * declarations into a separate macro-filtered tree.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      local_declaration: ($) => seq($.declarator_list, ';'),

      /**
       * ```bnf
       * statement :
       *     compound_statement
       *     simple_statement
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      statement: ($) => choice($.compound_statement, $.simple_statement),

      /**
       * ```bnf
       * simple_statement :
       *     declaration_statement
       *     expression_statement
       *     selection_statement
       *     switch_statement
       *     case_label
       *     iteration_statement
       *     jump_statement
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      simple_statement: ($) =>
        choice(
          $.expression_statement,
          $._declaration_statement,
          $.if_statement,
          $.switch_statement,
          $.case_label,
          $._iteration_statement,
          $._jump_statement,
          ...extRule($, 'demote_statement'),
          // Extension: preprocessor directives in statement position
          $.preproc_call,
          ...(OPT.MACRO_PARSING ?
            [
              $.preproc_def,
              $.preproc_function_def,
              $.preproc_undef,
              alias($.preproc_if_in_statement, $.preproc_if),
              alias($.preproc_ifdef_in_statement, $.preproc_ifdef),
            ] :
            []),
        ),

      /**
       * ```bnf
       * compound_statement :
       *     LEFT_BRACE RIGHT_BRACE
       *     LEFT_BRACE statement_list RIGHT_BRACE
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      compound_statement: ($) => seq('{', optional($.statement_list), '}'),

      /**
       * ```bnf
       * statement_no_new_scope :
       *     compound_statement_no_new_scope
       *     simple_statement
       * ```
       *
       * Hidden: identical to `statement` (a supertype); tree-sitter does
       * not enforce scoping so the distinction adds no value.
       *
       * @param {GrammarSymbols<string>} $
       */
      _statement_no_new_scope: ($) =>
        choice($.compound_statement, $.simple_statement),

      /**
       * ```bnf
       * statement_list :
       *     statement
       *     statement_list statement
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      statement_list: ($) => repeat1($.statement),

      /**
       * ```bnf
       * expression_statement :
       *     SEMICOLON
       *     expression SEMICOLON
       * ```
       *
       * Extension: when OPT.MACRO_EXPANSION is enabled, a function-like
       * macro invocation may also stand alone as a semicolonless line.
       * This stays low-priority so real GLSL expression statements win.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      expression_statement: ($) =>
        choice(
          prec.dynamic(1, seq(optional($._expression), ';')),
          ...(OPT.MACRO_EXPANSION ?
            [prec.dynamic(-2, alias($._macro_function_call, $.function_call))] :
            []),
        ),

      /**
       * ```bnf
       * selection_statement :
       *     IF LEFT_PAREN expression RIGHT_PAREN
       *     selection_rest_statement
       *
       * selection_rest_statement :
       *     statement ELSE statement
       *     statement
       * ```
       *
       * Tree-sitter compromise: selection_rest_statement is inlined.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      if_statement: ($) =>
        prec.right(
          seq(
            'if',
            '(',
            field('condition', $._expression),
            ')',
            field('consequence', $.statement),
            optional(field('alternative', $.else_clause)),
          ),
        ),

      /**
       * ```bnf
       * selection_rest_statement : statement ELSE statement | statement
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      else_clause: ($) => seq('else', $.statement),

      /**
       * ```bnf
       * condition :
       *     expression
       *     fully_specified_type IDENTIFIER EQUAL initializer
       * ```
       *
       * Hidden: transparent pass-through for expressions; the
       * declaration form is extracted as the visible `condition`
       * node (e.g. `for (int i = 0; ...)`).
       *
       * @param {GrammarSymbols<string>} $
       */
      _condition: ($) =>
        choice(
          $._expression,
          $.condition,
        ),

      /**
       * Declaration inside a for/while condition: `type name = init`.
       *
       * @param {GrammarSymbols<string>} $
       */
      condition: ($) =>
        seq($.type, field('name', $.identifier), '=', $._initializer),

      /**
       * ```bnf
       * switch_statement :
       *     SWITCH LEFT_PAREN expression RIGHT_PAREN
       *     LEFT_BRACE switch_statement_list RIGHT_BRACE
       *
       * switch_statement_list :
       *     /* empty * /
       *     statement_list
       * ```
       *
       * Tree-sitter compromise: switch_statement_list is inlined
       * as optional(statement_list).
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      switch_statement: ($) =>
        seq(
          'switch',
          '(',
          field('condition', $._expression),
          ')',
          '{',
          optional($.statement_list),
          '}',
        ),

      /**
       * ```bnf
       * case_label :
       *     CASE expression COLON
       *     DEFAULT COLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      case_label: ($) =>
        choice(
          seq('case', field('value', $._expression), ':'),
          seq('default', ':'),
        ),

      /**
       * ```bnf
       * iteration_statement :
       *     WHILE LEFT_PAREN condition RIGHT_PAREN
       *     statement_no_new_scope
       *     DO statement WHILE LEFT_PAREN expression RIGHT_PAREN SEMICOLON
       *     FOR LEFT_PAREN for_init_statement for_rest_statement
       *     RIGHT_PAREN statement_no_new_scope
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      _iteration_statement: ($) =>
        choice($.while_statement, $.do_statement, $.for_statement),

      /**
       * ```bnf
       * iteration_statement : WHILE LEFT_PAREN condition RIGHT_PAREN
       *     statement_no_new_scope
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      while_statement: ($) =>
        seq(
          'while',
          '(',
          field('condition', $._condition),
          ')',
          field('body', $._statement_no_new_scope),
        ),

      /**
       * ```bnf
       * iteration_statement : DO statement WHILE LEFT_PAREN expression
       *     RIGHT_PAREN SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      do_statement: ($) =>
        seq(
          'do',
          field('body', $.statement),
          'while',
          '(',
          field('condition', $._expression),
          ')',
          ';',
        ),

      /**
       * ```bnf
       * iteration_statement : FOR LEFT_PAREN for_init_statement
       *     for_rest_statement RIGHT_PAREN statement_no_new_scope
       *
       * for_init_statement :
       *     expression_statement | declaration_statement
       *
       * for_rest_statement :
       *     conditionopt SEMICOLON
       *     conditionopt SEMICOLON expression
       *
       * conditionopt : /* empty * / | condition
       * ```
       *
       * Tree-sitter compromise: for_init_statement, for_rest_statement,
       * and conditionopt are inlined.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      for_statement: ($) =>
        seq(
          'for',
          '(',
          field(
            'initializer',
            choice($.expression_statement, $._declaration_statement),
          ),
          field('condition', optional($._condition)),
          ';',
          field('update', optional($._expression)),
          ')',
          field('body', $._statement_no_new_scope),
        ),

      /**
       * ```bnf
       * jump_statement :
       *     CONTINUE SEMICOLON
       *     BREAK SEMICOLON
       *     RETURN SEMICOLON
       *     RETURN expression SEMICOLON
       *     DISCARD SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      _jump_statement: ($) =>
        choice(
          $.continue_statement,
          $.break_statement,
          $.return_statement,
          $.discard_statement,
          ...extRule($, 'terminate_invocation_statement'),
        ),

      /**
       * ```bnf
       * jump_statement : CONTINUE SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      continue_statement: (_) => seq('continue', ';'),

      /**
       * ```bnf
       * jump_statement : BREAK SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      break_statement: (_) => seq('break', ';'),

      /**
       * ```bnf
       * jump_statement : RETURN SEMICOLON | RETURN expression SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      return_statement: ($) => seq('return', optional($._expression), ';'),

      /**
       * ```bnf
       * jump_statement : DISCARD SEMICOLON
       * ```
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      discard_statement: (_) => seq('discard', ';'),

      // ── Lexical ── basics.adoc ─────────────────────────────────────────

      /**
       * ```bnf
       * identifier :
       *     nondigit
       *     identifier nondigit
       *     identifier digit
       * nondigit : one of
       *     _ a-z A-Z
       * digit : one of
       *     0-9
       * ```
       *
       * Source: specification/chapters/basics.adoc §Identifiers
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,

      /**
       * Extension of spec TYPE_NAME handling:
       * Tree-sitter cannot know whether an identifier denotes a user-defined
       * type or an ordinary variable/function name, so type-name uses are
       * accepted structurally via an identifier alias.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      _type_identifier: ($) => alias($.identifier, $.type_identifier),

      /**
       * Comments (specification/chapters/basics.adoc §Comments):
       * Line comments:  // to end of line
       * Block comments: /* to * /
       * Comments cannot be nested.
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      comment: (_) =>
        token(
          choice(
            seq('//', /(\\+(.|\r?\n)|[^\\\n])*/),
            seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
          ),
        ),

      /**
       * ```bnf
       * integer-constant :
       *     decimal-constant integer-suffix_opt
       *     octal-constant integer-suffix_opt
       *     hexadecimal-constant integer-suffix_opt
       * integer-suffix : one of
       *     u U
       * decimal-constant :
       *     nonzero-digit
       *     decimal-constant digit
       * octal-constant :
       *     0
       *     octal-constant octal-digit
       * hexadecimal-constant :
       *     0x hexadecimal-digit
       *     0X hexadecimal-digit
       *     hexadecimal-constant hexadecimal-digit
       * ```
       *
       * ```bnf
       * floating-constant :
       *     fractional-constant exponent-part_opt floating-suffix_opt
       *     digit-sequence exponent-part floating-suffix_opt
       * fractional-constant :
       *     digit-sequence . digit-sequence
       *     digit-sequence .
       *     . digit-sequence
       * exponent-part :
       *     e sign_opt digit-sequence
       *     E sign_opt digit-sequence
       * sign : one of
       *     + -
       * floating-suffix : one of
       *     f F lf LF
       * ```
       *
       * Source: specification/chapters/variables.adoc §Integers, §Floats
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      number_literal: (_) => {
        const decimalDigits = /[0-9]+/;
        const octalDigits = /[0-7]+/;
        const hexDigits = /[0-9a-fA-F]+/;

        const integerConstant = choice(
          seq(/[1-9]/, optional(decimalDigits)), // decimal-constant
          seq('0', optional(octalDigits)), // octal-constant (includes bare 0)
          seq(choice('0x', '0X'), hexDigits), // hexadecimal-constant
        );

        const exponentPart = seq(
          choice('e', 'E'),
          optional(choice('+', '-')),
          decimalDigits,
        );

        const fractionalConstant = choice(
          seq(decimalDigits, '.', optional(decimalDigits)),
          seq('.', decimalDigits),
        );

        const floatingConstant = choice(
          seq(fractionalConstant, optional(exponentPart)),
          seq(decimalDigits, exponentPart),
        );

        return token(
          choice(
            seq(integerConstant, optional(choice('u', 'U'))),
            seq(floatingConstant, optional(choice('f', 'F', 'lf', 'LF'))),
          ),
        );
      },

      // ── Preprocessor ── basics.adoc §Preprocessor ──────────────────────

      /**
       * Extension: #version directive.
       *
       * Not a formal BNF production in grammar.adoc, but defined in
       * basics.adoc §Preprocessor / §Version Declaration.
       * Form: #version <number> [profile]
       * where profile is one of: core, compatibility, es
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      preproc_version: (_) => seq(/#[ \t]*version/, /[^\n]*/),

      /**
       * Extension: catch-all for unknown preprocessor directives.
       * When OPT.MACRO_PARSING is off, all directives (except #version
       * and bare #) fall through to this rule.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      preproc_call: ($) =>
        seq(
          field('directive', $.preproc_directive),
          field('argument', optional($.preproc_arg)),
          token.immediate(/\r?\n/),
        ),

      /**
       * basics.adoc §Preprocessor:
       * "The number sign (#) on a line by itself is ignored."
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      preproc_nothing: (_) => seq(/#[ \t]*/, token.immediate(/\r?\n/)),

      /**
       * Extension: opaque text payload for preprocessor directives.
       * Low precedence so structured tokens are preferred when possible.
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      preproc_arg: (_) => token(prec(-1, /\S([^/\n]|\/[^*]|\\\r?\n)*/)),

      /**
       * Extension: directive token for preproc_call catch-all.
       * Matches `#` followed by an identifier (e.g. `#include`, `#pragma`).
       *
       * @param {GrammarSymbols<string>} _ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      preproc_directive: (_) => /#[ \t]*[a-zA-Z0-9]\w*/,

      /**
       * Top-level translation-unit items, including preprocessor directives.
       *
       * @param {GrammarSymbols<string>} $ Grammar symbols.
       * @returns {RuleOrLiteral} Rule definition.
       */
      _top_level_item: ($) =>
        choice(
          $._external_declaration,
          $.preproc_version,
          $.preproc_call,
          $.preproc_nothing,
          ...(OPT.MACRO_PARSING ?
            [
              ...(OPT.MULTILINGUAL ?
                [
                  $.preproc_language_if,
                  $.preproc_language_ifdef,
                  $.preproc_language_ifndef,
                ] :
                []),
              $.preproc_def,
              $.preproc_function_def,
              $.preproc_undef,
              $.preproc_error,
              $.preproc_pragma,
              $.preproc_extension,
              $.preproc_line,
              $.preproc_if,
              $.preproc_ifdef,
            ] :
            []),
        ),
    },

    // ── OPT.MACRO_PARSING ──────────────────────────────────────────────
    // Structured preprocessor directive parsing: specific rules for
    // #define, #undef, #if/#ifdef/#else/#endif, #error, #pragma,
    // #extension, #line, and preprocessor condition expressions.
    // When disabled, all directives (except #version and bare #)
    // fall through to the opaque preproc_call catch-all.

    OPT.MACRO_PARSING ?
      {
        /**
         * Extension: #define directive.
         *
         * basics.adoc §Preprocessor: "#define and #undef functionality are
         * defined as is standard for C++ preprocessors for macro definitions
         * both with and without macro parameters."
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_def: ($) =>
          seq(
            preprocessor('define'),
            field('name', $.identifier),
            field('value', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: #define with parameters (function-like macro).
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_function_def: ($) =>
          seq(
            preprocessor('define'),
            field('name', $.identifier),
            field('parameters', $.preproc_params),
            field('value', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: parameter list for function-like #define.
         * token.immediate('(') ensures no space between macro name and '('.
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_params: ($) =>
          seq(
            token.immediate('('),
            commaSep(choice($.identifier, '...')),
            ')',
          ),

        /**
         * Extension: #undef directive.
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_undef: ($) =>
          seq(
            preprocessor('undef'),
            field('name', $.identifier),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: #error directive.
         *
         * basics.adoc §Preprocessor: "The message will be the tokens
         * following the #error directive, up to the first new-line."
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_error: ($) =>
          seq(
            preprocessor('error'),
            field('message', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: #pragma directive.
         *
         * basics.adoc §Preprocessor: "Tokens following #pragma are not
         * subject to preprocessor macro expansion."
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_pragma: ($) =>
          seq(
            preprocessor('pragma'),
            field('argument', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: #extension directive.
         *
         * basics.adoc §Preprocessor:
         * Form: #extension <extension_name> : <behavior>
         * #extension all : <behavior>
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_extension: ($) =>
          seq(
            preprocessor('extension'),
            field('argument', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Extension: #line directive.
         *
         * basics.adoc §Preprocessor:
         * Form: #line <line>
         * #line <line> <source-string-number>
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_line: ($) =>
          seq(
            preprocessor('line'),
            field('argument', optional($.preproc_arg)),
            token.immediate(/\r?\n/),
          ),

        /**
         * Preprocessor expressions for #if / #elif conditions.
         *
         * basics.adoc §Preprocessor: "Expressions following #if and #elif
         * are further restricted to expressions operating on literal integer
         * constants, plus identifiers consumed by the defined operator."
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        _preproc_expression: ($) =>
          choice(
            $.identifier,
            $.number_literal,
            $.preproc_defined,
            alias($.preproc_unary_expression, $.unary_expression),
            alias($.preproc_binary_expression, $.binary_expression),
            alias(
              $.preproc_parenthesized_expression,
              $.parenthesized_expression,
            ),
          ),

        /**
         * Extension: parenthesized grouping in preprocessor expressions.
         * Aliased to parenthesized_expression in the tree.
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_parenthesized_expression: ($) =>
          seq('(', $._preproc_expression, ')'),

        /**
         * ```bnf
         * defined identifier
         * defined ( identifier )
         * ```
         *
         * Source: basics.adoc §Preprocessor
         *
         * @param {GrammarSymbols<string>} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_defined: ($) =>
          choice(
            prec(1, seq('defined', '(', $.identifier, ')')),
            seq('defined', $.identifier),
          ),

        /**
         * Extension: unary operators in preprocessor expressions.
         * basics.adoc §Preprocessor allows !, ~, -, + on integer constants.
         * Aliased to unary_expression in the tree.
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_unary_expression: ($) =>
          prec.left(
            14,
            seq(
              field('operator', choice('!', '~', '-', '+')),
              field('argument', $._preproc_expression),
            ),
          ),

        /**
         * Preprocessor binary operators (basics.adoc §Preprocessor, precedence table):
         * 3  multiplicative   * / %       LTR
         * 4  additive         + -         LTR
         * 5  bit-wise shift   << >>       LTR
         * 6  relational       < > <= >=   LTR
         * 7  equality         == !=       LTR
         * 8  bit-wise and     &           LTR
         * 9  bit-wise xor     ^           LTR
         * 10 bit-wise or      |           LTR
         * 11 logical and      &&          LTR
         * 12 logical or       ||          LTR
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        preproc_binary_expression: ($) => {
          /** @type {[number, RuleOrLiteral][]} */
          const table = [
            [11, choice('*', '/', '%')],
            [10, choice('+', '-')],
            [9, choice('<<', '>>')],
            [8, choice('<', '>', '<=', '>=')],
            [7, choice('==', '!=')],
            [6, '&'],
            [5, '^'],
            [4, '|'],
            [3, '&&'],
            [2, '||'],
          ];
          return choice(
            ...table.map(([precedence, operator]) =>
              prec.left(
                precedence,
                seq(
                  field('left', $._preproc_expression),
                  field('operator', operator),
                  field('right', $._preproc_expression),
                ),
              ),
            ),
          );
        },

        // Conditional compilation: context-dependent variants.
        ...preprocIf('', ($) => $._top_level_item),
        ...preprocIf('_in_statement', ($) => $.statement),
        ...preprocIf('_in_struct_declaration', ($) => $.field_declaration),
      } :
      {},

    // ── OPT.MACRO_EXPANSION ────────────────────────────────────────────
    // Syntactic placeholders for unexpanded macro output. This accepts
    // identifiers or function-like macro invocations in positions where
    // macro expansion would yield standard GLSL qualifiers or type names.

    OPT.MACRO_EXPANSION ?
      {
        /**
         * Extension: unexpanded macro used in ordinary GLSL syntax.
         *
         * Object-like macros appear as `(macro_invocation (identifier))`.
         * Function-like macros appear as `(macro_invocation (function_call ...))`.
         * The same node is reused in qualifier, type, and expression position.
         *
         * @param {*} $ Grammar symbols.
         * @returns {RuleOrLiteral} Rule definition.
         */
        macro_invocation: ($) =>
          choice(
            alias($._macro_function_call, $.function_call),
            $.identifier,
          ),

        /**
         * Extension: internal function-like macro invocation.
         *
         * Unlike regular function_call which requires valid GLSL
         * expressions as arguments, macro arguments are arbitrary
         * token sequences separated by commas, with balanced
         * parentheses. This allows constructs like:
         * MACRO(.field = 1, .other = 2)
         * CONCAT(vec, 3)
         *
         * @param {GrammarSymbols<string>} $
         */
        _macro_function_call: ($) =>
          seq(
            field('function', $.identifier),
            '(',
            optional(field('arguments', $.macro_argument_list)),
            ')',
          ),

        /**
         * Comma-separated list of macro arguments.
         *
         * @param {GrammarSymbols<string>} $
         */
        macro_argument_list: ($) =>
          seq($.macro_argument, repeat(seq(',', $.macro_argument))),

        /**
         * A single macro argument: any token sequence without bare
         * `,` or unmatched `)`. Parenthesized sub-groups are allowed
         * and preserve commas inside them.
         *
         * @param {GrammarSymbols<string>} $
         */
        macro_argument: ($) =>
          repeat1(choice(
            $._macro_paren_group,
            $._macro_token,
          )),

        /**
         * Balanced parentheses inside a macro argument.
         *
         * @param {GrammarSymbols<string>} $
         */
        _macro_paren_group: ($) =>
          seq('(', optional($._macro_paren_content), ')'),

        /**
         * Content inside balanced parens: tokens and commas (no separation).
         *
         * @param {GrammarSymbols<string>} $
         */
        _macro_paren_content: ($) =>
          repeat1(choice(
            $._macro_paren_group,
            $._macro_token,
            ',',
          )),

        /**
         * Any single token that isn't `,`, `(`, or `)`.
         *
         * @param {GrammarSymbols<string>} _
         */
        _macro_token: (_) => token(prec(-1, /[^\s,()]+/)),
      } :
      {},

    // ── OPT.MULTILINGUAL ──────────────────────────────────────────────
    // Mixed-language branch support for shared GLSL/C++ utility headers.
    // This keeps the outer preprocessor structure in GLSL while exposing the
    // host-language span for query-based injection.
    //
    // Two language families are recognized:
    //   cpp: `__cplusplus`
    //   c:   `__STDC__`, `__GNUC__`, `__clang__`, `_MSC_VER`
    //
    // Each family generates a parallel set of rules (macro, check, condition,
    // negated condition, code block, else branch, markers). The helpers below
    // eliminate the duplication.

    OPT.MULTILINGUAL ?
      {
        // ── Language macros ──

        /** @param {GrammarSymbols<string>} _ @returns {RuleOrLiteral} */
        preproc_cpp_language_macro: (_) => '__cplusplus',
        /** @param {GrammarSymbols<string>} _ @returns {RuleOrLiteral} */
        preproc_c_language_macro: (_) =>
          choice('__STDC__', '__GNUC__', '__clang__', '_MSC_VER'),

        // ── Language checks: `MACRO`, `defined MACRO`, `defined(MACRO)` ──

        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        preproc_cpp_language_check: ($) => langCheck($.preproc_cpp_language_macro),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        preproc_c_language_check: ($) => langCheck($.preproc_c_language_macro),

        // ── Positive conditions ──

        /**
         * Condition selecting a C++ branch. Matches simple checks and
         * compound forms like `defined(__cplusplus) || defined(__STDC__)`.
         * If `__cplusplus` appears anywhere, the branch is treated as C++
         * since C++ is a usable superset for injected C syntax.
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_cpp_condition: ($) =>
          choice(
            $.preproc_cpp_language_check,
            ...langCompound(
              $.preproc_cpp_language_check,
              $.preproc_c_language_check,
            ),
          ),

        /**
         * Condition selecting a C branch (simple check only).
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_c_condition: ($) => $.preproc_c_language_check,

        // ── Negated conditions ──

        /**
         * `!defined(__cplusplus)` — body is GLSL, else is C++.
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_not_cpp_condition: ($) => not($.preproc_cpp_language_check),

        /**
         * `!defined(__STDC__)` — body is GLSL, else is C.
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_not_c_condition: ($) => not($.preproc_c_language_check),

        // ── Foreign-language code blocks ──

        /**
         * Raw non-GLSL line. Stops before `#else`, `#elif`, `#endif`.
         *
         * @param {GrammarSymbols<string>} _
         */
        multilingual_code_line: (_) =>
          token(prec(-1, /(?:[^\n]+\r?\n?|\r?\n)/)),

        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        multilingual_cpp_code_block: ($) => repeat1($.multilingual_code_line),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        multilingual_c_code_block: ($) => repeat1($.multilingual_code_line),

        // ── Language-aware #else branches ──

        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        preproc_cpp_else: ($) =>
          seq(preprocessor('else'), field('body', $.multilingual_cpp_code_block)),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        preproc_c_else: ($) =>
          seq(preprocessor('else'), field('body', $.multilingual_c_code_block)),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        preproc_glsl_else: ($) =>
          seq(preprocessor('else'), repeat($._top_level_item)),

        // ── Internal markers (condition → body pairs) ──

        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        _found_cpp_marker: ($) =>
          langForeignBody($.preproc_cpp_condition, $.multilingual_cpp_code_block),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        _found_c_marker: ($) =>
          langForeignBody($.preproc_c_condition, $.multilingual_c_code_block),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        _found_not_cpp_marker: ($) =>
          langGlslBody($, $.preproc_not_cpp_condition, $.preproc_cpp_else),
        /** @param {GrammarSymbols<string>} $ @returns {RuleOrLiteral} */
        _found_not_c_marker: ($) =>
          langGlslBody($, $.preproc_not_c_condition, $.preproc_c_else),

        // ── Top-level language guard directives ──

        /**
         * `#ifdef __cplusplus` / `#ifdef __STDC__`
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_language_ifdef: ($) =>
          seq(
            preprocessor('ifdef'),
            choice(
              langIfdefArm($, $.preproc_cpp_language_macro, $.multilingual_cpp_code_block, $.preproc_glsl_else),
              langIfdefArm($, $.preproc_c_language_macro, $.multilingual_c_code_block, $.preproc_glsl_else),
            ),
            preprocessor('endif'),
          ),

        /**
         * `#ifndef __cplusplus` / `#ifndef __STDC__`
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_language_ifndef: ($) =>
          seq(
            preprocessor('ifndef'),
            choice(
              langIfndefArm($, $.preproc_cpp_language_macro, $.preproc_cpp_else),
              langIfndefArm($, $.preproc_c_language_macro, $.preproc_c_else),
            ),
            preprocessor('endif'),
          ),

        /**
         * `#elif defined(__cplusplus)` / `#elif defined(__STDC__)` —
         * recursive chain for multi-language guards.
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_language_elif: ($) =>
          seq(
            preprocessor('elif'),
            choice($._found_cpp_marker, $._found_c_marker),
            field(
              'alternative',
              optional(
                choice(
                  alias($.preproc_language_elif, $.preproc_elif),
                  alias($.preproc_glsl_else, $.preproc_else),
                ),
              ),
            ),
          ),

        /**
         * `#if defined(__cplusplus)` / `#if !defined(__cplusplus)` —
         * top-level language guard with positive or negated condition.
         *
         * @param {GrammarSymbols<string>} $
         */
        preproc_language_if: ($) =>
          seq(
            preprocessor('if'),
            choice(
              // Positive: body is foreign code
              seq(
                choice($._found_cpp_marker, $._found_c_marker),
                field(
                  'alternative',
                  optional(
                    choice(
                      alias($.preproc_language_elif, $.preproc_elif),
                      alias($.preproc_glsl_else, $.preproc_else),
                    ),
                  ),
                ),
              ),
              // Negated: body is GLSL
              choice($._found_not_cpp_marker, $._found_not_c_marker),
            ),
            preprocessor('endif'),
          ),
      } :
      {},

    // ── Extension grammar rules ──────────────────────────────────────────
    EXTENSION_RULES,
  ),
});

export {PRECEDENCE as PREC, preprocIf, preprocessor, commaSep, commaSep1};
