
import fs from 'fs'
import path from 'path'

import {
    transform,
    transformIntrinsics,
    transformImports,
    transformCompounds,
    transformElementConstructors,
    transformAssignmentExpressions,
} from './transform'

import { lex } from './lexer'
import { render } from './renderer'
import { parse, purge } from './parser'

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
        root, config
    }
}

export function make(instance: LuProjectInstance) {
    function transformFile(fileContents: string, filePath: string) {
        const tokens = parse(purge(lex(fileContents)))

        // Do transforms.
        transformAssignmentExpressions(tokens)
        transformCompounds(tokens)
        transformImports(tokens)
        transformIntrinsics(tokens)
        transformElementConstructors(tokens, instance.config.jsxConstructor)

        return render(tokens)
    }

    // Todo: trace 'require' calls after expression visitation is impl.
    // For now, we are single file only.
    if (instance.config.outFile) {
        const outfilePath = path.join(instance.root, instance.config.outFile)
        const entryPath = path.join(instance.root, instance.config.entrypoint)
        const entryScript = fs.readFileSync(entryPath, 'utf-8')

        // Transform the entry script.
        const transformedScript = transformFile(entryScript, entryPath)

        // Write to outfile.
        fs.writeFileSync(outfilePath, transformedScript, 'utf-8')

        return;
    }
}