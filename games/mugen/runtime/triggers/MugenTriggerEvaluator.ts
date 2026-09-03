import { MUGEN_LIMITS } from '../../import/contract';
import { isRedirectedExpressionProgram, validateMugenRuntimeExpression, type MugenRuntimeExpression } from '../../import/trigger/MugenRuntimeExpression';
import { mugenBottom, type MugenExpressionValue, type MugenRedirectionSelector } from '../../import/expression/types';
import { evaluateMugenExpression, MugenVmFuelMeter, type MugenExpressionVmContext, type MugenExpressionVmResult } from '../vm/MugenExpressionVm';

export interface MugenTriggerEvaluationHost {
  contextFor(entityId: string): MugenExpressionVmContext | null;
  redirect(originEntityId: string, selector: MugenRedirectionSelector, argument: number | null): string | null;
}

export function evaluateMugenRuntimeExpression(program: MugenRuntimeExpression, originEntityId: string, host: MugenTriggerEvaluationHost, options: Readonly<{ fuel?: number }> = {}): MugenExpressionVmResult {
  validateMugenRuntimeExpression(program); const meter = new MugenVmFuelMeter(options.fuel ?? MUGEN_LIMITS.compilerAndVm.maxFuelPerEvaluation); const initialFuel = meter.remaining; const reasons: string[] = [];
  const value = evaluateProgram(program, originEntityId, host, meter, reasons);
  return Object.freeze({ value, fuelUsed: initialFuel - meter.remaining, bottomReasons: Object.freeze(reasons) });
}

function evaluateProgram(program: MugenRuntimeExpression, entityId: string, host: MugenTriggerEvaluationHost, meter: MugenVmFuelMeter, reasons: string[]): MugenExpressionValue {
  const base = host.contextFor(entityId); if (base === null) return bottom(`MUGEN entity ${entityId} does not exist`, reasons);
  if (!isRedirectedExpressionProgram(program)) { const result = evaluateMugenExpression(program, base, { meter }); reasons.push(...result.bottomReasons); return result.value; }
  const bySlot = new Map(program.redirections.map(value => [value.slot, value]));
  const evaluateAt = (expression: typeof program.expression, currentEntityId: string): MugenExpressionValue => {
    const current = host.contextFor(currentEntityId); if (current === null) return bottom(`MUGEN entity ${currentEntityId} does not exist`, reasons);
    const context: MugenExpressionVmContext = {
      variables: current.variables,
      random: current.random,
      resolve(name) {
        const redirection = bySlot.get(name); if (!redirection) return current.resolve(name);
        let argument: number | null = null;
        if (redirection.selectorArgument !== null) {
          const selected = evaluateAt(redirection.selectorArgument, currentEntityId);
          if (selected.kind !== 'int') { if (selected.kind === 'bottom') return selected; return bottom(`MUGEN ${redirection.selector} selector argument must be int`, reasons); }
          argument = selected.value;
        }
        if (!validSelectorArgument(redirection.selector, argument)) return bottom(`MUGEN ${redirection.selector} selector argument is out of range`, reasons);
        const target = host.redirect(currentEntityId, redirection.selector, argument); if (target === null) return bottom(`MUGEN ${redirection.selector} redirection target does not exist`, reasons);
        return evaluateAt(redirection.expression, target);
      },
      call: (name, arguments_) => current.call(name, arguments_),
    };
    const result = evaluateMugenExpression(expression, context, { meter }); reasons.push(...result.bottomReasons); return result.value;
  };
  return evaluateAt(program.expression, entityId);
}

function validSelectorArgument(selector: MugenRedirectionSelector, argument: number | null): boolean { if (argument === null) return selector !== 'playerid'; return selector === 'helper' ? argument > 0 : selector === 'parent' || selector === 'root' || selector === 'partner' ? false : argument >= 0; }
function bottom(reason: string, reasons: string[]): MugenExpressionValue { reasons.push(reason); return mugenBottom(reason); }
