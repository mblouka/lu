#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { format } from 'util'

import { Spinner } from './log.js'
import { project, make, LuProjectInstance, LuProject, Notices } from './project.js'

async function init() {

}

async function repl() {

}

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

    const passed = args.shift()
    if (!passed) {
        console.error('A project, file path, or command must be provided. To enter repl, pass "--repl".')
        return
    }

    // Verify the command first.
    if (passed === '--repl') {
        await repl()
        return
    } else if (passed === '--init') {
        const cwd = process.cwd()
        const proj = path.join(cwd, 'luconfig.json')

        // Create a new, sample project.
        const projectName = args.shift() ?? 'untitled-project'

        // Verify we aren't in the repo.
        if (fs.existsSync(path.join(process.cwd(), 'package.json'))) {
            console.error('Please move out of the repository before creating a Lu project.')
            return
        }

        // Verify if there isn't a project already.
        if (fs.existsSync(proj)) {
            console.error('Project already exists in this directory. Either remove the existing project or create a new one in a different directory.')
            return
        }

        // Default project configuration.
        const defaultConfiguration = <LuProject> { name: projectName, bundle: true, outFile: 'out.lua' }

        // Write sample project.
        fs.writeFileSync(proj, JSON.stringify(defaultConfiguration, null, 4), 'utf-8')

        // Write entrypoint.
        fs.writeFileSync(path.join(cwd, 'init.lua'), `print("Hello world!")`, 'utf-8')

        console.log('Project initiated.')
        return
    }

    let spinner: Spinner
    let proj: LuProjectInstance
    if (passed.endsWith('.lua') || passed.endsWith('.lu')) {
        // Create a virtual project. Second argument is outfile.
        const outPath = args.shift()
        if (!outPath || (!outPath.endsWith('.lua') || !outPath.endsWith('.lu')) || outPath.startsWith('--')) {
            console.error('Out file must be a valid path to a *.lua or a *.lu script.')
            return
        }

        proj = <LuProjectInstance> {
            root: path.dirname(passed),
            config: {
                name: path.basename(passed),
                entrypoint: path.basename(passed),
                outFile: path.basename(path.basename(outPath))
            }
        }
    } else {
        proj = project(passed)
    }


    const notices = <Notices[]> []
    spinner = new Spinner(`Processing project at "${passed}"`, contents => notices.push({ severity: 'warning', text: contents }))

    // Make the project.
    await make(proj, spinner)

    if (notices.length === 0) {
        spinner.succeed('Complete!')
    } else {
        spinner.succeed(`Complete, with ${notices.length === 1 ? '1 notice' : `${notices.length} notices`}:`)
        notices.forEach(notice => {
            notice.severity === 'info' ? console.log(notice.text) : console.warn(notice.text)
        })
    }
}

main(process.argv.splice(2))