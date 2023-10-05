const C = require("tree-sitter-c/grammar")

module.exports = grammar(C, {
    name: 'glsl',

    conflicts: ($, original) => original.concat([
        [$.function_definition, $.declaration],
        [$.declaration]
    ]),

    rules: {
        _top_level_item: (_, original) => choice(
            ...original.members.filter((member) => member.content?.name != '_old_style_function_definition'),
        ),

        _block_item: (_, original) => choice(
            ...original.members.filter((member) => member.content?.name != '_old_style_function_definition'),
        ),

        _top_level_statement: (_, original) => choice(
            ...original.members.concat({
                type: "SYMBOL",
                name: "discard_statement",
            })
        ),

        _non_case_statement: (_, original) => choice(
            ...original.members.concat({
                type: "SYMBOL",
                name: "discard_statement",
            })
        ),

        function_definition: ($, original) => seq(
            optional(
                seq(
                    'subroutine',
                    optional(
                        seq('(', optional($.identifier), repeat(seq(',', $.identifier)), ')')
                    ),
                )
            )
            , original
        ),

        discard_statement: () => seq(
            "discard",
            ";"
        ),

        declaration: ($, original) =>
            choice(seq(choice("invariant", "precise"), $.identifier, ";"), seq(
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
                        'precision',
                        'highp',
                        'mediump',
                        'lowp',
                        'subroutine',
                        'centroid',
                        'sample',
                        'patch',
                        'smooth',
                        'flat',
                        'noperspective',
                        'invariant',
                        'precise',
                        $.extension_storage_class,
                        $.layout_specification,
                    )
                ), choice(seq($.identifier, $.field_declaration_list, optional($.identifier), ";"), original)
            )),

        field_declaration: ($, original) =>
            seq(
                repeat(choice(
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
                    'precision',
                    'highp',
                    'mediump',
                    'lowp',
                    'subroutine',
                    'centroid',
                    'sample',
                    'patch',
                    'smooth',
                    'flat',
                    'noperspective',
                    'invariant',
                    'precise',
                    $.extension_storage_class,
                    $.layout_specification,
                )), original),

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
                        'centroid',
                        'sample',
                        'patch',
                        'smooth',
                        'flat',
                        'noperspective',
                        'precise',
                        $.layout_specification,
                    )
                ), original
            ),

        extension_storage_class: _ => choice(
            'rayPayloadEXT',
            'rayPayloadInEXT',
            'hitAttributeEXT',
            'callableDataEXT',
            'callableDataInEXT',
            'shaderRecordEXT',
            'rayPayloadNV',
            'rayPayloadInNV',
            'hitAttributeNV',
            'callableDataNV',
            'callableDataInNV',
            'shaderRecordNV',
        ),

        layout_specification: ($) => seq("layout", $.layout_qualifiers),
        layout_qualifiers: ($) => seq("(", $.qualifier, repeat(seq(",", $.qualifier)), ")"),
        qualifier: ($) => choice("shared", $.identifier, seq($.identifier, "=", $._expression)),
    }
});
