import type { MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenAirElement } from '../import/air/types';
import type { MugenStageBackground, MugenStageModel } from '../import/stage/MugenStageParser';
import type { MugenStageCameraSnapshot } from '../runtime/stage/MugenStageCamera';
import type { MugenViewerActorFrame } from '../viewer/MugenWebGpuView';
import { mugenStageViewportTransform } from './MugenCharacterScale';

export interface MugenStageRenderActor { readonly id: string; readonly layer: 0 | 1; readonly order: number; readonly actor: MugenViewerActorFrame }

/** Reuses immutable stage snapshots while neither the camera nor an animated background changed. */
export class MugenStageRenderCache {
  #stage: MugenStageModel | null = null;
  #cameraX = Number.NaN;
  #cameraY = Number.NaN;
  #tick = -1;
  #width = -1;
  #height = -1;
  #animated = false;
  #actors: readonly MugenStageRenderActor[] = Object.freeze([]);

  actors(stage: MugenStageModel, camera: MugenStageCameraSnapshot, tick: number, viewport: Readonly<{ width: number; height: number }>): readonly MugenStageRenderActor[] {
    if (stage !== this.#stage) {
      this.#stage = stage;
      this.#animated = stage.backgrounds.some(background => background.velocity[0] !== 0 || background.velocity[1] !== 0);
      this.#tick = -1;
    }
    const effectiveTick = this.#animated ? tick : 0;
    if (camera.position[0] === this.#cameraX && camera.position[1] === this.#cameraY && effectiveTick === this.#tick && viewport.width === this.#width && viewport.height === this.#height) return this.#actors;
    this.#cameraX = camera.position[0]; this.#cameraY = camera.position[1]; this.#tick = effectiveTick; this.#width = viewport.width; this.#height = viewport.height;
    this.#actors = createMugenStageRenderActors(stage, camera, effectiveTick, viewport);
    return this.#actors;
  }
}

export function createMugenStageRenderActors(stage: MugenStageModel, camera: MugenStageCameraSnapshot, tick: number, viewport: Readonly<{ width: number; height: number }>): readonly MugenStageRenderActor[] {
  const transform = mugenStageViewportTransform(viewport, stage.localCoord); const coordinateScale = transform.scale; const actors: MugenStageRenderActor[] = [];
  for (const [order, background] of stage.backgrounds.entries()) {
    const sprite = stage.spriteByKey.get(`${background.spriteGroup},${background.spriteItem}`); if (sprite === undefined) continue;
    const xScale = stage.stageScale[0] * coordinateScale * (background.type === 'parallax' ? (background.xScale[0] + background.xScale[1]) / 2 : background.xScale[0]);
    const yScale = stage.stageScale[1] * coordinateScale * Math.max(.01, (background.yScaleStart + camera.position[1] * background.yScaleDelta) / 100);
    const baseX = transform.offsetX + stage.localCoord[0] * coordinateScale / 2 + (background.start[0] + background.velocity[0] * tick - camera.position[0] * background.delta[0]) * coordinateScale;
    const baseY = transform.offsetY + (background.start[1] + background.velocity[1] * tick - camera.position[1] * background.delta[1]) * coordinateScale;
    const xOffsets = tileOffsets(background.tile[0], (sprite.width + background.tileSpacing[0]) * xScale, baseX, viewport.width); const yOffsets = tileOffsets(background.tile[1], (sprite.height + background.tileSpacing[1]) * yScale, baseY, viewport.height);
    for (const [xIndex, xOffset] of xOffsets.entries()) for (const [yIndex, yOffset] of yOffsets.entries()) actors.push(Object.freeze({
      id: `${background.id}:${xIndex}:${yIndex}`, layer: background.layer, order,
      actor: Object.freeze({ snapshot: snapshot(background, baseX + xOffset, baseY + yOffset, xScale, yScale), paletteId: sprite.defaultPaletteId, transparency: Object.freeze({ mode: background.transparency, alpha: background.alpha }) }),
    }));
  }
  return Object.freeze(actors);
}

function snapshot(background: MugenStageBackground, x: number, y: number, scaleX: number, scaleY: number): MugenAirSnapshot {
  const element: MugenAirElement = Object.freeze({ index: 0, spriteGroup: background.spriteGroup, spriteItem: background.spriteItem, spriteId: background.spriteId, offsetX: 0, offsetY: 0, durationTicks: -1, flipX: false, flipY: false, blend: blend(background), scaleX: 1, scaleY: 1, angleDegrees: 0, interpolateToThis: Object.freeze([]), clsn1: Object.freeze([]), clsn2: Object.freeze([]), byteOffset: 0, line: 0, column: 0 });
  return Object.freeze({ actionNumber: -1, actionTick: 0, frameIndex: 0, frameTick: 0, completedLoops: 0, generation: 0, element, clsn1: Object.freeze([]), clsn2: Object.freeze([]), render: Object.freeze({ spriteId: background.spriteId, spriteGroup: background.spriteGroup, spriteItem: background.spriteItem, missingSprite: false, positionX: Math.fround(x), positionY: Math.fround(y), axisX: 0, axisY: 0, flipX: false, flipY: false, scaleX: Math.fround(scaleX), scaleY: Math.fround(scaleY), rotationRadians: 0, blend: blend(background), interpolationProgress: 0, interpolated: Object.freeze([]) }) });
}

function blend(background: MugenStageBackground) { return Object.freeze({ mode: background.transparency === 'sub' ? 'subtract' as const : background.transparency === 'none' ? 'opaque' as const : 'add' as const, sourceAlpha: background.alpha[0], destinationAlpha: background.transparency === 'add1' ? 128 : background.alpha[1] }); }

function tileOffsets(mode: number, step: number, base: number, extent: number): readonly number[] {
  if (mode === 0 || !Number.isFinite(step) || Math.abs(step) < .001) return Object.freeze([0]);
  if (mode > 1) return Object.freeze(Array.from({ length: Math.min(64, mode) }, (_, index) => Math.fround(index * step)));
  const count = Math.min(32, Math.ceil(extent / Math.abs(step)) + 2); const center = Math.round(-base / step); return Object.freeze(Array.from({ length: count * 2 + 1 }, (_, index) => Math.fround((center + index - count) * step)));
}
