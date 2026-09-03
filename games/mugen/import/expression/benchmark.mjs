import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { compileMugenExpression } = await import('./MugenExpressionCompiler.ts');
const { parseMugenExpressionAst } = await import('./MugenExpressionParser.ts');
const { BasicMugenExpressionVmContext, evaluateMugenExpression } = await import('../../runtime/vm/MugenExpressionVm.ts');

const source = 'Cond(var(0)>0 && Random<500, abs(-4.5)+2**8, floor(7.9))';
const compileIterations = 10_000;
const evaluateIterations = 100_000;
let started = performance.now();
for (let index = 0; index < compileIterations; index++) compileMugenExpression(parseMugenExpressionAst(source));
const compileMs = performance.now() - started;
const program = compileMugenExpression(parseMugenExpressionAst(source));
const context = new BasicMugenExpressionVmContext({ seed: 123 });
started = performance.now();
for (let index = 0; index < evaluateIterations; index++) evaluateMugenExpression(program, context);
const evaluateMs = performance.now() - started;
console.log(JSON.stringify({ node: process.version, compileIterations, compileMs, compilePerSecond: compileIterations / compileMs * 1_000, evaluateIterations, evaluateMs, evaluatePerSecond: evaluateIterations / evaluateMs * 1_000, instructions: program.instructions.length, maxStack: program.maxStack }));
