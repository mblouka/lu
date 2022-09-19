
import lex from './lexer'
import render from './renderer'
import { parse, purge } from './parser'

// Lua 5.1 transform target.
import { transform, transformCompounds, transformIntrinsics, transformImports } from './transformer'

const testScript = `

local a = -1

`

// Obtain tokens and purge whitespace and comments.
const tokens = purge(lex(testScript))

// Parse the tokens into an AST.
const ast = parse(tokens)

// Transform the tokens using the Lua 5.1 transform target.
//const lua51ast = transform(ast, [transformIntoLua51()])
const postast = transform(ast, [transformIntrinsics(), transformImports()])

// Render and print.
console.log(render(postast))