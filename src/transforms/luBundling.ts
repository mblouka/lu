import { t } from '../transform.js'
import { 
    Expression, 
    LocalAssignmentStatement, 
    Statement, 
    StatementType, 
    IfBlock, 
    ReturnStatement, 
    ExpressionArith, 
    AssignmentStatement 
} from '../parser.js'

/**
 * Bundles up several Lu/Lua scripts into a single one.
 * @param requireMap A map of module names to their paths on disk.
 * @param requireBlocks A map of module paths to their parse.
 */
export default function transformBundle(block: Statement[], requireMap: Record<string, string>, requireBlocks: Record<string, Statement[]>) {
    const importFunctions = new Map<number | Expression, Expression>()
    for (const [importName, importPath] of Object.entries(requireMap)) {
        const importStats = requireBlocks[importPath]
        importFunctions.set(t.string(importName), t.closure(importStats))
    }

    // Prepend import table assignment and require detour. 
    block.unshift(<LocalAssignmentStatement> {
        line: 0,
        vars: ['__LU_REQUIRE', '__LU_UNPACK', '__LU_IMPORT_CACHE'],
        assignment: [t.name('require'), <ExpressionArith> { 
            left: t.name('unpack'),
            right: t.name('table.unpack'),
            op: 'or'
        }, t.table(t.object({}))],
        type: StatementType.LocalAssignment,
    }, <LocalAssignmentStatement> {
        line: 0,
        vars: ['__LU_IMPORT_TABLE'],
        assignment: [t.table(importFunctions)],
        type: StatementType.LocalAssignment,
    }, <LocalAssignmentStatement> {
        line: 2,
        vars: ['require'],
        assignment: [t.closure([
            <LocalAssignmentStatement> {
                type: StatementType.LocalAssignment,
                line: 0,
                vars: ['tryCache'],
                assignment: [t.expression('exprIndex', t.name('__LU_IMPORT_CACHE'), t.name('input'))]
            },

            <IfBlock> {
                type: StatementType.IfBlock,
                line: 0,
                condition: t.name('tryCache'),
                stats: [
                    <ReturnStatement> {
                        type: StatementType.ReturnExpression,
                        line: 0,
                        exprs: [t.call(t.name('__LU_UNPACK'), [t.name('tryCache')])]
                    }
                ],
                else: <IfBlock> {
                    type: StatementType.IfBlock,
                    line: 0,
                    stats: [
                        <LocalAssignmentStatement> {
                            type: StatementType.LocalAssignment,
                            line: 0,
                            vars: ['module'],
                            assignment: [t.expression('exprIndex', t.name('__LU_IMPORT_TABLE'), t.name('input'))]
                        },

                        <IfBlock> {
                            type: StatementType.IfBlock,
                            line: 0,
                            condition: t.name('module'),
                            stats: [
                                <AssignmentStatement> {
                                    type: StatementType.Assignment,
                                    line: 0,
                                    left: [t.name('tryCache')],
                                    right: [t.table(
                                        t.array([
                                            t.call(
                                                t.name('module'), 
                                            [])
                                        ])    
                                    )]
                                },
    
                                <AssignmentStatement> {
                                    type: StatementType.Assignment,
                                    line: 0,
                                    left: [t.expression('exprIndex', t.name('__LU_IMPORT_CACHE'), t.name('input'))],
                                    right: [t.name('tryCache')]
                                }
                            ],
                            else: <IfBlock> {
                                type: StatementType.IfBlock,
                                line: 0,
                                stats: [
                                    <ReturnStatement> {
                                        type: StatementType.ReturnExpression,
                                        line: 0,
                                        exprs: [t.call(t.name('__LU_REQUIRE'), [t.name('input')])]
                                    }
                                ]
                            }
                        },
                    ],
                }
            },

            <ReturnStatement> {
                type: StatementType.ReturnExpression,
                line: 0,
                exprs: [t.call(t.name('__LU_UNPACK'), [t.name('tryCache')])]
            }
        ], ['input'])],
        type: StatementType.LocalAssignment,
    })
}