import { gameSession } from './SessionPause';
import { sessionEngine, sessionFrames } from './GameEngine';
import { ReturnDialog } from './ReturnDialog';
import type { PadFrame } from '../gamepad/sampler';
export class GameReturnController {
    private dialog: ReturnDialog | null = null;
    private readonly lifetime = new AbortController();
    private readonly keys = new Map<string, string>();
    private readonly pointers = new Map<number, PointerEvent>();
    private axis = 0;
    private waitingNeutral = true;
    private restoreFocus: HTMLElement | null = null;
    private suppressClick = false;
    private readonly blockedKeys = new Set<string>();
    constructor(private readonly release: () => void) {
        const options = { capture: true, signal: this.lifetime.signal };
        window.addEventListener('keydown', e => {
            if (this.blockedKeys.has(e.code)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (!this.active) {
                this.suppressClick = false;
                this.keys.set(e.code, e.key);
                return;
            }
            this.blockedKeys.add(e.code);
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.repeat)
                return;
            if (['Escape', 'Backspace', 'KeyP'].includes(e.code))
                this.dialog?.cancel();
            else if (['Enter', 'Space', 'KeyJ'].includes(e.code))
                this.dialog?.confirm();
            else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Tab'].includes(e.code))
                this.dialog?.move();
        }, options);
        window.addEventListener('keyup', e => { this.keys.delete(e.code); const blocked = this.blockedKeys.delete(e.code); if (this.active || blocked) {
            e.preventDefault();
            e.stopImmediatePropagation();
        } }, options);
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const)
            window.addEventListener(type, e => {
                if (!this.active) {
                    if (type === 'pointerdown') {
                        this.suppressClick = false;
                        this.pointers.set(e.pointerId, e);
                    }
                    else if (type === 'pointerup' || type === 'pointercancel')
                        this.pointers.delete(e.pointerId);
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                if (type === 'pointerup')
                    this.suppressClick = true;
                this.dialog?.pointerEvent(e);
            }, options);
        for (const type of ['click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel', 'contextmenu'])
            window.addEventListener(type, e => { if (this.active || (this.suppressClick && ['click', 'mouseup', 'touchend'].includes(type))) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (type === 'click')
                    this.suppressClick = false;
            } }, { ...options, passive: false });
        const query = new URLSearchParams(location.search);
        if (query.has('verify') || query.has('gamepadVerify'))
            Object.defineProperty(window, '__gameReturn', { configurable: true, value: { snapshot: () => ({ active: this.active, paused: gameSession.paused, ready: !!sessionEngine(), gameFrames: sessionFrames(), ...this.dialog?.snapshot() }) } });
    }
    get active(): boolean { return this.dialog !== null; }
    request(): void {
        if (this.active)
            return;
        const engine = sessionEngine();
        if (!engine)
            return; // Games may still be initializing their GPU.
        this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.release();
        // Release live gameplay gestures before input is isolated; never synthesize blur (it changes game modes).
        for (const [code, key] of this.keys) {
            (document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
            this.blockedKeys.add(code);
        }
        this.keys.clear();
        for (const [id, event] of this.pointers) {
            event.target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: event.pointerType }));
            if (event.target instanceof Element && event.target.hasPointerCapture(id))
                event.target.releasePointerCapture(id);
        }
        this.pointers.clear();
        // Drawing is driven only by the gamepad host while gameplay is paused.
        this.dialog = new ReturnDialog(engine, home => this.close(home));
        gameSession.pause();
        this.waitingNeutral = true;
        this.axis = 0;
        document.body.dataset.gameReturnOpen = 'true';
        if (document.pointerLockElement)
            document.exitPointerLock();
    }
    update(time: number, pads: readonly PadFrame[]): void {
        if (!this.dialog)
            return;
        this.dialog.draw(time);
        if (!pads.length) {
            this.waitingNeutral = true;
            this.axis = 0;
            return;
        }
        if (this.waitingNeutral) {
            if (pads.every(p => Object.values(p.values).every(value => Math.abs(value) < .25)))
                this.waitingNeutral = false;
            return;
        }
        if (pads.some(p => p.pressed.has('b1') || p.pressed.has('b8'))) {
            this.dialog.cancel();
            return;
        }
        const direction = pads.some(p => Math.abs(p.values.x ?? 0) > .4 || Math.abs(p.values.y ?? 0) > .4 || ['b12', 'b13', 'b14', 'b15'].some(b => p.held.has(b))) ? 1 : 0;
        if (direction && !this.axis)
            this.dialog.move();
        this.axis = direction;
        if (pads.some(p => p.pressed.has('b0')))
            this.dialog.confirm();
    }
    private close(home: boolean): void {
        this.dialog?.dispose();
        this.dialog = null;
        delete document.body.dataset.gameReturnOpen;
        this.release();
        if (home) {
            // The parent validates source and origin; direct pages use the same relative lobby route.
            if (parent !== window)
                parent.postMessage({ type: 'haiyue-gamepad-home' }, location.origin);
            else
                void this.goHome();
            return;
        }
        gameSession.resume();
        this.restoreFocus?.focus({ preventScroll: true });
    }
    private async goHome(): Promise<void> {
        const home = new URL('../../index.html', location.href);
        try {
            const response = await fetch(home, { method: 'HEAD' });
            if (!response.ok)
                home.pathname = new URL('./site/index.html', home).pathname;
        }
        catch { /* Navigation may still succeed after a transient fetch failure. */ }
        location.assign(home.href);
    }
    dispose(): void { this.lifetime.abort(); this.dialog?.dispose(); this.dialog = null; }
}
