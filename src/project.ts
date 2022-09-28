
import fs from 'fs'
import path from 'path'

import { transform } from './transform.js'
import transformBundle from './transforms/luBundling.js'
import transformLu from './transforms/lu.js'
import { resolveDependencies } from './deps.js'

import { Spinner } from './log.js'
import { lex } from './lexer.js'
import { render } from './renderer.js'
import { Expression, ExpressionAtom, parse, purge, Statement, } from './parser.js'

export interface LuProject {
    /**
     * Name of the project. The `__LU_PROJECT__` macro will
     * be filled in with this value.
     */
    name: string

    /**
     * Entrypoint of the project. Defaults to `init.lu`.
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
        config.entrypoint = 'init.lu'
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

export interface RequireProtocolImport {
    /**
     * Name of the package to import.
     */
    readonly name: string

    /**
     * Version of the package to import. Defaults to latest.
     */
    readonly version?: string
}

export interface RequireTrace {
    /**
     * Map of module names to their absolute paths on disk.
     */
    readonly moduleImports: Record<string, string>

    /**
     * Map of module imports from URIs.
     */
    readonly uriImports: string[]

    /**
     * Map of module imports from protocols.
     */
    readonly protocolImports: Record<string, RequireProtocolImport[]>

    /**
     * Unknown imports. Could be inline modules, could be runtime-specific
     * import policy.
     */
    readonly unknownImports: string[]
}

/**
 * Produces a require trace from the file.
 */
export function traceRequires(instance: LuProjectInstance, block: Statement[], log: Spinner) {
    const moduleImports = <Record<string, string>> {}
    const uriImports = <string[]> []
    const protocolImports = <Record<string, RequireProtocolImport[]>> {}
    const unknownImports = <string[]> []

    transform(block, _=>{}, expr => {
        const expression = expr.expression
        if ('right' in expression && !expression.op) {
            if ('value' in expression.left && expression.left.type === 'name' && expression.left.value === 'require') {
                const requireExpr = <ExpressionAtom> expression.right!
                const requirePathAtom = (<Expression[]> requireExpr.value)[0]
                if (requirePathAtom !== undefined && ('value' in requirePathAtom && requirePathAtom.type === 'string')) {
                    let requirePath = <string> requirePathAtom.value

                    // Check if the require path is a protocol.
                    if (/^\w+:/.test(requirePath)) {
                        // Check if normal URL.
                        if (requirePath.startsWith('http') || requirePath.startsWith('https')) {
                            uriImports.push(requirePath)
                            return
                        }

                        // Not URL, protocol import.
                        const extraction = /(\w+):([\w\-\/]+)(@[\w.]+)?/.exec(requirePath)
                        const protocol = extraction?.[1]
                        const packagename = extraction?.[2]
                        const version = extraction?.[3]

                        if (!protocol || !packagename) {
                            log.fail(`Malformed package import near "${requirePath}"`)
                            return
                        }

                        const protocolArray = protocolImports[protocol] ?? []
                        protocolArray.push({ name: packagename, version })
                        protocolImports[protocol] = protocolArray
                    } else {
                        requirePath = requirePath.replace('.', '/')

                        // Check if a local filename exists.
                        const attemptMapLu = path.join(instance.root, !requirePath.endsWith('.lu') ? `${requirePath}.lu` : requirePath)
                        const attemptMapLua = attemptMapLu + 'a'
                        if (fs.existsSync(attemptMapLu)) {
                            moduleImports[requirePath] = fs.realpathSync(attemptMapLu)
                        } else if (fs.existsSync(attemptMapLua)) {
                            moduleImports[requirePath] = fs.realpathSync(attemptMapLua)
                        } else if (instance.config.modules?.find(m => m === requirePath) === undefined) {
                            unknownImports.push(requirePath)
                        }
                    }
                }
            }
        }
    })

    return <RequireTrace> { moduleImports, protocolImports, uriImports, unknownImports }
}

export function transformScriptWithContext(instance: LuProjectInstance, fileContents: string) {
    const tokens = parse(purge(lex(fileContents)))
    // Transform Lu syntax into Lua.
    transformLu(instance.config, tokens)
    return tokens
}

export async function make(instance: LuProjectInstance, log: Spinner): Promise<Notices[]> {
    const notices = <Notices[]> []

    // Find the entry point.
    const entryPath = path.join(instance.root, instance.config.entrypoint)

    // Trace all imports.
    const allTraces = <RequireTrace[]> []
    const globalModuleImports = <Record<string, string>> {}
    const globalModuleParses = <Record<string, Statement[]>> {}
    let entrypointTransformed!: Statement[]

    let toVisit: string[] = [entryPath]
    while (toVisit.length > 0) {
        const next = toVisit.pop()
        if (next) {
            const transformedParse = transformScriptWithContext(instance, fs.readFileSync(next, 'utf-8'))
            globalModuleParses[next] = transformedParse

            // Store entrypoint AST for later.
            if (next === entryPath) {
                entrypointTransformed = transformedParse
            }

            // Trace the requires and store it into the trace collection (to be merged).
            const imports = traceRequires(instance, transformedParse, log)
            allTraces.push(imports)

            // Recursively index the module imports, if any.
            if (Object.keys(imports.moduleImports).length > 0) {
                for (const [importName, importPath] of Object.entries(imports.moduleImports)) {
                    if (!globalModuleImports[importName]) {
                        globalModuleImports[importName] = importPath
                        toVisit.push(importPath)
                    }
                }
            }
        }
    }

    // Merge all traces into one big trace.
    let supertraceModules = <Record<string, string>> {}
    let supertracePackages = <Record<string, RequireProtocolImport[]>> {}
    let supertraceUris: string[] = []

    allTraces.forEach(trace => {
        Object.entries(trace.moduleImports).forEach(([importName, importPath]) => supertraceModules[importName] = importPath)
        Object.entries(trace.protocolImports).forEach(([protocolName, protocolArr]) => {
            const superArr = supertracePackages[protocolName] ?? []
            superArr.push(...protocolArr) // May have duplicates.
            supertracePackages[protocolName] = [...new Set(superArr)] // Using a set erases duplicates.
        })
        supertraceUris.push(...trace.uriImports)
    })

    // Remove URI duplicates.
    supertraceUris = [...new Set(supertraceUris)]

    // Resolve dependencies.
    await resolveDependencies(instance, { 
        uriImports: supertraceUris, 
        protocolImports: supertracePackages,
        moduleImports: supertraceModules,
        unknownImports: []
    }, log)

    // Bundle if requested.
    if (instance.config.bundle && Object.keys(globalModuleImports).length > 0) {
        log.step('good', 'Bundling')
        
        // Bundle up all the scripts.
        transformBundle(entrypointTransformed, globalModuleImports, globalModuleParses)

        // Write to outfile and return.
        const outFile = path.join(instance.root, instance.config.outFile!)
        fs.writeFileSync(outFile, render(entrypointTransformed), 'utf-8')
    }

    return notices
}