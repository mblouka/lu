
import { OperatorsUnion } from './lexer.js';
import * as Parser from './parser.js';
import { Expression, ExpressionArith, ExpressionAtom, Statement, StatementType, IgnoredStatement, Function } from './parser.js';

export interface TransformStateConstructorOptions {
    block: Statement[]
    parent?: Statement[]
}

export class TransformState {
    /**
     * Block currently being transformed.
     */
    readonly block: Statement[]

    /**
     * Parent of block.
     */
    readonly parent?: Statement[]

    constructor(options: TransformStateConstructorOptions) {
        this.block = options.block
        this.parent = options.parent
    }
}

export type StatementTransformCallback = (state: StatementTransformState) => void
export class StatementTransformState extends TransformState {
    private _index: number
    private _statement: Statement
    
    /**
     * Get the current statement.
     */
    get statement() {
        return this._statement
    }

    /**
     * Replace the current statement.
     */
    mutate(newStatement: Statement) {
        this.block.splice(this._index, 1, newStatement)
    }

    /**
     * Insert a statement after this one.
     */
    insertAfter(newStatement: Statement) {
        this.block.splice(this._index + 1, 0, newStatement)
    }

    /**
     * Insert a statement before this one.
     */
    insertBefore(newStatement: Statement) {
        this.block.splice(this._index, 0, newStatement)
        this._index += 1
    }

    /**
     * Remove the current statement.
     */
    remove() {
        this.block.splice(this._index, 1)
        this._index = -1
    }

    /**
     * Get the next statement.
     */
    next() {
        return new StatementTransformState({ 
            block: this.block, parent: this.parent 
        }, this._index + 1)
    }

    constructor(options: TransformStateConstructorOptions, index: number) {
        super(options)
        this._index = index
        this._statement = this.block[index]
    }
}

export type ExpressionTransformCallback = (state: ExpressionTransformState) => void
export class ExpressionTransformState extends TransformState {
    private _expr: Expression
    private _stat: StatementTransformState

    /**
     * Get the current expression.
     */
    get expression() {
        return this._expr
    }

    /**
     * Get the statement transform state in which the expression is located.
     */
    get statement() {
        return this._stat
    }

    /**
     * Iterate over atoms.
     */
    forEachAtom(callback: (atom: ExpressionAtom) => void, thisAtom?: Expression) {
        const select = thisAtom ?? this._expr
        if ('value' in select) {
            callback(select)
        } else {
            const expr = <ExpressionArith> select
            this.forEachAtom(callback, expr.left)
            if (expr.right) {
                this.forEachAtom(callback, expr.right)
            }
        }
    }

    /**
     * Replace the current expression.
     */
    mutate(newExpression: Expression) {
        const exprAsObject = <any> this._expr
        for (var variableKey in exprAsObject) {
            if (exprAsObject.hasOwnProperty(variableKey)) {
                delete exprAsObject[variableKey]
            }
        }
        Object.assign(exprAsObject, newExpression)
    }

    constructor(options: TransformStateConstructorOptions, stat: StatementTransformState, expr: Expression) {
        super(options)
        this._stat = stat
        this._expr = expr
    }
}

/**
 * Helper constructors.
 */
export const t = {
    expression(op: OperatorsUnion | { op: OperatorsUnion, unary: boolean }, left: Expression, right?: Expression) {
        return <ExpressionArith> {
            left, right, op: typeof op === 'string' ? op : op.op, unary: typeof op === 'string' ? false : op.unary
        }
    },

    atom(type: Parser.ExpressionAtomType, value: ExpressionAtom['value']) {
        return <ExpressionAtom> { type, value }
    },

    nil() {
        return t.atom('nil', undefined)
    },

    string(value: string) {
        return t.atom('string', value)
    },

    number(value: number) {
        return t.atom('number', value)
    },

    boolean(value: boolean) {
        return t.atom('boolean', value)
    },

    name(value: string) {
        return t.atom('name', value)
    },

    table(value: Parser.TableConstructor) {
        return t.atom('table', value)
    },

    call(expr: Parser.Expression, args: Parser.Expression[]) {
        return <ExpressionArith> <unknown> {
            left: expr,
            right: t.atom('call', args)
        }
    },

    closure(statements: Statement[], args?: string[], vararg?: boolean) {
        return t.atom('func', {
            stats: statements,
            args: args ?? [],
            vararg: vararg ?? false
        })
    },

    array(values: (ExpressionAtom['value'] | Expression)[]) {
        const tbl = new Map<number | Parser.Expression, Parser.Expression>()
        let index = 0
        for (const v of values) {
            let value: Expression
            if (typeof v === 'string') {
                value = t.string(v)
            } else if (typeof v === 'number') {
                value = t.number(v)
            } else if (typeof v === 'boolean') {
                value = t.boolean(v)
            } else if (typeof v === 'undefined') {
                value = t.nil()
            } else {
                if ('type' in v || 'op' in v || 'right' in v) {
                    value = v
                } else if ('stats' in v) {
                    value = { type: 'func', value: v }
                } else if ('properties' in v) {
                    value = { type: 'element', value: v }
                } else if (v instanceof Map) {
                    value = { type: 'table', value: v }
                } else {
                    value = t.table(t.object(<Record<string | number, ExpressionAtom['value'] | Expression>> <unknown> v))
                }
            }

            tbl.set(index++, value)
        }
        return tbl
    },

    object(value: Record<string | number, ExpressionAtom['value'] | Expression>) {
        const tbl = new Map<number | Parser.Expression, Parser.Expression>()
        for (const [key, v] of Object.entries(value)) {
            let value: Expression
            if (typeof v === 'string') {
                value = t.string(v)
            } else if (typeof v === 'number') {
                value = t.number(v)
            } else if (typeof v === 'boolean') {
                value = t.boolean(v)
            } else if (typeof v === 'undefined') {
                value = t.nil()
            } else {
                if ('type' in v || 'op' in v) {
                    value = v
                } else if ('stats' in v) {
                    value = { type: 'func', value: v }
                } else if ('properties' in v) {
                    value = { type: 'element', value: v }
                } else if (v instanceof Map) {
                    value = { type: 'table', value: v }
                } else {
                    value = t.table(t.object(<Record<string | number, ExpressionAtom['value'] | Expression>> <unknown> v))
                }
            }

            if (typeof key === 'string') {
                tbl.set(t.string(key), value)
            } else {
                tbl.set(key, value)
            }
        }
        return tbl
    }
}

/**
 * Apply transformations to a given list of statements.
 */
 export function transform(statements: Statement[], statementVisitor: StatementTransformCallback, exprVisitor?: ExpressionTransformCallback) {
    function visitStatements(statements: Statement[], parent?: Statement[]) {
        function visitExpression(statement: StatementTransformState, expression: Expression) {
            if ('left' in expression) {
                visitExpression(statement, expression.left)
                if (expression.right) {
                    visitExpression(statement, expression.right)
                }
            }

            if ('value' in expression) {
                if (expression.type === 'func') {
                    const func = <Function> expression.value
                    visitStatements(func.stats, statements)
                }
            }

            exprVisitor?.(new ExpressionTransformState({ block: statements, parent }, statement, expression))
        }
    
        statements.forEach((stat, i) => {
            // Visit statements and expressions.
            const transformState = new StatementTransformState({ block: statements, parent }, i)
            if (
                stat.type === StatementType.DoBlock ||
                stat.type === StatementType.ForGenericBlock || 
                stat.type === StatementType.ForNumericBlock ||
                stat.type === StatementType.RepeatBlock ||
                stat.type === StatementType.WhileBlock
            ) {
                visitStatements((<Statement & { stats?: Statement[] }> stat).stats!, statements)
            } else if (stat.type === StatementType.FunctionDefinition || stat.type === StatementType.LocalFunctionDefinition) {
                visitStatements((<Parser.FunctionDefinition | Parser.LocalFunctionDefinition> stat).func.stats, statements)
            } else if (stat.type === StatementType.IfBlock) {
                let ifstat = <Parser.IfBlock | undefined> stat
                while (ifstat) {
                    if (ifstat.condition) {
                        visitExpression(transformState, ifstat.condition)
                    }
                    visitStatements(ifstat.stats!, statements)
                    ifstat = ifstat.else
                }
            } else if (stat.type === StatementType.FunctionCall) {
                const funcstat = <Parser.FunctionCall> stat
                visitExpression(transformState, funcstat.expr)
                funcstat.args?.forEach(arg => visitExpression(transformState, arg))
            } else if (stat.type === StatementType.ReturnExpression) {
                const returnstat = <Parser.ReturnStatement> stat
                returnstat.exprs?.forEach(expr => visitExpression(transformState, expr))
            } else if (stat.type === StatementType.Assignment) {
                const assignstat = <Parser.AssignmentStatement> stat
                assignstat.left.forEach(expr => visitExpression(transformState, expr))
                assignstat.right.forEach(expr => visitExpression(transformState, expr))
            } else if (stat.type === StatementType.LocalAssignment) {
                const assignstat = <Parser.LocalAssignmentStatement> stat
                assignstat.assignment?.forEach(expr => visitExpression(transformState, expr))
            }
            statementVisitor(transformState)
        })
    }

    visitStatements(statements)
}