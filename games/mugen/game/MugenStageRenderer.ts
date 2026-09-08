import { evaluateMugenAirAction, type MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenAirElement } from '../import/air/types';
import type { MugenStageBackground, MugenStageModel } from '../import/stage/MugenStageParser';
import type { MugenStageCameraSnapshot } from '../runtime/stage/MugenStageCamera';
import type { MugenViewerActorFrame } from '../viewer/MugenWebGpuView';
import { mugenStageViewportTransform } from './MugenCharacterScale';

export interface MugenStageRenderActor { readonly id: string; readonly layer: 0 | 1; readonly order: number; readonly actor: MugenViewerActorFrame }
export interface MugenStageViewTransform { readonly scale: number; readonly offset: readonly [number, number] }
export interface MugenStageClipRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Returns the fixed on-screen rectangle occupied by the stage's declared local coordinate system. */
export function mugenStageClipRect(viewport: Readonly<{ width: number; height: number }>, localCoord: readonly [number, number]): MugenStageClipRect {
  const transform = mugenStageViewportTransform(viewport, localCoord);
  const left = Math.max(0, Math.floor(transform.offsetX)); const top = Math.max(0, Math.floor(transform.offsetY));
  const right = Math.min(viewport.width, Math.ceil(transform.offsetX + localCoord[0] * transform.scale));
  const bottom = Math.min(viewport.height, Math.ceil(transform.offsetY + localCoord[1] * transform.scale));
  return Object.freeze({ x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
}

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
      this.#animated = stage.backgrounds.some(background => background.animation !== null || background.velocity[0] !== 0 || background.velocity[1] !== 0);
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
  const transform = mugenStageViewportTransform(viewport, stage.localCoord); const coordinateScale = transform.scale; const backgroundCoordinateScale = stage.legacyHighResolution ? .5 : 1; const actors: MugenStageRenderActor[] = [];
  for (const [order, background] of stage.backgrounds.entries()) {
    const animated = background.animation === null ? null : evaluateMugenAirAction(background.animation, tick, { x: 0, y: 0 });
    const spriteGroup = animated?.element.spriteGroup ?? background.spriteGroup;
    const spriteItem = animated?.element.spriteItem ?? background.spriteItem;
    const sprite = stage.spriteByKey.get(`${spriteGroup},${spriteItem}`); if (sprite === undefined) continue;
    const xScale = stage.stageScale[0] * backgroundCoordinateScale * coordinateScale * (background.type === 'parallax' ? (background.xScale[0] + background.xScale[1]) / 2 : background.xScale[0]);
    const yScale = stage.stageScale[1] * backgroundCoordinateScale * coordinateScale * Math.max(.01, (background.yScaleStart + camera.position[1] * background.yScaleDelta) / 100);
    const baseX = transform.offsetX + stage.localCoord[0] * coordinateScale / 2 + (background.start[0] + background.velocity[0] * tick - camera.position[0] * background.delta[0]) * backgroundCoordinateScale * coordinateScale;
    const baseY = transform.offsetY + (background.start[1] + background.velocity[1] * tick - camera.position[1] * background.delta[1]) * backgroundCoordinateScale * coordinateScale;
    const xOffsets = tileOffsets(background.tile[0], (sprite.width + background.tileSpacing[0]) * xScale, baseX, viewport.width); const yOffsets = tileOffsets(background.tile[1], (sprite.height + background.tileSpacing[1]) * yScale, baseY, viewport.height);
    for (const [xIndex, xOffset] of xOffsets.entries()) for (const [yIndex, yOffset] of yOffsets.entries()) actors.push(Object.freeze({
      id: `${background.id}:${xIndex}:${yIndex}`, layer: background.layer, order,
      actor: Object.freeze({
        snapshot: snapshot(background, baseX + xOffset, baseY + yOffset, xScale, yScale, animated),
        paletteId: sprite.defaultPaletteId,
        mask: background.mask,
        transparency: Object.freeze({ mode: background.animation !== null && background.transparency === 'none' ? 'default' : background.transparency, alpha: background.alpha }),
      }),
    }));
  }
  return Object.freeze(actors);
}

/** Applies a preview-only zoom and pan around the viewport center. */
export function transformMugenStageRenderActors(actors: readonly MugenStageRenderActor[], viewport: Readonly<{ width: number; height: number }>, view: MugenStageViewTransform): readonly MugenStageRenderActor[] {
  if (!Number.isFinite(view.scale) || view.scale <= 0 || !view.offset.every(Number.isFinite)) throw new RangeError('MUGEN stage view transform must be finite and positive.');
  const centerX = viewport.width / 2; const centerY = viewport.height / 2;
  return Object.freeze(actors.map(value => {
    const render = value.actor.snapshot.render;
    return Object.freeze({
      ...value,
      actor: Object.freeze({
        ...value.actor,
        snapshot: Object.freeze({
          ...value.actor.snapshot,
          render: Object.freeze({
            ...render,
            positionX: Math.fround(centerX + (render.positionX - centerX) * view.scale + view.offset[0]),
            positionY: Math.fround(centerY + (render.positionY - centerY) * view.scale + view.offset[1]),
            scaleX: Math.fround(render.scaleX * view.scale),
            scaleY: Math.fround(render.scaleY * view.scale),
          }),
        }),
      }),
    });
  }));
}

function snapshot(background: MugenStageBackground, x: number, y: number, scaleX: number, scaleY: number, animated: MugenAirSnapshot | null): MugenAirSnapshot {
  if (animated !== null) return Object.freeze({
    ...animated,
    render: Object.freeze({
      ...animated.render,
      positionX: Math.fround(x + animated.render.positionX * scaleX),
      positionY: Math.fround(y + animated.render.positionY * scaleY),
      scaleX: Math.fround(animated.render.scaleX * scaleX),
      scaleY: Math.fround(animated.render.scaleY * scaleY),
    }),
  });
  const element: MugenAirElement = Object.freeze({ index: 0, spriteGroup: background.spriteGroup, spriteItem: background.spriteItem, spriteId: background.spriteId, offsetX: 0, offsetY: 0, durationTicks: -1, flipX: false, flipY: false, blend: blend(background), scaleX: 1, scaleY: 1, angleDegrees: 0, interpolateToThis: Object.freeze([]), clsn1: Object.freeze([]), clsn2: Object.freeze([]), byteOffset: 0, line: 0, column: 0 });
  return Object.freeze({ actionNumber: -1, actionTick: 0, frameIndex: 0, frameTick: 0, completedLoops: 0, generation: 0, element, clsn1: Object.freeze([]), clsn2: Object.freeze([]), render: Object.freeze({ spriteId: background.spriteId, spriteGroup: background.spriteGroup, spriteItem: background.spriteItem, missingSprite: false, positionX: Math.fround(x), positionY: Math.fround(y), axisX: 0, axisY: 0, flipX: false, flipY: false, scaleX: Math.fround(scaleX), scaleY: Math.fround(scaleY), rotationRadians: 0, blend: blend(background), interpolationProgress: 0, interpolated: Object.freeze([]) }) });
}

function blend(background: MugenStageBackground) { return Object.freeze({ mode: background.transparency === 'sub' ? 'subtract' as const : background.transparency === 'none' ? 'opaque' as const : 'add' as const, sourceAlpha: background.alpha[0], destinationAlpha: background.transparency === 'add1' ? 128 : background.alpha[1] }); }

function tileOffsets(mode: number, step: number, base: number, extent: number): readonly number[] {
  if (mode === 0 || !Number.isFinite(step) || Math.abs(step) < .001) return Object.freeze([0]);
  if (mode > 1) return Object.freeze(Array.from({ length: Math.min(64, mode) }, (_, index) => Math.fround(index * step)));
  const count = Math.min(32, Math.ceil(extent / Math.abs(step)) + 2); const center = Math.round(-base / step); return Object.freeze(Array.from({ length: count * 2 + 1 }, (_, index) => Math.fround((center + index - count) * step)));
}
