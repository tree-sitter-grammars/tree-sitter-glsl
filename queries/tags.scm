; Types

(struct_specifier
  name: (identifier) @name) @definition.class

(declaration
  name: (identifier) @name
  (field_declaration_list)) @definition.class

; Functions

(function_declarator
  name: (identifier) @name) @definition.function

(function_call
  function: (identifier) @name) @reference.call

(function_call
  function: (field_expression
    field: (field_identifier) @name)) @reference.call

; Variables and constants

(declaration
  (declarator_list
    (declarator
      name: (identifier) @name))) @definition.variable

(declaration
  instance_name: (identifier) @name) @definition.variable

(declaration
  (precision_qualifier)
  (type_specifier
    (type_identifier) @name)) @reference.type

; Type references

(type
  (type_specifier
    (type_identifier) @name)) @reference.type

(parameter_declaration
  type: (type_specifier
    (type_identifier) @name)) @reference.type

(declarator
  (type
    (type_specifier
      (type_identifier) @name))) @reference.type
