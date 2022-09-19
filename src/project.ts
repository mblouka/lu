
import fs from 'fs'
import path from 'path'

export interface LuProject {
    /**
     * Name of the project. The `__LU_PROJECT__` macro will
     * be filled in with this value.
     */
    readonly name: string

    /**
     * Entrypoint of the project. Defaults to `init.lua`.
     */
    readonly entrypoint: string

    /**
     * Whether scripts should be bundled into a single file.
     * Incompatible with `outDir` setting, set `outFile` instead.
     */
    readonly bundle?: boolean

    /**
     * Directory to output all Lu scripts. Incompatible with `bundle`
     * setting.
     */
    readonly outDir?: string

    /**
     * File to output the bundle to. Incompatible with `outDir` setting.
     */
    readonly outFile?: string

    /**
     * Name of the jsx constructor. Defaults to `h`.
     */
    readonly jsxConstructor?: string
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
    return <LuProjectInstance> {
        root, config
    }
}

export function make(instance: LuProjectInstance) {
    
}