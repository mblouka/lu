
import * as Parser from '../parser.js'
import { ExpressionArith, ExpressionAtom, Statement, StatementType } from '../parser.js'
import { t, transform } from '../transform.js'

/**
 * Transforms Lu intrinsics into Lua 5.1-compatible calls.
 */
export default function transformIntrinsics(block: Statement[]) {
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