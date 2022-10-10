
import * as Parser from '../parser.js'
import { Renderer } from './index.js'

const minify = <Renderer> {
    closure(_, args, vararg, stats, index?) {
        let funcPath: string | undefined = typeof index?.[0] === 'string' ? index[0] : index?.[0].slice(0, index?.[0].length - 1).join('.');
        if (funcPath !== undefined && index && typeof index[0] !== 'string' && index) {
            funcPath += `${index[1] ? ':' : '.'}${index[0].pop()}`
        }
        
        let func = `function${funcPath ? ` ${funcPath}` : ''}(${args.join(',')}${vararg ? `${args.length > 0 ? ',' : ''}...` : ''})`
        func += minify.render(0, stats)
        return func += ` end`
    },

    expression(_, expr) {
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
                return `(${(expr.value as Parser.Expression[]).map(expr => minify.expression(0, expr)).join(',')})`;
            } else if (expr.type === 'func') {
                const func = expr.value as Parser.Function
                return minify.closure(0, func.args, func.vararg, func.stats);
            } else if (expr.type === 'string') {
                return `"${expr.value as string}"`;
            } else  if (expr.type === 'element') {
                const element = <Parser.ElementConstructor> expr.value
    
                /* Render properties. */
                const properties = 
                    Object.entries(element.properties).map(([name, value]) =>
                        `${name}={${minify.expression(0, value)}}`).join(' ')
    
                /* Render children, if any. */
                const elements = element.children?.map(child => {
                    if ('unary' in child) {
                        return `{${minify.expression(0, child)}}`
                    } else {
                        child = <Parser.ExpressionAtom> child
                        if (child.type === 'element') {
                            return `${minify.expression(0, child)}`
                        } else {
                            return `{${minify.expression(0, child)}}`
                        }
                    }
                })?.join('')
    
                /* Render complex type if it has children. */
                const propertyString = properties.length > 0 ? ' ' + properties : ''
                if (elements) {
                    return `<${element.name}${propertyString}>${elements}</${element.name}>`
                } else {
                    return `<${element.name}${propertyString}/>`
                }
            } else if (expr.type === 'table') {
                const tableMap = expr.value as Parser.TableConstructor;
                const tableDictionary: string[] = [];
                const tableArray: string[] = [];
                tableMap.forEach((value, key) => {
                    if (typeof key === 'number') {
                        tableArray.push(minify.expression(0, value));
                    } else {
                        tableDictionary.push(`[${minify.expression(0, key)}]=${minify.expression(0, value)}`);
                    }
                });
                const tableDictionaryPart = tableDictionary.join(`;`);
                const tableArrayPart = tableArray.join(',');
                if (tableArray.length > 0 && tableDictionary.length > 0) {
                    return `{${tableDictionaryPart};${tableArrayPart}}`
                } else if (tableArray.length > 0) {
                    return `{${tableArrayPart}}`;
                } else if (tableDictionary.length > 0) {
                    return `{${tableDictionaryPart}}`;
                } else {
                    return '{}';
                }
            }
        } else {
            if (expr.unary) {
                return `${expr.op}${minify.expression(0, expr.left)}`;
            }
    
            if (expr.left && expr.right) {
                if (expr.op) {
                    if (expr.op === 'nameIndex' || expr.op === '.') {
                        return `${minify.expression(0, expr.left)}.${minify.expression(0, expr.right)}`;
                    } else if (expr.op === 'exprIndex') {
                        return `${minify.expression(0, expr.left)}[${minify.expression(0, expr.right)}]`;
                    } else {
                        return `(${minify.expression(0, expr.left)}${expr.op}${minify.expression(0, expr.right)})`;
                    }
                } else {
                    let leftValue: string | undefined
                    if ('value' in expr.left) {
                        if (expr.left.type === 'func') {
                            leftValue = `(${minify.expression(0, expr.left)})`
                        }
                    }
                    return `${leftValue ?? minify.expression(0, expr.left)}(${((expr.right as Parser.ExpressionAtom).value as Parser.Expression[]).map(expr => minify.expression(0, expr)).join(',')})`;
                }
            }
    
            throw new Error('Cannot render');
            return '';
        }
    
        return '';
    },

    render(_, statement) {
        if ('map' in statement) {
            const statArray = statement as Parser.Statement[];
            const allStats = statArray.filter(stat => stat.type !== Parser.StatementType.Ignore).map(stat => `${minify.render(0, stat)}`);
            return allStats.join(' ');
        }
        statement = statement as Parser.Statement;
        switch (statement.type) {
            // simple stats
            case Parser.StatementType.BreakStatement: return `break`;
            case Parser.StatementType.ReturnExpression: {
                const retExpr = statement as Parser.ReturnStatement;
                return `return${retExpr.exprs?` ${retExpr.exprs.map(expr => minify.expression(0, expr)).join(',')}`:''}`;
            }

            // more complex stats

            case Parser.StatementType.FunctionDefinition: {
                const funcDef = statement as Parser.FunctionDefinition;
                const funcRender = minify.closure(
                    0, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, funcDef.into);
                return `${funcRender}`;
            }

            case Parser.StatementType.LocalFunctionDefinition: {
                const funcDef = statement as Parser.LocalFunctionDefinition;
                const funcRender = minify.closure(
                    0, funcDef.func.args, funcDef.func.vararg, funcDef.func.stats, [funcDef.var, false]);
                return `local ${funcRender}`;
            }

            case Parser.StatementType.FunctionCall: {
                const funcCall = statement as Parser.FunctionCall;
                const funcExpr = minify.expression(0, funcCall.expr);
                const funcArgs = funcCall.args?.map(arg => minify.expression(0, arg)).join(',');
                return `${funcExpr}(${funcArgs ?? ''})`;
            }

            case Parser.StatementType.Intrinsic: {
                const intrinsic = statement as Parser.IntrinsicStatement;
                const intrinsicExpr = minify.expression(0, intrinsic.expr)
                const intrinsicArgs = intrinsic.args?.map(arg => minify.expression(0, arg)).join(',');
                return `@${intrinsicExpr}${intrinsicArgs ? `(${intrinsicArgs})` : ''}`;
            }

            case Parser.StatementType.ImportStatement: {
                const importstat = statement as Parser.ImportStatement
                return `import${importstat.default ?? `{${importstat.variables!.join(',')}}`}from ${minify.expression(0, importstat.path)}`
            }

            case Parser.StatementType.Assignment: {
                const assignment = statement as Parser.AssignmentStatement;
                return `${assignment.left.map(expr => minify.expression(0, expr)).join(',')}=${assignment.right.map(expr => minify.expression(0, expr)).join(',')}`;
            }

            case Parser.StatementType.CompoundAssignment: {
                const assignment = statement as Parser.CompoundAssignmentStatement;
                return `${minify.expression(0, assignment.left)}${assignment.op}${minify.expression(0, assignment.right)}`;
            }

            case Parser.StatementType.LocalAssignment: {
                const assignment = statement as Parser.LocalAssignmentStatement;
                return `local ${assignment.vars.join(',')}${assignment.assignment?`=${assignment.assignment?.map(expr => minify.expression(0, expr)).join(',')}`:''}`;
            }

            case Parser.StatementType.DoBlock: {
                const doBlock = statement as Parser.DoBlock;
                const renderedStats = minify.render(0, doBlock.stats ?? []);
                return `do ${renderedStats} end`;
            }

            case Parser.StatementType.WhileBlock: {
                const whileBlock = statement as Parser.WhileBlock;
                const renderedStats = minify.render(0, whileBlock.stats ?? [])
                const renderedExpr = minify.expression(0, whileBlock.condition);
                return `while ${renderedExpr} do ${renderedStats} end`;
            }

            case Parser.StatementType.RepeatBlock: {
                const repeatBlock = statement as Parser.RepeatBlock;
                const renderedStats = minify.render(0, repeatBlock.stats ?? []);
                const renderedExpr = minify.expression(0, repeatBlock.condition);
                return `repeat ${renderedStats} until ${renderedExpr}`;
            }

            case Parser.StatementType.IfBlock: {
                const ifBlock = statement as Parser.IfBlock;
                let ifRender = `if ${minify.expression(0, ifBlock.condition!)} then `;
                ifRender += minify.render(0, ifBlock.stats!);
                let ifNext = ifBlock.else;
                while (ifNext) {
                    if (ifNext.condition) {
                        ifRender += ` elseif ${minify.expression(0, ifNext.condition)} then `;
                    } else {
                        ifRender += ` else `;
                    }
                    ifRender += minify.render(0, ifNext.stats!);
                    ifNext = ifNext.else;
                }
                ifRender += ` end`;
                return ifRender;
            }

            case Parser.StatementType.ForNumericBlock: {
                const forNumBlock = statement as Parser.ForNumericBlock;
                let forRender = `for ${forNumBlock.var} = ${minify.expression(0, forNumBlock.start)}, ${minify.expression(0, forNumBlock.end)}`;
                if (forNumBlock.step) {
                    forRender += `,${minify.expression(0, forNumBlock.step)}`;
                }
                forRender += ` do ${minify.render(0, forNumBlock.stats)} end`;
                return forRender;
            }

            case Parser.StatementType.ForGenericBlock: {
                const forGenBlock = statement as Parser.ForGenericBlock;
                let forRender = `for ${forGenBlock.vars.join(',')} in ${forGenBlock.exprs.map(e => minify.expression(0, e)).join(',')} do\n`;
                forRender += minify.render(0, forGenBlock.stats);
                forRender += ` end`;
                return forRender;
            }

            default: {
                return 'unimplemented';
            }
        }
    },
}

export default minify