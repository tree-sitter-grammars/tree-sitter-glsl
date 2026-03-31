# tree-sitter-glsl

[![CI][ci]](https://github.com/tree-sitter-grammars/tree-sitter-glsl/actions/workflows/ci.yml)
[![discord][discord]](https://discord.gg/w7nTvsVJhm)
[![matrix][matrix]](https://matrix.to/#/#tree-sitter-chat:matrix.org)
[![npm][npm]](https://www.npmjs.com/package/tree-sitter-glsl)
[![crates][crates]](https://crates.io/crates/tree-sitter-glsl)
[![pypi][pypi]](https://pypi.org/project/tree-sitter-glsl)

A [specification](https://github.com/KhronosGroup/GLSL)-compliant GLSL and ESSL
parser for [tree-sitter](https://tree-sitter.github.io/) covering the full GLSL
4.60 core grammar, all current Khronos extensions, and common real-world macro
patterns.

## Why not inherit from tree-sitter-c?

GLSL's syntax is C-like but substantially simpler. A dedicated grammar provides:

- **Fewer ambiguities** — 1 GLR conflict (without macros) vs C's 16. No pointers,
  no K&R functions, no multi-word types, no `sizeof`/`typeof`, no casts.
- **Flat expression trees** — identifiers and literals appear directly in the tree
  without the `unary_expression > postfix_expression > primary_expression` wrapper
  chain that a C-inherited grammar produces.
- **GLSL-native nodes** — layout qualifiers with `name:`/`value:` fields, precision
  qualifiers, interface blocks, `demote`/`terminateInvocation` extension statements.
- **Specification fidelity** — every BNF production from the spec exists as a
  (hidden or visible) rule, documented with the original grammar notation.

## Features

- Full GLSL 4.60 and ESSL 3.20 grammar
- All Khronos extension keywords, types, built-in functions, and variables
- Structured preprocessor parsing (`#define`, `#if`/`#ifdef`/`#elif`/`#else`)
- Macro expansion support for real-world shaders (`COMPAT_PRECISION`, `MYTYPE(args)`)
- Multilingual header support (`#ifdef __cplusplus` language injection)
- Extension-defined grammar rules (`demote`, `terminateInvocation`)

## Queries

| File | Purpose |
|------|---------|
| `highlights.scm` | Syntax highlighting with built-in function/variable/constant recognition |
| `injections.scm` | Language injection for `#ifdef __cplusplus` / `__STDC__` guards |
| `locals.scm` | Scope-aware local variable tracking |
| `tags.scm` | Symbol indexing for code navigation |
| `version-tags.scm` | `#version`-dependent construct validation |
| `constructor-heuristics.scm` | Opt-in heuristic for capitalized constructor calls |

## Usage

### Node.js

```javascript
const Parser = require('tree-sitter');
const GLSL = require('tree-sitter-glsl');

const parser = new Parser();
parser.setLanguage(GLSL);
const tree = parser.parse('void main() { gl_FragColor = vec4(1.0); }');
```

### Rust

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_glsl::LANGUAGE.into()).unwrap();
let tree = parser.parse("void main() { gl_FragColor = vec4(1.0); }", None).unwrap();
```

### Python

```python
import tree_sitter_glsl as glsl
from tree_sitter import Parser

parser = Parser(glsl.language())
tree = parser.parse(b"void main() { gl_FragColor = vec4(1.0); }")
```

## Development

```bash
npm install                              # Install dependencies
npx tree-sitter generate                 # Regenerate parser from grammar.js
npx tree-sitter test                     # Run corpus tests
npx eslint                              # Lint
npx tsc --noEmit                         # Type check
node scripts/audit_node_types.js --coverage   # Grammar coverage analysis
```

The specification is included as a [git submodule](https://github.com/KhronosGroup/GLSL).
Run `git submodule update --init` to fetch it for spec-scraping scripts.

## References

- Specification Document: [Khronos - The OpenGL Shading Language, Version 4.60](https://registry.khronos.org/OpenGL/specs/gl/GLSLangSpec.4.60.pdf)
- Specification Repository (BNF): [GitHub - KhronosGroup/GLSL](https://github.com/KhronosGroup/GLSL)

## License

This project is licensed under the [MIT](./LICENSE) license.

[ci]: https://github.com/tree-sitter-grammars/tree-sitter-glsl/actions/workflows/ci.yml/badge.svg
[discord]: https://img.shields.io/discord/1063097320771698699?logo=discord&label=discord
[matrix]: https://img.shields.io/matrix/tree-sitter-chat%3Amatrix.org?logo=matrix&label=matrix
[npm]: https://img.shields.io/npm/v/tree-sitter-glsl?logo=npm
[crates]: https://img.shields.io/crates/v/tree-sitter-glsl?logo=rust
[pypi]: https://img.shields.io/pypi/v/tree-sitter-glsl?logo=pypi&logoColor=ffd242
