#!/usr/bin/env node

import path from 'path'
import { format } from 'util'
import ora, { Ora } from 'ora'
import { project, make, LuProjectInstance } from './project.js'

async function main(args: string[]) {
    // Replace methods with pretty prints.
    const oldLog = console.log
    console.log = (fmt: string, ...args: any[]) => {
        oldLog(`💬 ${format(fmt, ...args)}`)
    }

    const oldWarn = console.warn
    console.warn = (fmt: string, ...args: any[]) => {
        oldWarn(`⚠️ ${format(fmt, ...args)}`)
    }

    const oldError = console.error
    console.error = (fmt: string, ...args: any[]) => {
        oldError(`⛔ ${format(fmt, ...args)}`)
    }

    console.log('lu @https://github.com/ccrpr/lu')

    const passedPath = args.shift()
    if (!passedPath) {
        console.error('A project or file path must be provided. To enter repl, pass "--repl".')
        return
    }

    let process: Ora
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

    process = ora(`Processing project at "${passedPath}"`)
    process.start()

    // Make the project.
    const notices = make(process, proj)

    if (notices.length === 0) {
        process.succeed('Complete!')
    } else {
        process.succeed(`Complete, with ${notices.length === 1 ? '1 notice' : `${notices.length} notices`}:`)
        notices.forEach(notice => {
            notice.severity === 'info' ? console.log(notice.text) : console.warn(notice.text)
        })
    }
}

main(process.argv.splice(2))