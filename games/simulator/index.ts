import { SimulatorHome, type SimulatorHomeOptions } from './SimulatorHome';
import { SimulatorPlayer, type SimulatorPlayerOptions } from './SimulatorPlayer';
export function createSimulatorHome(options: SimulatorHomeOptions) { return new SimulatorHome(options); }
export async function createSimulatorPlayer(options: SimulatorPlayerOptions) { const player = new SimulatorPlayer(options); try { return await player.init(); } catch (error) { player.dispose(); throw error; } }
export { createSimulatorPlayer as createSimulatorDevice };
export type { SimulatorHomeOptions, SimulatorPlayerOptions };
