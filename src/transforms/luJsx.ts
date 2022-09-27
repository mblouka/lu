
import * as Parser from '../parser.js'
import { Expression, Statement } from '../parser.js'
import { t, transform } from '../transform.js'

/** 
 * Transform element constructors into function calls.
 */
export default function transformElementConstructors(block: Statement[], constructor = 'h') {
    function createCallFor(elem: Parser.ElementConstructor) {
        let elemSource: Expression // Can either be a string literal or a name.
        if (elem.name.substring(0,1) === elem.name.toLowerCase().substring(0,1)) {
            // Assume string value.
            elemSource = t.string(elem.name)
        } else {
            // Assume function value.
            elemSource = t.name(elem.name)
        }

        // Convert children, if any.
        const childrenMap = new Map<number | Parser.Expression, Parser.Expression>()
        elem.children?.forEach((child, i) => {
            if ('value' in child) {
                if (child.type === 'element') {
                    childrenMap.set(t.string(`_${i}`), createCallFor(<Parser.ElementConstructor> child.value))
                }
            }
        })

        return t.call(t.name(constructor), [
            elemSource, t.table(t.object(elem.properties)), t.table(childrenMap)
        ])
    }

    transform(block, _=>{}, state => {
        state.forEachAtom(atom => {
            if (atom.type === 'element') {
                const callfor = createCallFor(<Parser.ElementConstructor> atom.value)
                Object.assign(atom, callfor)
                delete atom['value']
            }
        })
    })
}