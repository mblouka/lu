
import * as Parser from '../parser.js'
import { Statement, StatementType, ExpressionArith } from '../parser.js'
import { transform } from '../transform.js'

/**
 * Convert compound statements to normal assignments.
 */
export default function transformCompounds(block: Statement[]) {
    transform(block, state => {
        if (state.statement.type === StatementType.CompoundAssignment) {
            const stat = <Parser.CompoundAssignmentStatement> state.statement
            state.mutate(<Parser.AssignmentStatement> {
                type: StatementType.Assignment,
                line: stat.line,
                left: [stat.left],
                right: [{
                    left: stat.left,
                    right: stat.right,
                    op: stat.op.substring(0, stat.op.indexOf('='))
                } as ExpressionArith]
            })
        }
    })
}