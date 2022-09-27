
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

import { Spinner } from './log.js'
import { LuProjectInstance, RequireTrace, transformScriptWithContext, traceRequires } from './project.js'

/**
 * Resolve dependencies, installing them into the project. Returns an object to be merged with the module<->AST map.
 */
export async function resolveDependencies(instance: LuProjectInstance, trace: RequireTrace, log: Spinner) {
    // Step 0: Create dependency folder. This will be removed if no dependencies exist.
    const deps = path.join(instance.root, '.lu-modules')
    if (!fs.existsSync(deps)) {
        fs.mkdirSync(deps)
    }
    let hasDeps = false

    // Step 1: Direct-URL dependencies (a la Deno).
    for (const uri of trace.uriImports) {
        log.step('good', `Processing remote dependency "${uri}"`)

        // Fetch the dependency's contents.
        const dependencyContents = await (await fetch(uri)).text()

        // Compile the dependency and trace its own dependencies.
        const dependencyBlock = transformScriptWithContext(instance, dependencyContents)
        const dependencySubdependencies = traceRequires(instance, dependencyBlock, log)


        log.succeed()
    }

    // Step ?: Remove dependencies folder if no deps have been installed.
    if (!hasDeps) {
        fs.rmSync(deps, { recursive: true })
    }

    log.succeed('Processed all dependencies.')
}