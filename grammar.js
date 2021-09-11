const C = require("tree-sitter-c/grammar")

module.exports = grammar(C, {
    name: 'glsl',

    rules: {
        _top_level_item: (_, original) => original,

        declaration: ($, original) =>
            seq(
                repeat(
                    choice(
                        'in',
                        'out',
                        'inout',
                        'uniform',
                        'shared',
                        'attribute',
                        'varying',
                        'buffer',
'coherent',
'readonly',
'writeonly',
                        $.layout_specification,
                    )
                ), choice(seq($.identifier, $.field_declaration_list, optional($.identifier), ";"), original)
            ),

        parameter_declaration: ($, original) =>
            seq(
                repeat(
                    choice(
                        'in',
                        'out',
                        'inout',
                        'uniform',
                        'shared',
                        'attribute',
                        'varying',
                        'buffer',
'coherent',
'readonly',
'writeonly',
                        $.layout_specification,
                    )
                ), original
            ),

        layout_specification: ($) => seq("layout", $.layout_qualifiers),
        layout_qualifiers: ($) => seq("(", $.qualifier, repeat(seq(",", $.qualifier)), ")"),
        qualifier: ($) => choice("push_constant", seq($.identifier, "=", $._expression)),
    }
});
