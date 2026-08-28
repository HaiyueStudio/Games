import { startEntanglementPath } from './EntanglementPathGame';

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Missing canvas element.');
void startEntanglementPath(canvas).catch(error => console.error(error));
