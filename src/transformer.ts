
import { OperatorsUnion } from './lexer';
import * as Parser from './parser';
import { Expression, ExpressionArith, ExpressionAtom, Statement, StatementType, IgnoredStatement, Function } from './parser';

type TransformCallback = (stat: Statement, block: Statement[], index: number) => any | undefined;
export type Transformer = Partial<Record<StatementType, TransformCallback>>

export interface TransformState {

}

/**
 * Helper constructors for some things.
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
export function transform(statements: Statement[], transformers: Transformer[]): Statement[] {
    let currentAst = statements

    function visitStatements(statements: Statement[], transformer: Transformer) {
        const dupestats = [...statements]
        dupestats.forEach((stat, i) => {
            if (stat.type === StatementType.DoBlock) {
                visitStatements((<Parser.DoBlock> stat).stats!, transformer)
            }
            const nstat = transformer[stat.type]?.(stat, dupestats, i) ?? stat
            if (nstat) {
                Object.assign(stat, nstat)
            }
        })
        return dupestats
    }

    for (const transformer of transformers) {
        // Visit statements.
        currentAst = visitStatements(currentAst, transformer)
    }

    return currentAst
}

// Minify an AST.
export function minify(): Transformer {
    return {}
}

// Transforms Lu ASTs into Lua 5.1-compatible ASTs.
export function transformIntoLua51(): Transformer {
    return {
        // Transform Luau compound assignments into Lua-compatible assignments.
        [StatementType.CompoundAssignment]: (statement: Parser.Statement, _, __) => {
            const stat = statement as Parser.CompoundAssignmentStatement
            return {
                type: StatementType.Assignment,
                line: stat.line,
                left: [stat.left],
                right: [{
                    left: stat.left,
                    right: stat.right,
                    op: stat.op.substring(0, stat.op.indexOf('='))
                } as ExpressionArith]
            } as Parser.AssignmentStatement;
        }
    }
}

// Transforms Lu imports into Lua 5.1-compatible imports.
export function transformImports(): Transformer {
    let count = 0
    return {
        [StatementType.ImportStatement]: (statement: Parser.Statement, block: Parser.Statement[], index: number) => {
            const stat = statement as Parser.ImportStatement

            if (stat.default) {
                return <Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: [stat.default],
                    assignment: [t.call(t.name('require'), [stat.path])]
                }
            } else {
                const store = `__import${count}`

                // Add the require.
                block.unshift(<Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: [store],
                    assignment: [t.call(t.name('require'), [stat.path])]
                })

                // Replace the statement with an assignment.
                return <Parser.LocalAssignmentStatement> {
                    line: stat.line,
                    type: StatementType.LocalAssignment,
                    vars: stat.variables!,
                    assignment: stat.variables!.map(v => t.expression('nameIndex', t.name(store), t.name(v)))
                }
            }
        }
    }
}

// Transforms Lu intrinsics into Lua 5.1-compatible calls.
export function transformIntrinsics(): Transformer {
    return {
        [StatementType.Intrinsic]: (statement: Parser.Statement, block: Parser.Statement[], index: number) => {
            const stat = statement as Parser.IntrinsicStatement
            const nextstat = block[index + 1]

            if (nextstat.type === StatementType.LocalAssignment) {
                const localstat = nextstat as Parser.LocalAssignmentStatement

                // Build local descriptors.
                const localDescriptors: Parser.TableConstructor[] = []
                for (const variable of localstat.vars) {
                    localDescriptors.push(t.object({
                        name: variable,

                        // Getter.
                        get: t.closure([
                            <Parser.ReturnExpression> {
                                type: StatementType.ReturnExpression,
                                line: nextstat.line,
                                exprs: [ t.name(variable) ]
                            }
                        ]),

                        // Setter.
                        set: t.closure([
                            <Parser.AssignmentStatement> {
                                type: StatementType.Assignment,
                                line: nextstat.line,
                                left: [ t.name(variable) ],
                                right: [ t.name('v') ],
                            }
                        ], ['v'])
                    }))
                }

                block.splice(index + 2, 0, <Statement> {
                    type: StatementType.FunctionCall,
                    line: stat.line,
                    expr: stat.expr,
                    args: (stat.args ?? []).concat(localDescriptors.map(v => t.table(v)))
                })

            } else if (nextstat.type === StatementType.FunctionDefinition) {
                const funcstat = nextstat as Parser.FunctionDefinition

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

                block.splice(index + 1, 1, <Statement> <Parser.AssignmentStatement> {
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
            } else if (nextstat.type === StatementType.LocalFunctionDefinition) {
                const funcstat = nextstat as Parser.LocalFunctionDefinition

                block.splice(index + 1, 1, <Statement> <Parser.LocalAssignmentStatement> {
                    type: StatementType.LocalAssignment,
                    line: stat.line,
                    vars: [funcstat.var],
                    assignment: [{ 
                        left: stat.expr, 
                        right: { type: 'call', value: (stat.args ?? []).concat(
                            t.string(`${funcstat.var}(${funcstat.func.args.concat(funcstat.func.vararg ? ['...'] : []).join(', ')})`),
                            { type: 'func', value: funcstat.func }
                        ) }
                    }]
                })
            }

            return IgnoredStatement
        }
    }
}

export default transform