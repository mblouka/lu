
import * as Parser from '../parser.js'
import { Renderer } from './index.js'

const tabChar = '  '

const pretty = <Renderer> {
    closure(tabLevel, args, vararg, stats, index?) {
        let funcPath: string | undefined = typeof index?.[0] === 'string' ? index[0] : index?.[0].slice(0, index?.[0].length - 1).join('.');
        if (funcPath !== undefined && index && typeof index[0] !== 'string' && index) {
            funcPath += `${index[1] ? ':' : '.'}${index[0].pop()}`
        }
        
        let func = `function${funcPath ? ` ${funcPath}` : ''}(${args.join(', ')}${vararg ? `${args.length > 0 ? ', ' : ''}...` : ''})\n`;
        func += pretty.render(tabLevel + 1, stats);
        console.log(tabLevel)
        return func += `\n${tabChar.repeat(tabLevel)}end`;
    },

    expression(tabLevel, expr) {
        if ('value' in expr) {
            // render atom
            if (expr.type === 'boolean') {
                return expr.value as boolean ? 'true' : 'false';
            } else if (expr.type === 'name') {
                return expr.value as string;
            } else if (expr.type === 'number') {
                return `${expr.value as number}`;
            } else if (expr.type === 'vararg') {
                return '...';
            } else if (expr.type === 'nil') {
                return 'nil';
            } else if (expr.type === 'call') {
                return `(${(expr.value as Parser.Expression[]).map(expr => pretty.expression(tabLevel, expr)).join(', ')})`;
            } else if (expr.type === 'func') {
                const func = expr.value as Parser.Function
                return pretty.closure(tabLevel, func.args, func.vararg, func.stats);
            } else if (expr.type === 'string') {
                return `"${expr.value as string}"`;
            } else  if (expr.type === 'element') {
                const element = <Parser.ElementConstructor> expr.value
    
                /* Render properties. */
                const properties = 
                    Object.entries(element.properties).map(([name, value]) =>
                        `${name}={${pretty.expression(tabLevel, value)}}`).join(' ')
    
                /* Render children, if any. */
                const insideTabbing = tabChar.repeat(tabLevel + 1)
                const elements = element.children?.map(child => {
                    if ('unary' in child) {
                        return `${insideTabbing}{${pretty.expression(tabLevel + 1, child)}}`
                    } else {
                        child = <Parser.ExpressionAtom> child
                        if (child.type === 'element') {
                            return `${insideTabbing}${pretty.expression(tabLevel + 1, child)}`
                        } else {
                            return `${insideTabbing}{${pretty.expression(tabLevel + 1, child)}}`
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
                        tableArray.push(pretty.expression(tabLevel, value));
                    } else {
                        tableDictionary.push(`[${pretty.expression(tabLevel, key)}] = ${pretty.expression(tabLevel + 1, value)}`);
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
                return `${expr.op}${pretty.expression(tabLevel, expr.left)}`;
            }
    
            if (expr.left && expr.right) {
                if (expr.op) {
                    if (expr.op === 'nameIndex' || expr.op === '.') {
                        return `${pretty.expression(tabLevel, expr.left)}.${pretty.expression(tabLevel, expr.right)}`;
                    } else if (expr.op === 'exprIndex') {
                        return `${pretty.expression(tabLevel, expr.left)}[${pretty.expression(tabLevel, expr.right)}]`;
                    } else {
                        return `(${pretty.expression(tabLevel, expr.left)} ${expr.op} ${pretty.expression(tabLevel, expr.right)})`;
                    }
                } else {
                    let leftValue: string | undefined
                    if ('value' in expr.left) {
                        if (expr.left.type === 'func') {
                            leftValue = `(${pretty.expression(tabLevel, expr.left)})`
                        }
                    }
                    return `${leftValue ?? pretty.expression(tabLevel, expr.left)}(${((expr.right as Parser.ExpressionAtom).value as Parser.Expression[]).map(expr => pretty.expression(tabLevel + 1, expr)).join(', ')})`;
                }
            }
    
            throw new Error('Cannot render');
            return '';
        }
    
        return '';
    },

    render(tabLevel, statement) {
        const tabStr = tabLevel > 0 ? tabChar.repeat(tabLevel) : '';
        if ('map' in statement) {
            const statArray = statement as Parser.Statement[];
            const allStats = statArray.filter(stat => stat.type !== Parser.StatementType.Ignore).map(stat => `${pretty.render(tabLevel, stat)}`);
            return allStats.join('\n');
        }
        statement = statement as Parser.Statement;
        switch (statement.type) {
            // simple stats
            case Parser.StatementType.BreakStatement: return `${tabStr}break`;
            case Parser.StatementType.ReturnExpression: {
                const retExpr = statement as Parser.ReturnStatement;
                return `${tabStr}return${retExpr.exprs?` ${retExpr.exprs.map(expr => pretty.expression(tabLevel, expr)).join(', ')}`:''}`;
            }

            // more complex stats

            case Parser.StatementType.FunctionDefinition: {
                const funcDef = statement as Parser.FunctionDefinition;
                const funcRender = pretty.closure(
                    tabLevel, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, funcDef.into);
                return `${tabStr}${funcRender}`;
            }

            case Parser.StatementType.LocalFunctionDefinition: {
                const funcDef = statement as Parser.LocalFunctionDefinition;
                const funcRender = pretty.closure(
                    tabLevel, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, [funcDef.var, false]);
                return `${tabStr}local ${funcRender}`;
            }

            case Parser.StatementType.FunctionCall: {
                const funcCall = statement as Parser.FunctionCall;
                const funcExpr = pretty.expression(tabLevel, funcCall.expr);
                const funcArgs = funcCall.args?.map(arg => pretty.expression(tabLevel, arg)).join(', ');
                return `${tabStr}${funcExpr}(${funcArgs ?? ''})`;
            }

            case Parser.StatementType.Intrinsic: {
                const intrinsic = statement as Parser.IntrinsicStatement;
                const intrinsicExpr = pretty.expression(tabLevel, intrinsic.expr)
                const intrinsicArgs = intrinsic.args?.map(arg => pretty.expression(tabLevel, arg)).join(', ');
                return `${tabStr}@${intrinsicExpr}${intrinsicArgs ? `(${intrinsicArgs})` : ''}`;
            }

            case Parser.StatementType.ImportStatement: {
                const importstat = statement as Parser.ImportStatement
                return `${tabStr}import ${importstat.default ?? `{ ${importstat.variables!.join(', ')} }`} from ${pretty.expression(tabLevel, importstat.path)}`
            }

            case Parser.StatementType.Assignment: {
                const assignment = statement as Parser.AssignmentStatement;
                return `${tabStr}${assignment.left.map(expr => pretty.expression(tabLevel, expr)).join(', ')} = ${assignment.right.map(expr => pretty.expression(tabLevel, expr)).join(', ')}`;
            }

            case Parser.StatementType.CompoundAssignment: {
                const assignment = statement as Parser.CompoundAssignmentStatement;
                return `${tabStr}${pretty.expression(tabLevel, assignment.left)} ${assignment.op} ${pretty.expression(tabLevel, assignment.right)}`;
            }

            case Parser.StatementType.LocalAssignment: {
                const assignment = statement as Parser.LocalAssignmentStatement;
                return `${tabStr}local ${assignment.vars.join(', ')}${assignment.assignment?` = ${assignment.assignment?.map(expr => pretty.expression(tabLevel, expr)).join(', ')}`:''}`;
            }

            case Parser.StatementType.DoBlock: {
                const doBlock = statement as Parser.DoBlock;
                const renderedStats = pretty.render(tabLevel + 1, doBlock.stats ?? []);
                return `${tabStr}do\n${renderedStats}\n${tabStr}end`;
            }

            case Parser.StatementType.WhileBlock: {
                const whileBlock = statement as Parser.WhileBlock;
                const renderedStats = pretty.render(tabLevel + 1, whileBlock.stats ?? [])
                const renderedExpr = pretty.expression(tabLevel, whileBlock.condition);
                return `${tabStr}while ${renderedExpr} do\n${renderedStats}\n${tabStr}end`;
            }

            case Parser.StatementType.RepeatBlock: {
                const repeatBlock = statement as Parser.RepeatBlock;
                const renderedStats = pretty.render(tabLevel + 1, repeatBlock.stats ?? []);
                const renderedExpr = pretty.expression(tabLevel, repeatBlock.condition);
                return `${tabStr}repeat\n${renderedStats}\n${tabStr}until ${renderedExpr}`;
            }

            case Parser.StatementType.IfBlock: {
                const ifBlock = statement as Parser.IfBlock;
                let ifRender = `${tabStr}if ${pretty.expression(tabLevel, ifBlock.condition!)} then\n`;
                ifRender += pretty.render(tabLevel + 1, ifBlock.stats!);
                let ifNext = ifBlock.else;
                while (ifNext) {
                    if (ifNext.condition) {
                        ifRender += `\n${tabStr}elseif ${pretty.expression(tabLevel, ifNext.condition)} then\n`;
                    } else {
                        ifRender += `\n${tabStr}else\n`;
                    }
                    ifRender += pretty.render(tabLevel + 1, ifNext.stats!);
                    ifNext = ifNext.else;
                }
                ifRender += `\n${tabStr}end`;
                return ifRender;
            }

            case Parser.StatementType.ForNumericBlock: {
                const forNumBlock = statement as Parser.ForNumericBlock;
                let forRender = `${tabStr}for ${forNumBlock.var} = ${pretty.expression(tabLevel, forNumBlock.start)}, ${pretty.expression(tabLevel, forNumBlock.end)}`;
                if (forNumBlock.step) {
                    forRender += `, ${pretty.expression(tabLevel, forNumBlock.step)}`;
                }
                forRender += ` do\n${pretty.render(tabLevel + 1, forNumBlock.stats)}\n`;
                forRender += `${tabStr}end`;
                return forRender;
            }

            case Parser.StatementType.ForGenericBlock: {
                const forGenBlock = statement as Parser.ForGenericBlock;
                let forRender = `${tabStr}for ${forGenBlock.vars.join(', ')} in ${forGenBlock.exprs.map(e => pretty.expression(tabLevel, e)).join(', ')} do\n`;
                forRender += pretty.render(tabLevel + 1, forGenBlock.stats);
                forRender += `\n${tabStr}end`;
                return forRender;
            }

            default: {
                return 'unimplemented';
            }
        }
    },
}

export default pretty