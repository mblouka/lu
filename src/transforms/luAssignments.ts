
import * as Parser from '../parser.js'
import { OperatorsUnion } from '../lexer.js'
import { ExpressionArith, ExpressionAtom, Statement, StatementType } from '../parser.js'
import { t, transform } from '../transform.js'

const moveOut = <OperatorsUnion[]> ['=', '+=', '-=', '*=', '/=', '^=', '%=', '..=']

/** 
 * Move assignment expressions out of their expressions and into a statement.
 */
export default function transformAssignmentExpressions(block: Statement[]) {
    transform(block, _=>{}, state => {
        const expr = state.expression
        if ('op' in expr && expr.op !== undefined) {
            if (moveOut.includes(expr.op)) {
                if (expr.op === '=') {
                    state.mutate(t.call(t.closure([
                        <Parser.AssignmentStatement> {
                            type: StatementType.Assignment,
                            left: [expr.left],
                            right: [expr.right],
                            line: state.statement.statement.line
                        },

                        <Parser.ReturnStatement> {
                            type: StatementType.ReturnExpression,
                            exprs: [expr.left],
                            line: state.statement.statement.line
                        },
                    ]), []))
                } else {
                    state.mutate(t.call(t.closure([
                        <Parser.CompoundAssignmentStatement> {
                            type: StatementType.CompoundAssignment,
                            left: expr.left,
                            right: expr.right,
                            op: expr.op,
                            line: state.statement.statement.line
                        },

                        <Parser.ReturnStatement> {
                            type: StatementType.ReturnExpression,
                            exprs: [expr.left],
                            line: state.statement.statement.line
                        },
                    ]), []))
                }
            }
        }
    })
}