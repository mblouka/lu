
import * as Parser from '../parser.js'

export interface Renderer {
    /**
     * Render a function.
     */
    closure: (
        tabLevel: number, 
        args: string[], 
        vararg: boolean, 
        stats: Parser.Statement[], 
        index?: [path: string | string[], self: boolean]) => string

    /**
     * Render an expression.
     */
    expression: (tabLevel: number, expr: Parser.Expression | Parser.ExpressionAtom) => string

    /**
     * Render a statement or a list of statements.
     */
    render: (tabLevel: number, statement: Parser.Statement | Parser.Statement[]) => string
}