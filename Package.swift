// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterGlsl",
    platforms: [.macOS(.v10_13), .iOS(.v11)],
    products: [
        .library(name: "TreeSitterGlsl", targets: ["TreeSitterGlsl"]),
    ],
    dependencies: [
        .package(name: "SwiftTreeSitter", url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.8.0"),
    ],
    targets: [
        .target(name: "TreeSitterGlsl",
                path: ".",
                exclude: [
                    "Cargo.toml",
                    "CLAUDE.md",
                    "Makefile",
                    "binding.gyp",
                    "bindings/c",
                    "bindings/go",
                    "bindings/node",
                    "bindings/python",
                    "bindings/rust",
                    "builtin.js",
                    "eslint.config.mjs",
                    "extensions.js",
                    "grammar.js",
                    "keywords.js",
                    "package.json",
                    "package-lock.json",
                    "prebuilds",
                    "pyproject.toml",
                    "scripts",
                    "specification",
                    "test",
                    "tsconfig.json",
                    ".gitignore",
                    ".gitmodules",
                ],
                sources: [
                    "src/parser.c",
                    // NOTE: if your language has an external scanner, add it here.
                ],
                resources: [
                    .copy("queries")
                ],
                publicHeadersPath: "bindings/swift",
                cSettings: [.headerSearchPath("src")]),
         .testTarget(
                name: "TreeSitterGlslTests",
                dependencies: [
                    "SwiftTreeSitter",
                    "TreeSitterGlsl",
                ],
                path: "bindings/swift/TreeSitterGlslTests")
    ],
    cLanguageStandard: .c11
)
