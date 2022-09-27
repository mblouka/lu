
import * as Parser from '../parser.js'
import { Expression, ExpressionAtom, Statement, StatementType } from '../parser.js'
import { t, transform } from '../transform.js'

/**
 * Transforms Lu imports into Lua 5.1-compatible imports.
 */
export default function transformImports(block: Statement[]) {
    let count = 0

    transform(block, state => {
        if (state.statement.type === StatementType.ImportStatement) {
            const stat = <Parser.ImportStatement> state.statement
            if (stat.default) {
                state.mutate(<Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: [stat.default],
                    assignment: [t.call(t.name('require'), [stat.path])]
                })
            } else {
                const store = `__import${count++}`

                // Add the require.
                state.insertBefore(<Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: [store],
                    assignment: [t.call(t.name('require'), [stat.path])]
                })

                // Replace the statement with an assignment.
                state.mutate(<Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: stat.variables!,
                    assignment: stat.variables!.map(v => t.expression('nameIndex', t.name(store), t.name(v)))
                })
            }
        }
    })
}