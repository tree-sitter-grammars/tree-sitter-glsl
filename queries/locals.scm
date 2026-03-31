; Scopes

(translation_unit) @local.scope
(function_definition) @local.scope
(compound_statement) @local.scope
(if_statement) @local.scope
(switch_statement) @local.scope
(while_statement) @local.scope
(do_statement) @local.scope
(for_statement) @local.scope

; Definitions

(function_declarator
  name: (identifier) @local.definition)

(parameter_declaration
  name: (identifier) @local.definition)

(declarator
  name: (identifier) @local.definition)

(condition
  name: (identifier) @local.definition)

(declaration
  instance_name: (identifier) @local.definition)

; References

(identifier) @local.reference

(function_call
  function: (identifier) @local.reference)
