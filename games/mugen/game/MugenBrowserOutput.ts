import type { MugenOutputAuthoritySnapshot, MugenOutputEvent } from '../runtime/effects/MugenOutputAuthority';

export interface MugenBrowserOutputStats { readonly tick: number; readonly forceFeedbackEvents: number; readonly forceFeedbackApplied: number; readonly clipboardDiagnostics: number }

/** Hash-excluded browser adapter. It never writes the operating-system clipboard. */
export class MugenBrowserOutput {
  readonly #debugBuffers = new Map<string, string>();
  #lastTick = -1;

  consume(snapshot: MugenOutputAuthoritySnapshot): MugenBrowserOutputStats {
    if (snapshot.tick === this.#lastTick) return Object.freeze({ tick: snapshot.tick, forceFeedbackEvents: 0, forceFeedbackApplied: 0, clipboardDiagnostics: 0 });
    this.#lastTick = snapshot.tick; let forceFeedbackEvents = 0; let forceFeedbackApplied = 0; let clipboardDiagnostics = 0;
    for (const event of snapshot.events) {
      if (event.kind === 'clipboard-debug') {
        clipboardDiagnostics += 1;
        if (event.mode === 'clear') { this.#debugBuffers.delete(event.entityId); continue; }
        const previous = this.#debugBuffers.get(event.entityId) ?? '';
        this.#debugBuffers.set(event.entityId, event.mode === 'replace' ? diagnosticText(event) : `${previous}${previous === '' ? '' : '\n'}${diagnosticText(event)}`);
        continue;
      }
      if (event.kind === 'force-feedback') { forceFeedbackEvents += 1; if (this.#applyForceFeedback(event)) forceFeedbackApplied += 1; }
    }
    return Object.freeze({ tick: snapshot.tick, forceFeedbackEvents, forceFeedbackApplied, clipboardDiagnostics });
  }

  debugText(entityId: string): string { return this.#debugBuffers.get(entityId) ?? ''; }
  reset(): void { this.#debugBuffers.clear(); this.#lastTick = -1; }

  #applyForceFeedback(event: Extract<MugenOutputEvent, { kind: 'force-feedback' }>): boolean {
    const gamepads = typeof navigator === 'undefined' || navigator.getGamepads === undefined ? [] : [...navigator.getGamepads()].filter((value): value is Gamepad => value !== null);
    const ownIndex = event.rootId.toUpperCase() === 'P2' ? 1 : 0; const index = event.target === 'self' ? ownIndex : ownIndex === 0 ? 1 : 0; const pad = gamepads[index];
    const actuator = pad?.vibrationActuator as GamepadHapticActuator & { playEffect?: (type: 'dual-rumble', parameters: { duration: number; startDelay: number; strongMagnitude: number; weakMagnitude: number }) => Promise<string> } | undefined;
    if (!actuator?.playEffect) return false;
    const amplitude = Math.max(0, Math.min(1, event.amplitude[0] / 255)); const sine = event.waveform === 'sine' || event.waveform === 'sinesquare'; const square = event.waveform === 'square' || event.waveform === 'sinesquare';
    void actuator.playEffect('dual-rumble', { duration: event.waveform === 'off' ? 0 : Math.max(0, event.time) * 1000 / 60, startDelay: 0, strongMagnitude: sine ? amplitude : 0, weakMagnitude: square ? amplitude : 0 }).catch(() => undefined);
    return true;
  }
}

function diagnosticText(event: Extract<MugenOutputEvent, { kind: 'clipboard-debug' }>): string { return event.paramsSource === '' ? event.text : `${event.text} [params: ${event.paramsSource}]`; }
