
import * as Parser from './parser';
import Function from './func'
import { Expression, ExpressionArith, ExpressionAtom, Ast, Statement, StatementType, IgnoredStatement, TableConstructor } from './parser';

// deno-lint-ignore no-explicit-any
type TransformCallback = (stat: Statement, block: Statement[], index: number) => any | undefined;
export type Transformer = Partial<Record<StatementType, TransformCallback>>

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
                    const descriptor = new Map<Expression | number, Expression>()

                    // Set name field.
                    descriptor.set(
                        { native: 'name', type: 'string' }, 
                        { native: variable, type: 'string' }
                    )

                    // Set getter.
                    descriptor.set(
                        { native: 'get', type: 'string' },
                        { native: <Function> {
                            vararg: false,
                            args: [],
                            stats: [
                                <Parser.ReturnExpression> {
                                    type: StatementType.ReturnExpression,
                                    line: nextstat.line,
                                    exprs: [ <ExpressionAtom> { native: variable, type: 'var' } ]
                                }
                            ]
                        }, type: 'func'} 
                    )

                    // Set setter.
                    descriptor.set(
                        { native: 'set', type: 'string' },
                        { native: <Function> {
                            vararg: false,
                            args: ['v'],
                            stats: [
                                <Parser.AssignmentStatement> {
                                    type: StatementType.Assignment,
                                    line: nextstat.line,
                                    left: [ <ExpressionAtom> { native: variable, type: 'var' } ],
                                    right: [ <ExpressionAtom> { native: 'v', type: 'var' } ],
                                }
                            ]
                        }, type: 'func'} 
                    )

                    localDescriptors.push(descriptor)
                }

                const atoms = localDescriptors.map(v => <Parser.ExpressionAtom> { native: v , type: 'table' })
                const nstat = <Statement> {
                    type: StatementType.FunctionCall,
                    line: stat.line,
                    expr: stat.expr,
                    args: (stat.args ?? []).concat(atoms)
                }

                block.splice(index + 2, 0, nstat)

            } else if (nextstat.type === StatementType.FunctionDefinition) {
                const funcstat = nextstat as Parser.FunctionDefinition

                // Convert funcpath into expression.
                const funcpath = funcstat.into
                let expr: ExpressionArith | undefined
                
                if (typeof funcpath[0] === 'string') {
                    expr = <ExpressionArith> <unknown> <ExpressionAtom> {
                        type: 'var', native: funcpath[0]
                    }
                } else {
                    funcpath[0].forEach((next, i) => {
                        if (!expr) {
                            expr = <ExpressionArith> {
                                left: { type: 'var', native: next },
                                right: undefined,
                                op: 'exprIndex'
                            }
                        } else {
                            if (funcpath[0][i + 1]) {
                                const nexpr = <ExpressionArith> {
                                    left: { type: 'string', native: next },
                                    right: undefined,
                                    op: 'exprIndex'
                                }

                                expr.right = nexpr
                                expr = nexpr
                            } else {
                                expr.right = { type: 'string', native: next }
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
                        right: { type: 'call', native: (stat.args ?? []).concat(
                            { type: 'string', native: funcsig },
                            { type: 'func', native: funcstat.func }
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
                        right: { type: 'call', native: (stat.args ?? []).concat(
                            { type: 'string', native: `${funcstat.var}(${funcstat.func.args.concat(funcstat.func.vararg ? ['...'] : []).join(', ')})` },
                            { type: 'func', native: funcstat.func }
                        ) }
                    }]
                })
            }

            return IgnoredStatement
        }
    }
}

export default transform