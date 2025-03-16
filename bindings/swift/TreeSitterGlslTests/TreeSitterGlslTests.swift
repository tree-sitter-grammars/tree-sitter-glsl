import XCTest
import SwiftTreeSitter
import TreeSitterGlsl

final class TreeSitterGlsl: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_glsl())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading GLSL grammar")
    }
}
