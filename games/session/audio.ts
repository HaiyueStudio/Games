import { gameSession } from './SessionPause';
/** Pause/resume the existing public audio owner, without replacing its mixer or voices. */
export function sessionAudio<T extends {
    state: string;
    suspend(): Promise<unknown>;
    resume(): Promise<unknown>;
}>(audio: T): T {
    let resume = false;
    const remove = gameSession.register({
        pause: () => { resume = audio.state === 'running'; if (resume)
            void audio.suspend().catch(() => { }); },
        resume: () => { if (resume && audio.state !== 'closed')
            void audio.resume().catch(() => { }); resume = false; },
    });
    if (audio instanceof EventTarget)
        audio.addEventListener('statechange', () => {
            if (audio.state === 'closed')
                remove();
            else if (gameSession.paused && audio.state === 'running') {
                resume = true;
                void audio.suspend().catch(() => { });
            }
        });
    return audio;
}
