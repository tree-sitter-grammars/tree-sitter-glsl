//! This crate provides GLSL language support for the [`tree-sitter`] parsing library.
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//!     void fragment_shader() {
//!         gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
//!     }
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_glsl::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading GLSL parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_glsl() -> *const ();
}

/// The tree-sitter [`LanguageFn`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_glsl) };

/// The content of the [`node-types.json`][] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers#static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// Syntax highlighting query. Maps GLSL nodes to highlight capture names
/// (`@keyword`, `@function`, `@type`, `@operator`, `@variable`, etc.).
/// Includes built-in function/variable/constant recognition.
///
/// Use with [`tree_sitter_highlight::HighlightConfiguration`].
pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");

/// Language injection query. Identifies `#ifdef __cplusplus` / `#ifdef __STDC__`
/// guard blocks and marks their foreign-language content for injection
/// (`cpp` or `c`).
///
/// Requires `OPT.MULTILINGUAL` to be enabled in grammar.js before the C
/// sources are generated.
pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");

/// Local variable tracking query. Defines scopes (functions, blocks, loops)
/// and tracks identifier definitions and references within them.
///
/// Use with [`tree_sitter_highlight::HighlightConfiguration`] for
/// scope-aware highlighting or with code navigation tools.
pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");

/// Tags query for code navigation. Captures function definitions, type
/// definitions, variable declarations, function calls, and type references.
///
/// Use with [`tree_sitter_tags::TagsConfiguration`] for symbol indexing.
pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

/// Version tags query. Captures GLSL constructs whose availability depends
/// on a minimum `#version` (e.g., `uint` requires 130, `double` requires 400).
/// Intended for post-parse validation, not syntax highlighting.
pub const VERSION_TAGS_QUERY: &str = include_str!("../../queries/version-tags.scm");

/// Constructor heuristic query. Identifies function calls where the callee
/// is a user-defined type name (capitalized identifier), which are likely
/// struct constructors. Opt-in — not included in default highlighting.
pub const CONSTRUCTOR_HEURISTICS_QUERY: &str =
    include_str!("../../queries/constructor-heuristics.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading GLSL language");
    }
}
