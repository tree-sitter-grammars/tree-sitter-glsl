type BaseNode = {
  type: string;
  named: boolean;
};

type ChildNode = {
  multiple: boolean;
  required: boolean;
  types: BaseNode[];
};

type NodeInfo =
  | (BaseNode & {
      subtypes: BaseNode[];
    })
  | (BaseNode & {
      fields: { [name: string]: ChildNode };
      children: ChildNode[];
    });

/**
 * The tree-sitter language object for this grammar.
 *
 * @see {@linkcode https://tree-sitter.github.io/node-tree-sitter/interfaces/Parser.Language.html Parser.Language}
 *
 * @example
 * import Parser from "tree-sitter";
 * import Glsl from "tree-sitter-glsl";
 *
 * const parser = new Parser();
 * parser.setLanguage(Glsl);
 */
declare const binding: {
  /**
   * The inner language object.
   * @private
   */
  language: unknown;

  /**
   * The content of the `node-types.json` file for this grammar.
   *
   * @see {@linkplain https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types Static Node Types}
   */
  nodeTypeInfo: NodeInfo[];

  /**
   * Syntax highlighting query. Maps GLSL nodes to highlight capture names
   * (`@keyword`, `@function`, `@type`, `@operator`, `@variable`, etc.).
   * Includes built-in function/variable/constant recognition.
   */
  HIGHLIGHTS_QUERY?: string;

  /**
   * Language injection query. Identifies `#ifdef __cplusplus` / `#ifdef __STDC__`
   * guard blocks and marks their foreign-language content for injection
   * (`cpp` or `c`).
   *
   * Requires `OPT.MULTILINGUAL` to be enabled in grammar.js before the C
   * sources are generated.
   */
  INJECTIONS_QUERY?: string;

  /**
   * Local variable tracking query. Defines scopes (functions, blocks, loops)
   * and tracks identifier definitions and references within them.
   */
  LOCALS_QUERY?: string;

  /**
   * Tags query for code navigation. Captures function definitions, type
   * definitions, variable declarations, function calls, and type references.
   */
  TAGS_QUERY?: string;

  /**
   * Version tags query. Captures GLSL constructs whose availability depends
   * on a minimum `#version` (e.g., `uint` requires 130, `double` requires 400).
   * Intended for post-parse validation, not syntax highlighting.
   */
  VERSION_TAGS_QUERY?: string;

  /**
   * Constructor heuristic query. Identifies function calls where the callee
   * is a user-defined type name (capitalized identifier), which are likely
   * struct constructors. Opt-in — not included in default highlighting.
   */
  CONSTRUCTOR_HEURISTICS_QUERY?: string;
};

export default binding;
