package tree_sitter_glsl_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	"github.com/tree-sitter-grammars/tree-sitter-glsl"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_glsl.Language())
	if language == nil {
		t.Errorf("Error loading GLSL grammar")
	}
}
