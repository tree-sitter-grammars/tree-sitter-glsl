package tree_sitter_glsl_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_glsl "github.com/tree-sitter-grammars/tree-sitter-glsl/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_glsl.Language())
	if language == nil {
		t.Errorf("Error loading GLSL grammar")
	}
}
