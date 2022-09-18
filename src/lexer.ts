
const str = {
    alphabetical: (string: string) => /^[a-z]+$/i.test(string),
    alphanumerical: (string: string) => /^[a-z0-9]+$/i.test(string),
    hexadecimal: (string: string) => /^[a-f0-9]+$/i.test(string),
    numeric: (string: string) => /^[0-9]+$/i.test(string),
    whitespace: (string: string) => /^[\s\n]+$/.test(string),
    wordchar: (string: string) => str.alphanumerical(string) || string === '_'
}

export type WordsUnion =
    'break' | 'do' | 'else' | 'elseif' | 'end' | 
    'false' | 'for' | 'function' | 'if' | 'export' |
    'in' | 'local' | 'nil' | 'repeat' | 'continue' |
    'return' | 'then' | 'true' | 'until' | 'while'

export const Words = [
    'break', 'do', 'else', 'elseif',
    'end', 'false', 'for', 'function', 'if',
    'in', 'local', 'nil', 'not', 'repeat', 'continue',
    'return', 'then', 'true', 'until', 'while',
];

export type OperatorsUnion =
    '+' | '-' | '*' | '/' | '%' | '^' | '#' |
    '==' | '~=' | '<=' | '>=' | '<' | '>' | '=' |
    '(' | ')' | '{' | '}' | '[' | ']' | ';' | ':' |
    ',' | '.' | '..' | '...' | 'and' | 'or' | 'not' |

    // Luau compound operators.
    '+=' | '-=' | '*=' | '/=' | '%=' | '^=' | '..=' |

    // Lu operators
    '@' | '|' |

    // Pseudo operators.
    'exprIndex' | 'nameIndex';

export const Operators = [
    '+', '-', '*', '/', '%', '^', '#',
    '==', '~=', '<=', '>=', '<', '>', '=',
    '(', ')', '{', '}', '[', ']', ';', ':',
    ',', '.', '..', '...', 'and', 'or', 'not', 
    '+=', '-=', '*=', '/=', '%=', '^=', '..=',   // Luau
    '@', '|' // Lu
].sort((x, y) => y.length - x.length);

export enum TokenType {
    Comment, Operator, Word, Name, Number, String, Whitespace, Invalid
}

export type TokenValue = string | number | WordsUnion | OperatorsUnion;

export interface TokenAnnotations {
    string?: {
        long?: boolean;
        longCount?: number;
        char?: string;
    };
}

export interface Token {
    readonly type: TokenType;
    readonly value: TokenValue;
    readonly line: number;
    readonly annotations?: TokenAnnotations;
}

export const InvalidToken: Token = { type: TokenType.Invalid, value: '', line: NaN };

// Functional lexer.
export function lex(source: string): Token[] {
    const tokens = <Token[]> []
    let [i, line, length] = [0, 0, source.length]

    const eob = () => i > length
    const getn = (count: number) => source.substring(i, i + count)
    const test = (cmp: string) => getn(cmp.length) === cmp

    /* Throw a lexer error with line count. */
    function error(message: string) {
        throw new Error(`script:${line}: ${message}`);
    }

    /* Iterate through characters until the exit condition is met. */
    function until(exit: (char: string) => boolean, iterator?: (char?: string) => void) {
        const startPosition = i
        while (!exit(source[i]) && !eob()) {
            if (iterator !== undefined) {
                iterator(source[i])
            }
            i++
        }
        return [startPosition, i]
    }

    /* Parse a string. */
    function string(): Token {
        const terminator = source[i]
        const startline = line
        
        /* Process a single escape character. */
        function escape() {
            return ''
        }

        if (terminator === '"' || terminator === '\'') {
            i++ // skip over first character

            let str = '';
            let longMode = false // implemented as \z in Luau
            while (source[i] !== terminator && !eob()) {
                const c = source[i]

                /* String newline behavior. */
                if (c === '\n') {
                    if (longMode) {
                        str += (line++, i++, '\n')
                        continue
                    } else {
                        break
                    }
                }

                /* Process escape characters. */
                if (c === '\\') {
                    const esc = escape()
                    if (esc === 'z') {
                        longMode = true
                        continue
                    } else {
                        str += esc
                    }
                } else {
                    str += c
                }

                // Skip to next character.
                i++
            }
            i++ // skip over last char

            return { 
                type: TokenType.String, 
                value: str,
                line: startline,
                annotations: { 
                    string: {
                        char: terminator
                    } 
                } 
            }
        } else {
            i++ // skip over [

            const [eqFirst, eqLast] = until(_ => source[i] !== '=');
            const eqStr = `]${(eqLast) - eqFirst !== 0 ? '='.repeat((eqLast) - eqFirst) : ''}]`;

            if (eqLast - eqFirst === 0) {
                i++
            }

            let str = '';
            while (!test(eqStr)) {
                const c = source[i]

                /* String newline behavior. */
                if (c === '\n') {
                    str += (line++, i++, '\n')
                    continue
                }

                /* Process escape characters. */
                if (c === '\\') {
                    str += escape()
                } else {
                    str += c
                }

                // Skip to next character.
                i++
            }
            i += eqStr.length

            return { 
                type: TokenType.String, 
                value: str,
                line: startline,
                annotations: { 
                    string: {
                        long: true,
                        longCount: eqLast - eqFirst
                    } 
                } 
            }
        }
    }

    /* Parses a number. */
    function number(): Token {
        if (test('0x') || test('0X')) {
            i += 2 // skip over hex header
            const [numStart, numEnd] = until(s => !str.hexadecimal(s));
            const numValue = parseInt(source.substring(numStart, numEnd), 16);
            if (isNaN(numValue)) {
                error(`Number '${source.substring(numStart, numEnd)}' is invalid.`);
            }
            return { type: TokenType.Number, value: numValue, line: line };
        } else {
            const [numStart, numEnd] = until(s => !str.numeric(s));
            const numValue = parseInt(source.substring(numStart, numEnd));
            if (isNaN(numValue)) {
                error(`Number '${source.substring(numStart, numEnd)}' is invalid.`);
            }
            return { type: TokenType.Number, value: numValue, line: line };
        }
    }

    /* Parses a word or a name. */
    function wordOrName(): Token {
        const [wordStart, wordEnd] = until(s => !str.wordchar(s))
        const word = source.substring(wordStart, wordEnd)
        if (word === 'and' || word === 'or' || word === 'not') {
            return { type: TokenType.Operator, value: word, line: line }
        } else {
            return { type: Words.includes(word) ? TokenType.Word : TokenType.Name, value: word, line: line }
        }
    }

    /* Parses a symbol. */
    function symbol(): Token {
        const matchTokenStr = Operators.find(op => test(op))
        if (matchTokenStr) {
            i += matchTokenStr.length
            return { type: TokenType.Operator, value: matchTokenStr, line: line }
        } else {
            error('Invalid symbol.')
            return InvalidToken
        }
    }

    function comment(): Token {
        i += 2 // skip over --
        if (test('--[')) {
            return { ...string(), type: TokenType.Comment  }
        } else {
            const [comStart, comEnd] = until(s => s === '\n');
            return { type: TokenType.Comment, value: source.substring(comStart, comEnd), line: line };
        }
    }

    function whitespace(): Token {
        const [wsStart, wsEnd] = until(s => !str.whitespace(s));
        return { type: TokenType.Whitespace, value: source.substring(wsStart, wsEnd), line: line };
    }

    while (!eob()) {
        const c = source[i]
        if (c === '' || !c) {
            i++ // skip over empty strings
        } else if (str.whitespace(c)) {
            tokens.push(whitespace())
        } else if (str.numeric(c)) {
            tokens.push(number())
        } else if (str.wordchar(c)) {
            tokens.push(wordOrName())
        } else {
            if (c === '-' && source[i + 1] === '-') {
                tokens.push(comment())
            } else if (
                (c === '[' && (source[i+1] === '=' || source[i+1] === '['))
                || (c === '\'' || c === '"')) {
                    tokens.push(string())
            } else {
                tokens.push(symbol())
            }
        }
    }

    return tokens
}

export default lex