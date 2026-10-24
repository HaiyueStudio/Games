import { ControllerOverlay, controllerFeedbackVisible } from '../gamepad/ui/ControllerOverlay';
import { HaiyueEngine, type HaiyueEngineOptions } from '@haiyue/engine';
import { gameSession, gameTime } from './SessionPause';
import { RttEngine } from '@haiyue/engine/rtt';
import type { GameBridge } from '../host/types';
import { preserveGamePass } from './gamePass';
class HostedGameTarget extends RttEngine {
    override getRenderPassDescriptor(options?: Parameters<RttEngine['getRenderPassDescriptor']>[0]): GPURenderPassDescriptor {
        return preserveGamePass(super.getRenderPassDescriptor(options));
    }
}
const hostBridge = (): GameBridge | undefined => (window as Window & { __haiyueGameHost?: GameBridge }).__haiyueGameHost;
const engines = new Set<GameEngine>();
/** Small host adapter: pause with public Engine stop/run, preserving each engine's running state. */
export class GameEngine extends HaiyueEngine {
    private wantsRunning = false;
    private controllerGui: ControllerOverlay | null = null;
    private controllerFeedbackWasVisible = false;
    updates = 0;
    private readonly unregister: () => void;
    private textureTarget: RttEngine | null = null;
    private hostSuspended = false;
    private hostRestore = false;
    constructor(options: HaiyueEngineOptions) {
        super(hostBridge()?.mode === 'texture' ? { ...options, devicePixelRatio: 1 } : options);
        engines.add(this);
        this.unregister = gameSession.register({ pause: () => { super.stop(); }, resume: () => { if (this.wantsRunning && !this.hostSuspended && this.state === 'ready')
                super.run(); } });
        const host = hostBridge(); host?.engine(this);
        let announced = false;
        this.on('after-update', () => { if (!announced) { announced = true; host?.ready(); } });
        this.on('after-update', e => {
            if (gameSession.paused || sessionEngine() !== this) return;
            const visible = controllerFeedbackVisible();
            if (!visible && !this.controllerFeedbackWasVisible) return;
            this.controllerFeedbackWasVisible = visible;
            this.controllerGui ??= new ControllerOverlay(this);
            this.controllerGui.draw(e.detail.time, e.detail.delta);
        }, { priority: -Number.MAX_SAFE_INTEGER });
        for (const event of ['update', 'after-update'] as const)
            this.on(event, e => { if (event === 'update')
                { this.updates++; this.syncTextureTarget(); } e.detail.time = gameTime(e.detail.time); }, { priority: Number.MAX_SAFE_INTEGER });
    }
    override async init(): Promise<this> {
        await super.init();
        if (hostBridge()?.mode === 'texture') { this.textureTarget = new HostedGameTarget(this, this.width, this.height, this.clearColor, 'Hosted game screen'); this.syncTextureTarget(); }
        return this;
    }
    get screenTexture(): GPUTexture | null { return this.textureTarget?.colorTexture ?? null; }
    get runningForHost(): boolean { return this.wantsRunning && !this.hostSuspended && !gameSession.paused; }
    override get renderTarget() { return this.textureTarget ?? super.renderTarget; }
    override get msaaTextureView() { return this.textureTarget ? this.textureTarget.msaaTextureView : super.msaaTextureView; }
    override get depthTextureView() { return this.textureTarget ? this.textureTarget.depthTextureView : super.depthTextureView; }
    override getOutputView() { return this.textureTarget?.getOutputView() ?? super.getOutputView(); }
    override getRenderPassDescriptor() { this.syncTextureTarget(); return this.textureTarget?.getRenderPassDescriptor() ?? super.getRenderPassDescriptor(); }
    override getRenderPassDescriptorVersion() { this.syncTextureTarget(); return this.textureTarget?.getRenderPassDescriptorVersion() ?? super.getRenderPassDescriptorVersion(); }
    override resizeToDisplaySize(force = false): boolean {
        const changed = super.resizeToDisplaySize(force);
        if (this.textureTarget && (this.textureTarget.width !== this.width || this.textureTarget.height !== this.height)) this.textureTarget.resize(this.width, this.height);
        return changed;
    }
    private syncTextureTarget(): void { if (this.textureTarget) { this.textureTarget.clearColor = this.clearColor; this.textureTarget.reverseZ = this.reverseZ; this.textureTarget.msaaSamples = this.msaaSamples; } }
    pauseForHost(): void { if (!this.hostSuspended) this.hostRestore = this.wantsRunning; this.hostSuspended = true; super.stop(); }
    resumeForHost(): void { if (!this.hostSuspended) return; this.hostSuspended = false; this.wantsRunning ||= this.hostRestore; this.hostRestore = false; if (this.wantsRunning && this.state === 'ready' && !gameSession.paused) super.run(); }
    override run(): this { this.wantsRunning = true; if (!gameSession.paused && !this.hostSuspended)
        super.run(); return this; }
    override stop(): this { this.wantsRunning = false; return super.stop(); }
    override updateActiveScene(time = performance.now(), delta = 0): this {
        return gameSession.paused ? this : super.updateActiveScene(gameTime(time), delta);
    }
    override destroy(): void { if (this.state === 'destroyed') return; this.textureTarget?.destroy(); this.textureTarget = null; this.controllerGui?.dispose(); this.controllerGui = null; this.unregister(); engines.delete(this); this.wantsRunning = false; super.destroy(); }
}
export function sessionEngine(): GameEngine | undefined {
    return [...engines].filter(engine => engine.state === 'ready' && (engine.canvas?.getBoundingClientRect().width ?? 0) > 0)
        .sort((a, b) => b.canvas!.getBoundingClientRect().width * b.canvas!.getBoundingClientRect().height - a.canvas!.getBoundingClientRect().width * a.canvas!.getBoundingClientRect().height)[0];
}
export function sessionFrames(): number { return [...engines].reduce((sum, engine) => sum + engine.updates, 0); }
