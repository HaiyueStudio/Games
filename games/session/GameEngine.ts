import { HaiyueEngine, type HaiyueEngineOptions } from '@haiyue/engine';
import { gameSession, gameTime } from './SessionPause';
const engines = new Set<GameEngine>();
/** Small host adapter: pause with public Engine stop/run, preserving each engine's running state. */
export class GameEngine extends HaiyueEngine {
    private wantsRunning = false;
    updates = 0;
    private readonly unregister: () => void;
    constructor(options: HaiyueEngineOptions) {
        super(options);
        engines.add(this);
        this.unregister = gameSession.register({ pause: () => { super.stop(); }, resume: () => { if (this.wantsRunning && this.state === 'ready')
                super.run(); } });
        for (const event of ['update', 'after-update'] as const)
            this.on(event, e => { if (event === 'update')
                this.updates++; e.detail.time = gameTime(e.detail.time); }, { priority: Number.MAX_SAFE_INTEGER });
    }
    override run(): this { this.wantsRunning = true; if (!gameSession.paused)
        super.run(); return this; }
    override stop(): this { this.wantsRunning = false; return super.stop(); }
    override updateActiveScene(time = performance.now(), delta = 0): this {
        return gameSession.paused ? this : super.updateActiveScene(gameTime(time), delta);
    }
    override destroy(): void { this.unregister(); engines.delete(this); this.wantsRunning = false; super.destroy(); }
}
export function sessionEngine(): GameEngine | undefined {
    return [...engines].filter(engine => engine.state === 'ready' && (engine.canvas?.getBoundingClientRect().width ?? 0) > 0)
        .sort((a, b) => b.canvas!.getBoundingClientRect().width * b.canvas!.getBoundingClientRect().height - a.canvas!.getBoundingClientRect().width * a.canvas!.getBoundingClientRect().height)[0];
}
export function sessionFrames(): number { return [...engines].reduce((sum, engine) => sum + engine.updates, 0); }
