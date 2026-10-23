export interface SessionParticipant {
    pause(): void;
    resume(): void;
}
/** Shared game-session policy; clocks exclude time spent in the system return dialog. */
export class SessionPause {
    private readonly participants = new Set<SessionParticipant>();
    private started: number | null = null;
    private elapsed = 0;
    private readonly now: () => number;
    constructor(now: () => number = () => performance.now()) { this.now = now; }
    get paused(): boolean { return this.started !== null; }
    time(wall = this.now()): number { return (this.started ?? wall) - this.elapsed; }
    register(participant: SessionParticipant): () => void {
        this.participants.add(participant);
        if (this.paused)
            participant.pause();
        return () => this.participants.delete(participant);
    }
    pause(): void {
        if (this.paused)
            return;
        this.started = this.now();
        for (const participant of this.participants)
            participant.pause();
    }
    resume(): void {
        if (this.started === null)
            return;
        this.elapsed += this.now() - this.started;
        this.started = null;
        for (const participant of this.participants)
            participant.resume();
    }
}
export const gameSession = new SessionPause();
export const gameTime = (wall?: number): number => gameSession.time(wall);
/** Only gameplay delays use this; network/worker watchdogs remain wall-clock based. */
export function gameDelay(callback: () => void, delay: number): () => void {
    let remaining = delay, started = gameTime(), timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { started = gameTime(); timer = setTimeout(() => { remove(); callback(); }, remaining); };
    const remove = gameSession.register({ pause: () => { clearTimeout(timer); remaining = Math.max(0, remaining - (gameTime() - started)); }, resume: schedule });
    if (!gameSession.paused)
        schedule();
    return () => { clearTimeout(timer); remove(); };
}
