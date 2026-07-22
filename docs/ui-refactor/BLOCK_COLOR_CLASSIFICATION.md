# Blockly Block Color Classification

## Scope and invariants

Block Lambda has thirteen registered block types. Its grammar has expressions but no separate statement blocks or explicit type-syntax blocks, so the requested broad families are adapted to the language rather than populated artificially. Color communicates only the broad family. Labels, fields, connection compatibility, grammar-aware square connector geometry, inferred-type annotations, warnings, selection, highlighting, execution state, and error reporting continue to provide fine-grained and non-color indicators.

This classification must not change block structure, field names, input or output checks, connection types, serialization, parsing, generated lambda terms, reduction behavior, or the Tude renderer's connector geometry. All lambda-term inputs and outputs use the `LambdaTerm` check and the Tude renderer's square value connection. `lambda_viz_description` is a non-connectable annotation used only by semantic visualizations.

| Category | Blockly style | Semantic color token | Light primary | Dark primary |
|---|---|---|---:|---:|
| Structure | `lambda_structure` | `--grammar-structure` | `#55606c` | `#72716c` |
| Bindings | `lambda_bindings` | `--grammar-bindings` | `#3f6286` | `#486d94` |
| Expressions | `lambda_expressions` | `--grammar-expressions` | `#66547b` | `#716086` |
| Operations | `lambda_operations` | `--grammar-operations` | `#356864` | `#3f7470` |
| Control expressions | `lambda_control` | `--grammar-control` | `#7a4b4e` | `#8b595d` |
| Values and literals | `lambda_values` | `--grammar-values` | `#735e35` | `#806a3d` |
| Semantic-only | `lambda_semantics` | `--grammar-semantics` | `#414c54` | `#5c6870` |

The primary colors are intentionally restrained. Secondary and tertiary renderer colors are darker and lighter variants of the same family and are defined beside these primaries in `src/core/renderer/theme.ts`.

## Complete block classification

In the old-color column, each triplet is primary/secondary/tertiary. Contrast results report white block label against the new primary, followed by new primary against the theme workspace surface (`#f7f8fa` light and `#171a20` dark). All ratios meet WCAG AA for normal label text and the 3:1 non-text boundary target in the theme where that boundary is needed: light blocks have at least 5.84:1 against the light workspace; dark blocks have at least 3.04:1 against the dark workspace.

| Block type identifier | Grammar or AST role | Connector shape | Old color (light; dark) | New category | New semantic color token | Justification | Light-theme contrast result | Dark-theme contrast result |
|---|---|---|---|---|---|---|---:|---:|
| `lambda_variable` | Variable term; AST `var` | Square reporter output; no inputs | `#6341a1/#4f3481/#7c5ab5`; `#7650b5/#5e4091/#906fc6` | Expressions | `--grammar-expressions` | A variable is a term reference, not a declaration; it shares the general expression family with application. | 6.73:1 label; 6.34:1 workspace | 5.65:1 label; 3.09:1 workspace |
| `lambda_abstraction` | Lambda abstraction and binder; AST `abs` | Square reporter output; square `BODY` value socket | `#245ca8/#1d4986/#4277bb`; `#2e68b7/#255392/#4b82c8` | Bindings | `--grammar-bindings` | Introduces a bound parameter and lexical scope. | 6.36:1 label; 5.98:1 workspace | 5.40:1 label; 3.23:1 workspace |
| `lambda_application` | Function application; AST `app` | Square reporter output; square `FUNC` and `ARG` value sockets | `#6341a1/#4f3481/#7c5ab5`; `#7650b5/#5e4091/#906fc6` | Expressions | `--grammar-expressions` | Core term composition belongs to the general expression family. | 6.73:1 label; 6.34:1 workspace | 5.65:1 label; 3.09:1 workspace |
| `lambda_parentheses` | Explicit grouping preserved by the block representation | Square reporter output; square `TERM` value socket | `#116b64/#0e5650/#33847c`; `#17776e/#125f58/#399087` | Structure | `--grammar-structure` | Changes syntactic grouping without introducing a value, operation, or binding. | 6.41:1 label; 6.03:1 workspace | 4.89:1 label; 3.56:1 workspace |
| `lambda_let` | Non-recursive local binder; AST `let` | Square reporter output; square `VALUE` and `BODY` value sockets | `#245ca8/#1d4986/#4277bb`; `#2e68b7/#255392/#4b82c8` | Bindings | `--grammar-bindings` | Introduces a named value and lexical scope. | 6.36:1 label; 5.98:1 workspace | 5.40:1 label; 3.23:1 workspace |
| `lambda_letrec` | Recursive local binder; AST `letrec` | Square reporter output; square `VALUE` and `BODY` value sockets | `#245ca8/#1d4986/#4277bb`; `#2e68b7/#255392/#4b82c8` | Bindings | `--grammar-bindings` | Introduces a recursively scoped name; connector checks continue to distinguish legal composition. | 6.36:1 label; 5.98:1 workspace | 5.40:1 label; 3.23:1 workspace |
| `lambda_number` | Numeric literal; AST `num` | Square reporter output; no inputs | `#7a510d/#62410a/#976b25`; `#8b5d16/#6f4a12/#a57631` | Values and literals | `--grammar-values` | A terminal literal value. | 6.21:1 label; 5.84:1 workspace | 5.19:1 label; 3.36:1 workspace |
| `lambda_boolean` | Boolean literal; AST `bool` | Square reporter output; no inputs | `#7a510d/#62410a/#976b25`; `#8b5d16/#6f4a12/#a57631` | Values and literals | `--grammar-values` | A terminal literal value. | 6.21:1 label; 5.84:1 workspace | 5.19:1 label; 3.36:1 workspace |
| `lambda_number_operator` | Arithmetic expression; AST `numop` | Square reporter output; square `LEFT` and `RIGHT` value sockets | `#146b68/#105653/#368481`; `#18746e/#135d58/#3a8d88` | Operations | `--grammar-operations` | Applies a primitive arithmetic operation to terms. | 6.33:1 label; 5.96:1 workspace | 5.33:1 label; 3.27:1 workspace |
| `lambda_number_comparison` | Numeric comparison expression; AST `cmpop` | Square reporter output; square `LEFT` and `RIGHT` value sockets | `#146b68/#105653/#368481`; `#18746e/#135d58/#3a8d88` | Operations | `--grammar-operations` | Applies a primitive comparison operation; inference, not a unique fill, conveys its result type. | 6.33:1 label; 5.96:1 workspace | 5.33:1 label; 3.27:1 workspace |
| `lambda_boolean_operator` | Boolean operation expression; AST `boolop` | Square reporter output; square `LEFT` and `RIGHT` value sockets | `#146b68/#105653/#368481`; `#18746e/#135d58/#3a8d88` | Operations | `--grammar-operations` | Applies a primitive boolean operation to terms. | 6.33:1 label; 5.96:1 workspace | 5.33:1 label; 3.27:1 workspace |
| `lambda_if` | Conditional expression; AST `if` | Square reporter output; square `COND`, `THEN`, and `ELSE` value sockets | `#87336f/#6c2959/#a34f8c`; `#963f82/#783268/#ae5c9b` | Control expressions | `--grammar-control` | Selects one of two branches and is the grammar's sole control-form expression. | 7.13:1 label; 6.71:1 workspace | 5.70:1 label; 3.06:1 workspace |
| `lambda_viz_description` | Reduction-step annotation; not part of the source AST | No output, previous, next, or value connections | `#46505f/#38404c/#606b7a`; `#505a69/#404854/#6b7686` | Semantic-only | `--grammar-semantics` | Exists only in generated reduction visualizations and remains subordinate to source terms. | 8.80:1 label; 8.28:1 workspace | 5.72:1 label; 3.04:1 workspace |

## State and accessibility contract

- Blockly's selected, disabled, insertion-marker, keyboard-cursor, highlighted/executing, warning, and error mechanisms remain intact; this palette does not replace their outlines, opacity, icons, warning text, or workspace annotations.
- White block labels retain at least 4.5:1 contrast against every primary fill. Editable fields retain separate high-contrast surface, text, and outline tokens.
- The Tude renderer continues mapping reporter connections to square geometry, using 22 by 20 pixel square puzzle sockets, a 16 pixel page gutter, square statement notches, and zero-radius corners. The palette never determines connection compatibility or shape.
- Toolbox cards expose their grammatical family as a presentation data attribute and use the same semantic family token. Search, click-to-add, pointer drag, and Blockly serialization continue to use the block type identifier.
- Unknown block types have no color fallback. The centralized lookup fails explicitly so a newly registered block must be classified deliberately.

## Screenshot coverage

Representative visual baselines cover both light and dark themes and include bindings, general expressions, operations, control expressions, number and boolean literals, the grouping family in the toolbox, and a reduction visualization containing `lambda_viz_description`.

Class declarations, method declarations, statement blocks, and explicit type-syntax blocks are not applicable to this repository's simply typed lambda-calculus grammar and must not be fabricated for screenshot coverage.
