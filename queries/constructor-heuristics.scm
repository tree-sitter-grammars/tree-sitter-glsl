; Opt-in heuristic query for constructor-like user-defined calls.
; Builtin GLSL constructors are already parsed as `constructor_expression`.

(function_call
  function: (type_specifier
    (type_identifier) @name)
  (#match? @name "^[A-Z]")) @reference.constructor
