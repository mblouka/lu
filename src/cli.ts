#!/usr/bin/env node

import path from 'path'
import { project, make, LuProjectInstance } from './project'

async function main(args: string[]) {
    const passedPath = args.shift()
    if (!passedPath) {
        console.error('Arguments are missing!')
        return
    }

    let proj: LuProjectInstance
    if (passedPath.endsWith('.lua') || passedPath.endsWith('.lu')) {
        // Create a virtual project. Second argument is outfile.
        const outPath = args.shift()
        if (!outPath || (!outPath.endsWith('.lua') || !outPath.endsWith('.lu')) || outPath.startsWith('--')) {
            console.error('Out file must be a valid path to a *.lua or a *.lu script.')
            return
        }

        proj = <LuProjectInstance> {
            root: path.dirname(passedPath),
            config: {
                name: path.basename(passedPath),
                entrypoint: path.basename(passedPath),
                outFile: path.basename(path.basename(outPath))
            }
        }
    } else {
        proj = project(passedPath)
    }

    // Make the project.
    make(proj)
}

main(process.argv.splice(2))