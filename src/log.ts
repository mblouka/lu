
import ora, { Ora } from 'ora'

export class Spinner {
    private _ora: Ora
    private _warn?: (contents: string) => void

    get text() {
        return this._ora.text
    }

    set text(value: string) {
        this._ora.text = value
    }

    step(status: 'good' | 'bad', text: string) {
        status === 'good' ? this._ora.succeed() : this._ora.fail()
        this._ora = ora(text)
        this._ora.start()
    }

    succeed(text?: string) {
        this._ora?.succeed(text)
    }

    fail(text?: string) {
        this._ora.fail(text)
    }

    warn(text: string) {
        this._warn?.(text)
    }

    constructor(text: string, warn?: (contents: string) => void) {
        this._ora = ora(text)
        this._ora.start()
        this._warn = warn
    }
}