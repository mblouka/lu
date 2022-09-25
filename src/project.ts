
import fs from 'fs'
import path from 'path'

import {
    transform,
    transformIntrinsics,
    transformImports,
    transformCompounds,
    transformElementConstructors,
    transformAssignmentExpressions,
    t
} from './transform.js'

import { lex } from './lexer.js'
import { render } from './renderer.js'
import { Expression, ExpressionAtom, LocalAssignmentStatement, parse, purge, Statement, StatementType, IfBlock, ReturnExpression, ExpressionArith, AssignmentStatement } from './parser.js'
import ora, { Ora } from 'ora'

export interface LuProject {
    /**
     * Name of the project. The `__LU_PROJECT__` macro will
     * be filled in with this value.
     */
    name: string

    /**
     * Entrypoint of the project. Defaults to `init.lua`.
     */
    entrypoint: string

    /**
     * Whether scripts should be bundled into a single file.
     * Incompatible with `outDir` setting, set `outFile` instead.
     */
    bundle?: boolean

    /**
     * Directory to output all Lu scripts. Incompatible with `bundle`
     * setting.
     */
    outDir?: string

    /**
     * File to output the bundle to. Incompatible with `outDir` setting.
     */
    outFile?: string

    /**
     * Name of the jsx constructor. Defaults to `h`.
     */
    jsxConstructor?: string

    /**
     * Modules guaranteed to exist at runtime.
     */
    modules?: string[]
}

export interface LuProjectInstance {
    /**
     * Root directory of the instance.
     */
    readonly root: string

    /**
     * Configuration file.
     */
    readonly config: LuProject
}

export function project(root: string) {
    const luconfigJsonPath = path.join(root, 'luconfig.json')
    if (!fs.existsSync(luconfigJsonPath)) {
        throw new Error(`Configuration file does not exist at "${luconfigJsonPath}"`)
    }

    const config = <LuProject> JSON.parse(fs.readFileSync(luconfigJsonPath, 'utf-8'))

    // Setup default entrypoint.
    if (!config.entrypoint) {
        config.entrypoint = 'init.lua'
    }

    // Setup default JSX constructor.
    if (!config.jsxConstructor) {
        config.jsxConstructor = 'h'
    }

    return <LuProjectInstance> {
        root: fs.realpathSync(root), config
    }
}

export interface Notices {
    readonly severity: 'info' | 'warning',
    readonly text: string
}

export function make(ora: Ora, instance: LuProjectInstance): Notices[] {
    const notices = <Notices[]> []

    function warn(contents: string) {
        notices.push({ severity: 'warning', text: contents })
    }

    function info(contents: string) {
        notices.push({ severity: 'info', text: contents })
    }

    function doTransforms(fileContents: string, filePath: string) {
        const tokens = parse(purge(lex(fileContents)))

        // Do transforms.
        transformAssignmentExpressions(tokens)
        transformCompounds(tokens)
        transformImports(tokens)
        transformIntrinsics(tokens)
        transformElementConstructors(tokens, instance.config.jsxConstructor)

        return tokens
    }

    function transformFile(fileContents: string, filePath: string) {
        return render(doTransforms(fileContents, filePath))
    }

    // Find the entry point.
    const entryPath = path.join(instance.root, instance.config.entrypoint)

    function traceRequires(from: string, block: Statement[]): Record<string, string> {
        const filemap = <Record<string, string>> {}
        transform(block, _=>{}, expr => {
            const expression = expr.expression
            if ('right' in expression && !expression.op) {
                if ('value' in expression.left && expression.left.type === 'var' && expression.left.value === 'require') {
                    const requireExpr = <ExpressionAtom> expression.right!
                    const requirePathAtom = (<Expression[]> requireExpr.value)[0]
                    if (requirePathAtom !== undefined && ('value' in requirePathAtom && requirePathAtom.type === 'string')) {
                        let requirePath = <string> requirePathAtom.value

                        // Replace . with dashes
                        requirePath = requirePath.replace('.', '/')

                        // Check if a local filename exists.
                        const attemptMapLu = path.join(instance.root, !requirePath.endsWith('.lu') ? `${requirePath}.lu` : requirePath)
                        const attemptMapLua = attemptMapLu + 'a'
                        if (fs.existsSync(attemptMapLu)) {
                            filemap[requirePath] = fs.realpathSync(attemptMapLu)
                        } else if (fs.existsSync(attemptMapLua)) {
                            filemap[requirePath] = fs.realpathSync(attemptMapLua)
                        } else if (instance.config.modules?.find(m => m === requirePath) === undefined) {
                            warn(`Module "${requirePath}" not found (required from "${from}"). If this module is guaranteed to exist at runtime, please add it to "modules" in your luconfig.json.`)
                        }
                    }
                }
            }
        })
        return filemap
    }


    const globalRequireMap = <Record<string, string>> {}
    const globalTransformed = <Record<string, Statement[]>> {}
    let entrypointTransformed!: Statement[]

    // Trace all imports through expression visitation.
    let toVisit: string[] = [entryPath]
    while (toVisit.length > 0) {
        const next = toVisit.pop()
        if (next) {
            const transformed = doTransforms(fs.readFileSync(next, 'utf-8'), next)
            globalTransformed[next] = transformed

            // Store entrypoint AST for later.
            if (next === entryPath) {
                entrypointTransformed = transformed
            }

            const imports = traceRequires(next, transformed)
            if (Object.keys(imports).length > 0) {
                for (const [importName, importPath] of Object.entries(imports)) {
                    if (!globalRequireMap[importName]) {
                        globalRequireMap[importName] = importPath
                        toVisit.push(importPath)
                    }
                }
            }
        }
    }

    // Bundle if requested.
    if (instance.config.bundle && Object.keys(globalRequireMap).length > 0) {
        // Create inline import table.
        ora.text = 'Bundling'
        const importFunctions = new Map<number | Expression, Expression>()
        for (const [importName, importPath] of Object.entries(globalRequireMap)) {
            const importStats = globalTransformed[importPath]
            importFunctions.set(t.string(importName), t.closure(importStats))
        }

        // Prepend import table assignment and require detour. 
        entrypointTransformed.unshift(<LocalAssignmentStatement> {
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
                        <ReturnExpression> {
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
                                        <ReturnExpression> {
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

                <ReturnExpression> {
                    type: StatementType.ReturnExpression,
                    line: 0,
                    exprs: [t.call(t.name('__LU_UNPACK'), [t.name('tryCache')])]
                }
            ], ['input'])],
            type: StatementType.LocalAssignment,
        })

        // Write to outfile and return.
        const outFile = path.join(instance.root, instance.config.outFile!)
        fs.writeFileSync(outFile, render(entrypointTransformed), 'utf-8')
    }

    return notices
}