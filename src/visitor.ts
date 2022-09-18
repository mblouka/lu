
import { 
    Statement,
    StatementType,
    Expression,
    ExpressionAtomType,
DoBlock
} from "./parser"

export type Visitor = (object: any) => void
export type VisitorEnum = 'statement' | 'expression'

const cast = <T, X, F extends string>(obj: X, field: F) => <X & { [k in F]: T }> <unknown> obj

export function visit(statements: Statement[], visitors: Partial<Record<VisitorEnum, Visitor>>) {
    const visitStatement = (statement: Statement) => {
        visitors.statement?.(statement)
        if ('stats' in statement) {
            const bruh = cast(statement, 'hi')
            visitStatements((<{stats: Statement[]}> <unknown> statement).stats)
        } else if ('condition' in statement) {

        }
    }

    const visitStatements = (statements: Statement[]) =>
        statements.forEach(visitStatement)

    const visitExpression = (expression: Expression) =>
        visitors.expression?.(expression)

    const visitExpressions = (expressions: Expression[]) =>
        expressions.forEach(visitExpression)
}

export default visit