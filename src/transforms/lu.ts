
import { Statement } from '../parser.js'
import { LuProject } from '../project.js'

import transformAssignmentExpressions from './luAssignments.js'
import transformCompounds from './luCompound.js'
import transformImports from './luImports.js'
import transformIntrinsics from './luIntrinsics.js'
import transformElementConstructors from './luJsx.js'

export default function transformLu(project: LuProject, block: Statement[]) {
    transformAssignmentExpressions(block)
    transformCompounds(block)
    transformImports(block)
    transformIntrinsics(block)
    transformElementConstructors(block, project.jsxConstructor)
}