from unittest import TestCase

import tree_sitter
import tree_sitter_glsl


class TestLanguage(TestCase):
    def test_can_load_grammar(self):
        try:
            tree_sitter.Language(tree_sitter_glsl.language())
        except Exception:
            self.fail("Error loading GLSL grammar")

    def test_parse(self):
        lang = tree_sitter.Language(tree_sitter_glsl.language())
        parser = tree_sitter.Parser(lang)
        tree = parser.parse(
            bytes(
                """
        int main() { return 0; }
        """,
                "utf8"
            )
        )
        assert tree
