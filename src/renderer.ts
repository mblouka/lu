
import * as Parser from './parser'

const tabChar = '  ';

export function renderFunction(tabLevel = 1, args: string[], vararg: boolean, stats: Parser.Statement[], index?: [path: string | string[], self: boolean]): string {
    let funcPath: string | undefined = typeof index?.[0] === 'string' ? index[0] : index?.[0].slice(0, index?.[0].length - 1).join('.');
    if (funcPath !== undefined && index && typeof index[0] !== 'string' && index) {
        funcPath += `${index[1] ? ':' : '.'}${index[0].pop()}`
    }
    
    let func = `function${funcPath ? ` ${funcPath}` : ''}(${args.join(', ')}${vararg ? `${args.length > 0 ? ', ' : ''}...` : ''})\n`;
    func += render(stats, tabLevel + 1);
    return func += `\n${tabChar.repeat(tabLevel)}end`;
}

export function renderExpression(expr: Parser.Expression | Parser.ExpressionAtom, tabLevel = 1): string {
    if ('value' in expr) {
        // render atom
        if (expr.type === 'boolean') {
            return expr.value as boolean ? 'true' : 'false';
        } else if (expr.type === 'var') {
            return expr.value as string;
        } else if (expr.type === 'number') {
            return `${expr.value as number}`;
        } else if (expr.type === 'vararg') {
            return '...';
        } else if (expr.type === 'nil') {
            return 'nil';
        } else if (expr.type === 'call') {
            return `(${(expr.value as Parser.Expression[]).map(expr => renderExpression(expr, tabLevel)).join(', ')})`;
        } else if (expr.type === 'func') { // dear god
            const func = expr.value as Parser.Function;
            return renderFunction(tabLevel, func.args, func.vararg, func.stats);
        } else if (expr.type === 'string') {
            return `"${expr.value as string}"`;
        } else  if (expr.type === 'element') {
            const element = <Parser.ElementConstructor> expr.value

            /* Render properties. */
            const properties = 
                Object.entries(element.properties).map(([name, value]) =>
                    `${name}={${renderExpression(value)}}`).join(' ')

            /* Render children, if any. */
            const insideTabbing = tabChar.repeat(tabLevel + 1)
            const elements = element.children?.map(child => {
                if ('unary' in child) {
                    return `${insideTabbing}{${renderExpression(child, tabLevel + 1)}}`
                } else {
                    child = <Parser.ExpressionAtom> child
                    if (child.type === 'element') {
                        return `${insideTabbing}${renderExpression(child, tabLevel + 1)}`
                    } else {
                        return `${insideTabbing}{${renderExpression(child, tabLevel + 1)}}`
                    }
                }
            })?.join('\n')

            /* Render complex type if it has children. */
            const propertyString = properties.length > 0 ? ' ' + properties : ''
            if (elements) {
                return `<${element.name}${propertyString}>\n${elements}\n</${element.name}>`
            } else {
                return `<${element.name}${propertyString}/>`
            }
        } else if (expr.type === 'table') {
            const tableMap = expr.value as Parser.TableConstructor;
            const tableDictionary: string[] = [];
            const tableArray: string[] = [];
            tableMap.forEach((value, key) => {
                if (typeof key === 'number') {
                    tableArray.push(renderExpression(value));
                } else {
                    tableDictionary.push(`[${renderExpression(key)}] = ${renderExpression(value, tabLevel + 1)}`);
                }
            });
            const tableInsideTabbing = tabChar.repeat(tabLevel + 1);
            const tableOutsideTabbing = tabLevel > 0 ? tabChar.repeat((tabLevel > 1 ? tabLevel : 1)) : '';
            const tableDictionaryPart = tableDictionary.join(`;\n${tableInsideTabbing}`);
            const tableArrayPart = tableArray.join(', ');
            if (tableArray.length > 0 && tableDictionary.length > 0) {
                return `{\n${tableInsideTabbing}${tableDictionaryPart};\n${tableInsideTabbing}${tableArrayPart}\n${tableOutsideTabbing}}`
            } else if (tableArray.length > 0) {
                return `{${tableArrayPart}}`;
            } else if (tableDictionary.length > 0) {
                return `{\n${tableInsideTabbing}${tableDictionaryPart}\n${tableOutsideTabbing}}`;
            } else {
                return '{}';
            }
        }
    } else {
        if (expr.unary) {
            return `${expr.op}${renderExpression(expr.left)}`;
        }

        if (expr.left && expr.right) {
            if (expr.op) {
                if (expr.op === 'nameIndex' || expr.op === '.') {
                    return `${renderExpression(expr.left)}.${renderExpression(expr.right)}`;
                } else if (expr.op === 'exprIndex') {
                    return `${renderExpression(expr.left)}[${renderExpression(expr.right)}]`;
                } else {
                    return `(${renderExpression(expr.left)} ${expr.op} ${renderExpression(expr.right)})`;
                }
            } else {
                let leftValue: string | undefined
                if ('value' in expr.left) {
                    if (expr.left.type === 'func') {
                        leftValue = `(${renderExpression(expr.left)})`
                    }
                }
                return `${leftValue ?? renderExpression(expr.left)}(${((expr.right as Parser.ExpressionAtom).value as Parser.Expression[]).map(expr => renderExpression(expr)).join(', ')})`;
            }
        }

        throw new Error('Cannot render');
        return '';
    }

    return '';
}

export function render(statement: Parser.Statement | Parser.Statement[], tabLevel = 0): string {
    const tabStr = tabLevel > 0 ? tabChar.repeat(tabLevel) : '';
    if ('map' in statement) {
        const statArray = statement as Parser.Statement[];
        const allStats = statArray.filter(stat => stat.type !== Parser.StatementType.Ignore).map(stat => `${render(stat, tabLevel)}`);
        return allStats.join('\n');
    }
    statement = statement as Parser.Statement;
    switch (statement.type) {
        // simple stats
        case Parser.StatementType.BreakStatement: return `${tabStr}break`;
        case Parser.StatementType.ReturnExpression: {
            const retExpr = statement as Parser.ReturnExpression;
            return `${tabStr}return${retExpr.exprs?` ${retExpr.exprs.map(expr => renderExpression(expr)).join(', ')}`:''}`;
        }

        // more complex stats

        case Parser.StatementType.FunctionDefinition: {
            const funcDef = statement as Parser.FunctionDefinition;
            const funcRender = renderFunction(
                tabLevel, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, funcDef.into);
            return `${tabStr}${funcRender}`;
        }

        case Parser.StatementType.LocalFunctionDefinition: {
            const funcDef = statement as Parser.LocalFunctionDefinition;
            const funcRender = renderFunction(
                tabLevel, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, [funcDef.var, false]);
            return `${tabStr}local ${funcRender}`;
        }

        case Parser.StatementType.FunctionCall: {
            const funcCall = statement as Parser.FunctionCall;
            const funcExpr = renderExpression(funcCall.expr);
            const funcArgs = funcCall.args?.map(renderExpression).join(', ');
            return `${tabStr}${funcExpr}(${funcArgs ?? ''})`;
        }

        case Parser.StatementType.Intrinsic: {
            const intrinsic = statement as Parser.IntrinsicStatement;
            const intrinsicExpr = renderExpression(intrinsic.expr);
            const intrinsicArgs = intrinsic.args?.map(renderExpression).join(', ');
            return `${tabStr}@${intrinsicExpr}${intrinsicArgs ? `(${intrinsicArgs})` : ''}`;
        }

        case Parser.StatementType.ImportStatement: {
            const importstat = statement as Parser.ImportStatement
            return `${tabStr}import ${importstat.default ?? `{ ${importstat.variables!.join(', ')} }`} from ${renderExpression(importstat.path)}`
        }

        case Parser.StatementType.Assignment: {
            const assignment = statement as Parser.AssignmentStatement;
            return `${tabStr}${assignment.left.map(expr => renderExpression(expr)).join(', ')} = ${assignment.right.map(expr => renderExpression(expr)).join(', ')}`;
        }

        case Parser.StatementType.CompoundAssignment: {
            const assignment = statement as Parser.CompoundAssignmentStatement;
            return `${tabStr}${renderExpression(assignment.left)} ${assignment.op} ${renderExpression(assignment.right)}`;
        }

        case Parser.StatementType.LocalAssignment: {
            const assignment = statement as Parser.LocalAssignmentStatement;
            return `${tabStr}local ${assignment.vars.join(', ')}${assignment.assignment?` = ${assignment.assignment?.map(expr => renderExpression(expr)).join(', ')}`:''}`;
        }

        case Parser.StatementType.DoBlock: {
            const doBlock = statement as Parser.DoBlock;
            const renderedStats = render(doBlock.stats ?? [], tabLevel + 1);
            return `${tabStr}do\n${renderedStats}\n${tabStr}end`;
        }

        case Parser.StatementType.WhileBlock: {
            const whileBlock = statement as Parser.WhileBlock;
            const renderedStats = render(whileBlock.stats ?? [], tabLevel + 1);
            const renderedExpr = renderExpression(whileBlock.condition);
            return `${tabStr}while ${renderedExpr} do\n${renderedStats}\n${tabStr}end`;
        }

        case Parser.StatementType.RepeatBlock: {
            const repeatBlock = statement as Parser.RepeatBlock;
            const renderedStats = render(repeatBlock.stats ?? [], tabLevel + 1);
            const renderedExpr = renderExpression(repeatBlock.condition);
            return `${tabStr}repeat\n${renderedStats}\n${tabStr}until ${renderedExpr}`;
        }

        case Parser.StatementType.IfBlock: {
            const ifBlock = statement as Parser.IfBlock;
            let ifRender = `${tabStr}if ${renderExpression(ifBlock.condition!)} then\n`;
            ifRender += render(ifBlock.stats!, tabLevel + 1);
            let ifNext = ifBlock.else;
            while (ifNext) {
                if (ifNext.condition) {
                    ifRender += `\n${tabStr}elseif ${renderExpression(ifNext.condition)} then\n`;
                } else {
                    ifRender += `\n${tabStr}else\n`;
                }
                ifRender += render(ifNext.stats!, tabLevel + 1);
                ifNext = ifNext.else;
            }
            ifRender += `\n${tabStr}end`;
            return ifRender;
        }

        case Parser.StatementType.ForNumericBlock: {
            const forNumBlock = statement as Parser.ForNumericBlock;
            let forRender = `${tabStr}for ${forNumBlock.var} = ${renderExpression(forNumBlock.start)}, ${renderExpression(forNumBlock.end)}`;
            if (forNumBlock.step) {
                forRender += `, ${renderExpression(forNumBlock.step)}`;
            }
            forRender += ` do\n${render(forNumBlock.stats, tabLevel + 1)}\n`;
            forRender += `${tabStr}end`;
            return forRender;
        }

        case Parser.StatementType.ForGenericBlock: {
            const forGenBlock = statement as Parser.ForGenericBlock;
            let forRender = `${tabStr}for ${forGenBlock.vars.join(', ')} in ${forGenBlock.exprs.map(e => renderExpression(e)).join(', ')} do\n`;
            forRender += render(forGenBlock.stats, tabLevel + 1);
            forRender += `\n${tabStr}end`;
            return forRender;
        }

        default: {
            return 'unimplemented';
        }
    }
}

export default render