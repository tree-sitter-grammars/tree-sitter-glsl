import XCTest
import SwiftTreeSitter
import TreeSitterGLSL

final class TreeSitterGLSLTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_glsl())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading GLSL grammar")
    }
}
