

// Necessary for loading in transformers.

import { TokenType, Token, TokenValue, WordsUnion, OperatorsUnion } from './lexer.js';

export enum StatementType {
    Constructor,
    ReturnExpression,
    LocalFunctionDefinition,
    FunctionDefinition,
    LocalAssignment,
    CompoundAssignment,
    Assignment,
    FunctionCall,
    BreakStatement,

    DoBlock,
    WhileBlock,
    RepeatBlock,
    IfBlock,
    ForGenericBlock,
    ForNumericBlock,

    // Lu-specific statements
    Intrinsic,
    ImportStatement,
    
    // No statement
    Ignore
}

export interface Statement { 
    type: StatementType
    line: number 
}

export interface TypeDeclaration {
    /**
     * A primitive type is one declared in the parser.
     * A user type is one declared by the user.
     */
    degree: 'primitive' | 'user'

    /**
     * `named`: `local x: name`  
     * `function`: `local x: () -> ()`  
     * `tuple`: `local x: { a: number, b: number, ... }`  
     * `array`: `local x: { [key]: number }`
     */
    type: 'named' | 'function' | 'tuple' | 'array'

    /**
     * `type name<Generic1, Generic2, ...> = ...`
     */
    generic?: string[]
}

export type ReturnStatement =
    Statement & { exprs?: Expression[] };
export type LocalFunctionDefinition =
    Statement & { var: string, func: Function, exported?: boolean };
export type FunctionDefinition =
    Statement & { into: [path: string | string[], self: boolean], func: Function };
export type LocalAssignmentStatement = 
    Statement & { vars: string[], assignment?: Expression[], exported?: boolean };
export type CompoundAssignmentStatement = 
    Statement & { left: Expression, right: Expression, op: OperatorsUnion };
export type AssignmentStatement = 
    Statement & { left: Expression[], right: Expression[] };
export type FunctionCall =
    Statement & { expr: Expression, args?: Expression[] };
export type BreakStatement = 
    Statement;
export type ContinueStatement =
    Statement;

// Lu statements
export type IntrinsicStatement =
    Statement & { expr: Expression, args?: Expression[] };
export type ImportStatement =
    Statement & { default?: string, variables?: string[], path: Expression }

// Pseudo statements
export type IgnoreStatement =
    Statement;

export type DoBlock =
    Statement & { stats?: Statement[] };
export type WhileBlock =
    Statement & { condition: Expression; stats?: Statement[] };
export type RepeatBlock =
    Statement & { condition: Expression; stats?: Statement[] };
export type IfBlock =
    Statement & { condition?: Expression; stats?: Statement[]; else?: IfBlock };
export type ForGenericBlock =
    Statement & { vars: string[]; exprs: Expression[], stats: Statement[] };
export type ForNumericBlock =
    Statement & { var: string; start: Expression; end: Expression; step?: Expression; stats: Statement[] };

export interface Function {
    stats: Statement[];
    vararg: boolean;
    args: string[];
}

export type Ast = Statement[];

/**
 * Provides an inline constructor for a table.
 */
export type TableConstructor = 
    Map<Expression | number, Expression>

/**
 * Provides an inline constructor for a jsx element.
 */
export interface ElementConstructor {
    /**
     * Name of the element. <name/> or <name></name>
     */
    name: string

    /**
     * Properties of the element.
     */
    properties: Record<string, Expression>

    /**
     * Children of the element.
     */
    children?: Expression[]
}

export type ExpressionAtomType = 
    'number'        // 123, 456.01 0xabc, 0b10101
    | 'string'      // "Hello", 'hello', [[hello]], [=[hello]=]
    | 'boolean'     // true, false
    | 'nil'         // nil
    | 'name'        // var1 var2 var3
    | 'func'        // function(...) --[[body]] end
    | 'vararg'      // ...
    | 'call'        // {expr}(...)
    | 'index'       // expr[index]
    | 'table'       // { ... }
    | 'element'     // <elem/>

/**
 * Atoms are the lowest degree elements in an expression.
 */
export interface ExpressionAtom {
    value: number | string | boolean | undefined | Function | Expression[] | TableConstructor | ElementConstructor
    type: ExpressionAtomType
}

export interface ExpressionArith {
    left: Expression | ExpressionAtom;
    right?: Expression | ExpressionAtom;
    op?: OperatorsUnion;
    unary?: boolean;
}

export type Expression = ExpressionArith | ExpressionAtom;

export const IgnoredStatement = <IgnoreStatement> { type: StatementType.Ignore, line: -1 }

export const ExprOpPrecedence: Partial<{ [k in OperatorsUnion | string]: number }> = {
    '^': 8,
    'not': -1, '- (unary)': -1,
    '*': 6, '/': 6,
    '+': 5, '-': 5,
    '..': 4, '+=': 4, '-=': 4, '*=': 4, '/=': 4, '%=': 4, '^=': 4, '..=': 4, '=': 4,
    '<': 3, '>': 3, '<=': 3, '>=': 3, '~=': 3, '==': 3, '@': 3,
    'and': 2,
    'or': 1
}

export const ExprOpAssociate: Partial<{ [k in OperatorsUnion]: 'left' | 'right'}> = {
    '^': 'right',
    '..': 'right'
}

/* Parser implementation. */
export function parse(tokens: Token[]): Statement[] {
    let [i, length] = [0, tokens.length]

    const eob = () => i >= length

    /**
     * Test a token against a type and an optional value.
     */
    const test = (type: TokenType, value?: TokenValue) => 
        tokens[i].type === type && (!value || tokens[i].value === value)

    /**
     * Test a token against a type and multiple values.
     */
    const testMany = (type: TokenType, values: TokenValue[]) =>
        tokens[i].type === type && values.includes(tokens[i].value)

    /**
     * Test a lookahead token against a type and a value.
     */
    const testLookahead = (lookahead: number, type: TokenType, value?: TokenValue) =>
        tokens[i + lookahead].type === type && (!value || tokens[i + lookahead].value === value)

    /**
     * Test the current token and skip to next token if successful.
     */
    const testNext = (type: TokenType, value?: TokenValue) =>
        !eob() && (test(type, value) ? (i++, true) : false)

    /**
     * Errors if the provided expression is falsy.
     */
    const assert = (expr: boolean, message: string) =>
        !expr && (() => { throw new Error(`script:${tokens[i]?.line}: ${message}`) })()

    /**
     * Expect a test and throw if it fails.
     */
    const expect = <T extends TokenValue = TokenValue> (type: TokenType, value?: TokenValue, skip?: boolean) => {
        const current = tokens[i]
        assert(test(type, value), `Expected ${value ? `'${value}'` : TokenType[type]}, got ${TokenType[current.type]} near '${current.value}'`)
        if (skip) {
            i++ // For convenience
        }
        return current.value as T
    }

    /**
     * ===========================
     * Expression parsers
     * ===========================
     */

    function table(): TableConstructor {
        expect(TokenType.Operator, '{', true)

        let tableArrayIndex = 0
        const tableConstructor = new Map<Expression | number, Expression>()

        while (!eob()) {
            if (test(TokenType.Name) && testLookahead(1, TokenType.Operator, '=')) {
                const str = expect<string>(TokenType.Name, undefined, true);
                expect(TokenType.Operator, '=', true)
                tableConstructor.set({ type: 'string', value: str }, expression())
            } else if (testNext(TokenType.Operator, '[')) {
                const key = expression()
                expect(TokenType.Operator, ']', true)
                expect(TokenType.Operator, '=', true)
                tableConstructor.set(key, expression())
            } else if (testNext(TokenType.Operator, '}')) {
                break
            } else if (testNext(TokenType.Word, 'function')) {
                const varkey = <string> expect(TokenType.Name, undefined, true)
                const [fargs, vararg] = args()
                const fblock = block('endBlock')
                tableConstructor.set({ type: 'string', value: varkey }, { 
                    type: 'func', 
                    value: { 
                        args: fargs, 
                        vararg: vararg, 
                        stats: fblock 
                    } 
                })
            } else {
                // set value in the table's array component
                tableConstructor.set(++tableArrayIndex, expression())
            }

            if (!test(TokenType.Operator, ',') && !test(TokenType.Operator, ';')) {
                expect(TokenType.Operator, '}', true)
                break
            }

            i++ // skip over ',' or ';'
        }

        return tableConstructor
    }

    function element(): ElementConstructor {
        expect(TokenType.Operator, '<', true)

        /* Read the element's name. */
        const elementName = <string> expect(TokenType.Name, undefined, true)

        /* Start reading properties. */
        const properties = <Record<string, Expression>> {}
        if (test(TokenType.Name)) {
            while (!testMany(TokenType.Operator, ['/', '>'])) {
                /* Get name of property. */
                const propertyName = <string> expect(TokenType.Name, undefined, true)

                /* Check whether it's an implied boolean. */
                if (testNext(TokenType.Operator, '=')) {
                    if (test(TokenType.String)) {
                        properties[propertyName] = { 
                            type: 'string',
                            value: <string> expect(TokenType.String)
                        }
                        i++
                    } else if (testNext(TokenType.Operator, '{')) {
                        properties[propertyName] = expression()
                        expect(TokenType.Operator, '}', true)
                    }
                } else {
                    /* Implied boolean. */
                    properties[propertyName] = { 
                        type: 'boolean', 
                        value: true 
                    }
                }
            }
        }

        /* Cut element short if in shorthand form. */
        if (testNext(TokenType.Operator, '/')) {
            expect(TokenType.Operator, '>', true)
            return {
                name: elementName,
                properties: properties
            }
        } else {
            expect(TokenType.Operator, '>', true)
        }

        /* Start reading children nodes (if any). */
        const children = <Expression[]> []
        while (!eob()) {
            if (testNext(TokenType.Operator, '{')) {
                children.push(expression())
                expect(TokenType.Operator, '}', true)
            } else if (test(TokenType.Operator, '<')) {
                if (testLookahead(1, TokenType.Operator, '/')) {
                    i += 2 // Skip over '</'
                    break
                }
                children.push({ type: 'element', value: element() })
            } else {
                assert(false, 'bruh')
            }
        }

        /* Verify end tag. */
        expect(TokenType.Name, elementName, true)
        expect(TokenType.Operator, '>', true)
        return {
            name: elementName,
            properties: properties,
            children: children
        }
    }

    function atom(): Expression {
        assert(!eob(), 'Expression ended unexpectedly')

        if (testNext(TokenType.Operator, '(')) {
            const val = expression()
            expect(TokenType.Operator, ')', true)
            return val
        } else if (
                test(TokenType.Operator, 'not') ||
                test(TokenType.Operator, '#') ||
                test(TokenType.Operator, '-')) 
        {
            const cur = tokens[i++]
            return { 
                left: expression(1), 
                op: <OperatorsUnion> cur.value, 
                unary: true 
            }
        } else if (testNext(TokenType.Operator, '...')) {
            return { type: 'vararg', value: undefined };
        } else if (test(TokenType.Operator, '{')) {
            return { type: 'table', value: table() };
        } else if (test(TokenType.Operator, '<')) {
            return { type: 'element', value: element() }
        } else if (test(TokenType.Operator, '|')) {
            const [fargs, vararg] = args(true)
            return { 
                type: 'func', 
                value: <Function> { 
                    args: fargs, 
                    vararg: vararg, 
                    stats: [<ReturnStatement> {
                        type: StatementType.ReturnExpression,
                        exprs: [expression()],
                        line: i
                    }]
                } 
            }
        } else {
            const cur = tokens[i++]
            switch (cur.type) {
                case TokenType.Number: 
                    return { type: 'number', value: <number> cur.value }
                case TokenType.String: 
                    return { type: 'string', value: <string> cur.value }
                case TokenType.Name: 
                    return { type: 'name', value: <string> cur.value }
                case TokenType.Word: {
                    if (cur.value === 'true') {
                        return { type: 'boolean', value: true };
                    } else if (cur.value === 'false') {
                        return { type: 'boolean', value: false };
                    } else if (cur.value === 'nil') {
                        return { type: 'nil', value: undefined };
                    } else if (cur.value === 'function') {
                        const [fargs, vararg] = args()
                        const fblock = block('endBlock')
                        return { 
                            type: 'func', 
                            value: { 
                                args: fargs, 
                                vararg: vararg, 
                                stats: fblock 
                            } 
                        }
                    }
                } /* falls through */
                default: {
                    assert(false, `Invalid token "${cur.value}" in expression`);
                    return { type: 'nil', value: undefined };
                }
            }
        }
    }

    function funcindex(): [path: string | string[], self: boolean] | string {
        const path = [expect<string>(TokenType.Name, undefined, true)]
        while (test(TokenType.Operator, '.') || test(TokenType.Operator, ':')) {
            if (test(TokenType.Operator, ':')) {
                i++
                path.push(expect<string>(TokenType.Name, undefined, true))
                return [path, true]
            }
            i++ // skip over .
            path.push(expect<string>(TokenType.Name, undefined, true))
        }
        if (path.length === 1) {
            return [path[0], false]
        }
        return [path, false]
    }

    function expression(minimumPrecedence = 1, disableCalls?: boolean, disableExpressionAssignment?: boolean): Expression {
        let lhs = atom()

        const notOperators = [
            '{', '}', '[', ']', '(', ')', ',', ';', '@', '|'
        ];

        if (disableExpressionAssignment) {
            notOperators.push('=', '+=', '-=', '*=', '/=', '%=', '^=', '..=')
        }

        while (true) {
            let cur = tokens[i]

            if (!eob() && testNext(TokenType.Operator, '.')) {
                // key index
                const indexExpr = expect<string>(TokenType.Name, undefined, true)
                lhs = { 
                    left: lhs, 
                    right: { 
                        type: 'name', 
                        value: indexExpr 
                    }, 
                    op: 'nameIndex' 
                }
                cur = tokens[i]
            }

            if (!eob() && testNext(TokenType.Operator, '[')) {
                // value index
                const indexExpr = expression()
                expect(TokenType.Operator, ']', true)
                lhs = { 
                    left: lhs, 
                    right: indexExpr, 
                    op: 'exprIndex' 
                }
                cur = tokens[i]
            }

            if (!eob() && !disableCalls && test(TokenType.Operator, '(')) {
                // function call
                i++
                const argExprs: Expression[] = []
                while (!test(TokenType.Operator, ')')) {
                    argExprs.push(expression())
                    if (test(TokenType.Operator, ')')) {
                        break
                    } else {
                        expect(TokenType.Operator, ',', true)
                    }
                }
                expect(TokenType.Operator, ')', true);
                lhs = { 
                    left: lhs, 
                    right: { 
                        type: 'call', 
                        value: argExprs 
                    } 
                }
                cur = tokens[i]
            }

            if (eob() 
                || (cur.type === TokenType.Operator && notOperators.includes(<string> cur.value))
                || !test(TokenType.Operator)
                || ('op' in lhs && lhs.unary) 
                || ExprOpPrecedence[cur.value as string]! < minimumPrecedence)
            {
                break
            }

            expect(TokenType.Operator);
            const op = cur.value as OperatorsUnion;
            const nextMinPrec = ExprOpPrecedence[op]! + (ExprOpAssociate[op] === 'right' ? 0 : 1);
            i++ // consume current token and skip

            lhs = { 
                left: lhs, 
                right: expression(nextMinPrec), 
                op: op 
            }
        }

        return <Expression> lhs
    }

    /**
     * ===========================
     * Statement parsers
     * ===========================
     */

    /**
     * Parses function arguments.
     */
    function args(pipe?: boolean): [args: string[], vararg: boolean] {
        expect(TokenType.Operator, pipe ? '|' : '(', true)
        const args: string[] = []
        let vararg = false
        while (!test(TokenType.Operator, pipe ? '|' : ')')) {
            if (test(TokenType.Operator, '...')) {
                assert(!vararg, 'Duplicate vararg specifier')
                vararg = (i++, true) // skip over ...
            } else {
                args.push(expect<string>(TokenType.Name, undefined, true))
                if (!test(TokenType.Operator, pipe ? '|' : ')')) {
                    expect(TokenType.Operator, ',', true)
                }
            }
        }
        i++ // jump over )/|
        return [args, vararg]
    }

    function conditional(): IfBlock {
        const fline = tokens[i].line
        const fexpr: Expression = expression()
        expect(TokenType.Word, 'then')
        i++ // Skip over 'then'
        const mainBlock = block('ifBlock')

        if (!test(TokenType.Word, 'end')) {
            if (test(TokenType.Word, 'else')) {
                i++
                return { 
                    type: StatementType.IfBlock,
                    line: fline, condition: fexpr,
                    stats: mainBlock,
                    else: { 
                        type: StatementType.IfBlock, 
                        line: tokens[i].line, 
                        stats: block('endBlock')
                    }
                };
            } else {
                i++
                return { 
                    type: StatementType.IfBlock,
                    line: fline, condition: fexpr,
                    stats: mainBlock,
                    else: conditional()
                };
            }
        }

        i++ // skip over 'end'

        return {
            type: StatementType.IfBlock,
            line: fline, condition: fexpr,
            stats: mainBlock
        }
    }

    function statement(): Statement | undefined {
        // Skip any semicolons.
        while (testNext(TokenType.Operator, ';'));

        const cur = tokens[i]

        if (cur.type === TokenType.Word) {
            const wordValue = <WordsUnion> cur.value
            switch (wordValue) {
                case 'do':
                    return (++i, <DoBlock> {
                        type: StatementType.DoBlock, 
                        line: cur.line, 
                        stats: block('endBlock')
                    })

                case 'break':
                    return (++i, <BreakStatement> { 
                        type: StatementType.BreakStatement, 
                        line: cur.line 
                    })

                case 'if':
                    return (++i, conditional())

                case 'return': {
                    i++ // skip over return
                    if (test(TokenType.Word) 
                        && !test(TokenType.Word, 'true')
                        && !test(TokenType.Word, 'false')
                        && !test(TokenType.Word, 'not')
                        && !test(TokenType.Word, 'nil')
                        && !test(TokenType.Word, 'function')) 
                    {
                        return <ReturnStatement> { 
                            type: StatementType.ReturnExpression, 
                            line: cur.line 
                        }
                    } else {
                        const exprs = [expression()];
                        while (testNext(TokenType.Operator, ',')) {
                            exprs.push(expression());
                        }
                        return <ReturnStatement> { 
                            type: StatementType.ReturnExpression, 
                            line: cur.line, 
                            exprs: exprs 
                        }
                    }
                }

                case 'while': {
                    i++ // skip over 'while'

                    const whileExpr = expression();
                    expect(TokenType.Word, 'do', true);
                    const whileBlock = block('endBlock');

                    return <WhileBlock> { 
                        type: StatementType.WhileBlock,
                        line: cur.line,
                        stats: whileBlock,
                        condition: whileExpr
                    }
                }

                case 'repeat': {
                    i++ // skip over 'repeat'
                    const repeatBlock = block('untilBlock');
                    const repeatCondition = expression();

                    return <RepeatBlock> {
                        type: StatementType.RepeatBlock,
                        line: cur.line,
                        stats: repeatBlock,
                        condition: repeatCondition
                    }
                }

                case 'for': {
                    i++ // skip over 'for'

                    const firstVar = expect<string>(TokenType.Name, undefined, true);
                    if (test(TokenType.Operator, '=')) {
                        // numeric for
                        i++ // skip over '='
                        const startExpr = expression();
                        expect(TokenType.Operator, ',', true);
                        const endExpr = expression();
                        let stepExpr: Expression | undefined;
                        if (test(TokenType.Operator, ',')) {
                            i++ // skip over ,
                            stepExpr = expression();
                        }
                        expect(TokenType.Word, 'do', true);
                        const forBlock = block('endBlock');
                        return <ForNumericBlock> {
                            type: StatementType.ForNumericBlock,
                            var: firstVar,
                            line: cur.line,
                            start: startExpr,
                            end: endExpr,
                            step: stepExpr,
                            stats: forBlock
                        }
                    } else {
                        const vars = [firstVar];
                        while (test(TokenType.Operator, ',')) {
                            i++ // skip over ','
                            vars.push(expect<string>(TokenType.Name, undefined, true));
                        }
                        expect(TokenType.Word, 'in', true);
                        const exprList = [expression()];
                        while (test(TokenType.Operator, ',')) {
                            i++ // skip over ','
                            exprList.push(expression());
                        }
                        expect(TokenType.Word, 'do', true);
                        const forBlock = block('endBlock');

                        return <ForGenericBlock> {
                            type: StatementType.ForGenericBlock,
                            line: cur.line,
                            vars: vars,
                            exprs: exprList,
                            stats: forBlock
                        }
                    }
                }

                case 'function': {
                    i++ // skip over 'function'

                    // todo: change this to a proper func name expr
                    const assignment = funcindex()
                    const [fargs, vararg] = args()
                    const fblock = block('endBlock')

                    return <FunctionDefinition> {
                        type: StatementType.FunctionDefinition,
                        line: cur.line,
                        into: assignment, 
                        func: { 
                            args: fargs, 
                            vararg: vararg, 
                            stats: fblock 
                        } 
                    }
                }

                case 'import': {
                    i++ // skip over 'import'

                    let defaultImport: string | undefined
                    let vars: string[] | undefined
                    if (test(TokenType.Name)) {
                        defaultImport = <string> expect(TokenType.Name, undefined, true)
                    } else {
                        expect(TokenType.Operator, '{', true)
                        vars = []
                        while (!test(TokenType.Operator, '}')) {
                            vars.push(<string> expect(TokenType.Name, undefined, true))
                            if (test(TokenType.Operator, '}')) {
                                break
                            } else {
                                expect(TokenType.Operator, ',', true)
                            }
                        }
                        expect(TokenType.Operator, '}', true)
                    }

                    expect(TokenType.Word, 'from', true)

                    return <ImportStatement> {
                        type: StatementType.ImportStatement,
                        line: cur.line,
                        default: defaultImport,
                        variables: vars,
                        path: expression()
                    }
                }

                case 'local': {
                    i++ // skip over 'local'

                    if (test(TokenType.Word, 'function')) {
                        i++ // skip over 'function'
                        const assignment = expect<string>(TokenType.Name, undefined, true)
                        const [fargs, vararg] = args()
                        const fblock = block('endBlock')

                        return <LocalFunctionDefinition> {
                            type: StatementType.LocalFunctionDefinition,
                            line: cur.line,
                            var: assignment,
                            func: { 
                                args: fargs, 
                                vararg: vararg, 
                                stats: fblock 
                            } 
                        }
                    } else {
                        const leftVars = [expect<string>(TokenType.Name, undefined, true)];
                        while (!eob() && test(TokenType.Operator, ',')) {
                            i++ // skip over ,
                            leftVars.push(expect<string>(TokenType.Name, undefined, true));
                        }
                        if (!test(TokenType.Operator, '=')) {
                            return <LocalAssignmentStatement> { 
                                type: StatementType.LocalAssignment, 
                                vars: leftVars, 
                            }
                        }
                        i++ // skip over =
                        const exprs = [expression()]
                        while (!eob() && test(TokenType.Operator, ',')) {
                            i++ // skip over ,
                            exprs.push(expression())
                        }
                        return <LocalAssignmentStatement> { 
                            type: StatementType.LocalAssignment,
                            line: cur.line,
                            vars: leftVars, 
                            assignment: exprs 
                        }
                    }
                }

                default: {
                    assert(false, `Unexpected Word ${cur.value} in statement`);
                }
            }
        } else {
            if (testNext(TokenType.Operator, '@')) {
                // Intrinsic. Either '@a' or '@a(...)'.
                const intrinExpr = expression(1, true)

                // Optional arguments.
                let args: Expression[] | undefined
                if (testNext(TokenType.Operator, '(')) {
                    // function call
                    args = []
                    while (!test(TokenType.Operator, ')')) {
                        args.push(expression());
                        if (test(TokenType.Operator, ')')) {
                            break;
                        } else {
                            expect(TokenType.Operator, ',', true);
                        }
                    }
                    expect(TokenType.Operator, ')', true);
                }

                return <IntrinsicStatement> {
                    type: StatementType.Intrinsic,
                    line: cur.line,
                    expr: intrinExpr,
                    args: args && args.length > 0 ? args : undefined
                }
            }

            const firstExpr = expression(1, true, true) // guaranteed expression

            if (testNext(TokenType.Operator, '(')) {
                // function call
                const argExprs: Expression[] = [];
                while (!test(TokenType.Operator, ')')) {
                    argExprs.push(expression());
                    if (test(TokenType.Operator, ')')) {
                        break;
                    } else {
                        expect(TokenType.Operator, ',', true);
                    }
                }
                expect(TokenType.Operator, ')', true);
                return <FunctionCall> {
                    type: StatementType.FunctionCall,
                    line: cur.line,
                    expr: firstExpr,
                    args: argExprs
                }
            } else if (testMany(TokenType.Operator, [',', '='])) {
                const leftExprs = [firstExpr];
                while (test(TokenType.Operator, ',')) {
                    i++
                    leftExprs.push(expression());
                }
                expect(TokenType.Operator, '=', true);
                const rightExprs = [expression()];
                while (!eob() && test(TokenType.Operator, ',')) {
                    i++
                    rightExprs.push(expression());
                }
                return <AssignmentStatement> {
                    type: StatementType.Assignment,
                    line: cur.line,
                    left: leftExprs,
                    right: rightExprs
                }
            } else if (testMany(TokenType.Operator, ['+=', '-=', '*=', '/=', '%=', '^=', '..='])) {
                // Luau compound operators.
                const currentOperator = <OperatorsUnion> expect(TokenType.Operator, undefined, true)
                const singleRightExpr = expression();
                return <CompoundAssignmentStatement> {
                    type: StatementType.CompoundAssignment,
                    line: cur.line,
                    left: firstExpr,
                    right: singleRightExpr,
                    op: currentOperator
                }
            }
        }
    }

    function block(endMode: 'root' | 'endBlock' | 'ifBlock' | 'untilBlock' = 'root'): Statement[] {
        const statementList: Statement[] = []

        while (!eob()) {
            if (
                (endMode === 'endBlock' && test(TokenType.Word, 'end')) ||
                (endMode === 'untilBlock' && test(TokenType.Word, 'until'))
            ) {
                return (i++, statementList) // skip over end
            } else if (endMode === 'ifBlock' 
                && (
                    test(TokenType.Word, 'else') || 
                    test(TokenType.Word, 'elseif') ||
                    test(TokenType.Word, 'end')
                )) {
                // do not skip over final word
                return statementList
            } else {
                // error here
            }

            const currentStat = statement()
            if (currentStat) {
                statementList.push(currentStat);
            } else {
                console.log(tokens[i]);
                throw new Error(`Warning: Unimplemented stat parse near line ${tokens[i].line}`);
            }
        }

        //this.assert(endMode === 'root', `Invalid block terminator (mode: ${endMode})`);
        return statementList;
    }

    // Parse the root block.
    return block()
}

/**
 * Removes whitespace and comments from the tokens.
 */
export function purge(tokens: Token[]): Token[] {
    return tokens.filter(token => {
        if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
            return false // Remove all comments and whitespace.
        } else {
            return true
        }
    })
}

export default parse