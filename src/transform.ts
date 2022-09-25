
import { OperatorsUnion } from './lexer';
import * as Parser from './parser';
import { Expression, ExpressionArith, ExpressionAtom, Statement, StatementType, IgnoredStatement, Function } from './parser';

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
        this.block.splice(this._index - 1, 0, newStatement)
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

    /**
     * Get the current expression.
     */
    get expression() {
        return this._expr
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

    constructor(options: TransformStateConstructorOptions, expr: Expression) {
        super(options)
        this._expr = expr
    }
}

/**
 * Helper constructors.
 */
const t = {
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
        return t.atom('var', value)
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
        function visitExpression(expression: Expression) {
            exprVisitor?.(new ExpressionTransformState({ block: statements, parent }, expression))
        }
    
        statements.forEach((stat, i) => {
            // Visit statements and expressions.
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
                        visitExpression(ifstat.condition)
                    }
                    visitStatements(ifstat.stats!, statements)
                    ifstat = ifstat.else
                }
            } else if (stat.type === StatementType.FunctionCall) {
                const funcstat = <Parser.FunctionCall> stat
                visitExpression(funcstat.expr)
                funcstat.args?.forEach(visitExpression)
            } else if (stat.type === StatementType.ReturnExpression) {
                const returnstat = <Parser.ReturnExpression> stat
                returnstat.exprs?.forEach(visitExpression)
            }
            statementVisitor(new StatementTransformState({ block: statements, parent }, i))
        })
    }

    visitStatements(statements)
}

/** ====================== DEFAULT TRANSFORMS **/

// Transforms Lu compound operations.
export function transformCompounds(block: Statement[]) {
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

// Transforms Lu imports into Lua 5.1-compatible imports.
export function transformImports(block: Statement[]) {
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

// Transforms Lu intrinsics into Lua 5.1-compatible calls.
export function transformIntrinsics(block: Statement[]) {
    transform(block, state => {
        if (state.statement.type === StatementType.Intrinsic) {
            const stat = <Parser.IntrinsicStatement> state.statement
            const next = state.next()

            if (next.statement.type === StatementType.LocalAssignment) {
                const localstat = <Parser.LocalAssignmentStatement> next.statement

                // Build local descriptors.
                const localDescriptors: Parser.TableConstructor[] = []
                for (const variable of localstat.vars) {
                    localDescriptors.push(t.object({
                        name: variable,

                        // Getter.
                        get: t.closure([
                            <Parser.ReturnExpression> {
                                type: StatementType.ReturnExpression,
                                line: localstat.line,
                                exprs: [ t.name(variable) ]
                            }
                        ]),

                        // Setter.
                        set: t.closure([
                            <Parser.AssignmentStatement> {
                                type: StatementType.Assignment,
                                line: localstat.line,
                                left: [ t.name(variable) ],
                                right: [ t.name('v') ],
                            }
                        ], ['v'])
                    }))
                }

                next.insertAfter(<Statement> {
                    type: StatementType.FunctionCall,
                    line: stat.line,
                    expr: stat.expr,
                    args: (stat.args ?? []).concat(localDescriptors.map(v => t.table(v)))
                })
            } else if (next.statement.type === StatementType.FunctionDefinition) {
                const funcstat = <Parser.FunctionDefinition> next.statement

                // Convert funcpath into expression.
                const funcpath = funcstat.into
                let expr: ExpressionArith | undefined
                
                if (typeof funcpath[0] === 'string') {
                    expr = <ExpressionArith> <unknown> <ExpressionAtom> t.name(funcpath[0])
                } else {
                    funcpath[0].forEach((next, i) => {
                        if (!expr) {
                            expr = t.expression('exprIndex', t.name(next))
                        } else {
                            if (funcpath[0][i + 1]) {
                                const nexpr = t.expression('exprIndex', t.string(next))
                                expr.right = nexpr
                                expr = nexpr
                            } else {
                                expr.right = t.string(next)
                            }
                        }
                    })
                }

                // Compile funcpath and argslist.
                const pathstr = typeof funcpath[0] === 'string' ? funcpath[0] : funcpath[0].join('.')
                const pathargs = (funcpath[1] ? ['self'] : []).concat(funcstat.func.args).concat(funcstat.func.vararg ? ['...'] : []).join(', ')
                const funcsig = `${pathstr}(${pathargs})`

                // Add "self" argument if necessary.
                if (funcpath[1]) {
                    funcstat.func.args.unshift('self')
                }

                next.mutate(<Statement> <Parser.AssignmentStatement> {
                    type: StatementType.Assignment,
                    line: stat.line,
                    left: [expr],
                    right: [{ 
                        left: stat.expr, 
                        right: { type: 'call', value: (stat.args ?? []).concat(
                            t.string(funcsig),
                            { type: 'func', value: funcstat.func }
                        ) }
                    }]
                })
            } else if (next.statement.type === StatementType.LocalFunctionDefinition) {
                const funcstat = <Parser.LocalFunctionDefinition> next.statement

                next.mutate(<Statement> <Parser.AssignmentStatement> {
                    type: StatementType.Assignment,
                    line: stat.line,
                    left: [t.name(funcstat.var)],
                    right: [{ 
                        left: stat.expr, 
                        right: { type: 'call', value: (stat.args ?? []).concat(
                            t.string(`${funcstat.var}(${funcstat.func.args.concat(funcstat.func.vararg ? ['...'] : []).join(', ')})`),
                            { type: 'func', value: funcstat.func }
                        ) }
                    }]
                })

                // Replace with local assignment.
                return state.mutate(<Parser.LocalAssignmentStatement> {
                    type: StatementType.LocalAssignment,
                    line: stat.line,
                    vars: [funcstat.var]
                })
            }

            // Remove intrinsic.
            state.remove()
        }
    })
}

// Transform element constructors into function calls.
export function transformElementConstructors(block: Statement[], constructor = 'h') {
    function createCallFor(elem: Parser.ElementConstructor) {
        let elemSource: Expression // Can either be a string literal or a name.
        if (elem.name.substring(0,1) === elem.name.toLowerCase().substring(0,1)) {
            // Assume string value.
            elemSource = t.string(elem.name)
        } else {
            // Assume function value.
            elemSource = t.name(elem.name)
        }

        // Convert children, if any.
        const childrenMap = new Map<number | Parser.Expression, Parser.Expression>()
        elem.children?.forEach((child, i) => {
            if ('value' in child) {
                if (child.type === 'element') {
                    childrenMap.set(t.string(`_${i}`), createCallFor(<Parser.ElementConstructor> child.value))
                }
            }
        })

        return t.call(t.name(constructor), [
            elemSource, t.table(t.object(elem.properties)), t.table(childrenMap)
        ])
    }

    transform(block, _=>{}, state => {
        state.forEachAtom(atom => {
            if (atom.type === 'element') {
                const callfor = createCallFor(<Parser.ElementConstructor> atom.value)
                Object.assign(atom, callfor)
                delete atom['value']
            }
        })
    })
}