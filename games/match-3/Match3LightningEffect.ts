import { Entity, World } from '@haiyue/engine';
import { Line3D } from '@haiyue/engine/components';
import { LineGeometry } from '@haiyue/engine/geometry';
import { LineMaterial } from '@haiyue/engine/material';
import type { Line3DRenderSystem } from '@haiyue/engine/systems';
import type { GemKind } from './Match3Board';
import { colorForGem } from './Match3Palette';
import {
  MATCH3_LIGHTNING_SEGMENTS,
  createLightningSegments,
  type LightningTarget,
  type Match3LightningPoint,
} from './Match3LightningGeometry';

export type { LightningTarget } from './Match3LightningGeometry';

interface ActiveLightning {
  readonly sourceId: number;
  readonly source: Match3LightningPoint;
  readonly targets: readonly LightningTarget[];
  elapsedMs: number;
  frame: number;
}

const LIGHTNING_FRAME_MS = 42;
export const MATCH3_LIGHTNING_DURATION_MS = 380;

/** Transient two-layer lightning presentation used by activated rainbow tiles. */
export class Match3LightningEffect {
  private readonly world: World;
  private readonly renderSystem: Line3DRenderSystem;
  private readonly outerGeometry = new LineGeometry([], { topology: 'segments' });
  private readonly coreGeometry = new LineGeometry([], { topology: 'segments' });
  private readonly outerMaterial = new LineMaterial({
    color: [0.2, 0.72, 1, 1],
    width: 9,
    screenSpace: true,
    cap: 'round',
  });
  private readonly coreMaterial = new LineMaterial({
    color: [0.94, 0.99, 1, 1],
    width: 2.8,
    screenSpace: true,
    cap: 'round',
  });
  private readonly outerEntity = new Entity('RainbowLightningGlow')
    .addComponent(new Line3D(this.outerGeometry, this.outerMaterial));
  private readonly coreEntity = new Entity('RainbowLightningCore')
    .addComponent(new Line3D(this.coreGeometry, this.coreMaterial));
  private active: ActiveLightning | null = null;
  private entitiesAttached = false;

  constructor(world: World, renderSystem: Line3DRenderSystem) {
    this.world = world;
    this.renderSystem = renderSystem;
    this.renderSystem.disabled = true;
  }

  get activeTargetCount(): number {
    return this.active?.targets.length ?? 0;
  }

  get activeSegmentCount(): number {
    return this.active ? this.active.targets.length * MATCH3_LIGHTNING_SEGMENTS : 0;
  }

  start(
    sourceId: number,
    source: Match3LightningPoint,
    targetColor: GemKind,
    targets: readonly LightningTarget[],
  ): void {
    this.clear();
    if (targets.length === 0) return;
    this.active = {
      sourceId,
      source: [...source],
      targets: targets.map(target => ({ id: target.id, position: [...target.position] })),
      elapsedMs: 0,
      frame: -1,
    };
    this.outerMaterial.color = colorForGem(targetColor);
    this.attachEntities();
    this.renderSystem.disabled = false;
    this.refreshGeometry();
  }

  update(deltaMs: number): void {
    if (!this.active) return;
    this.active.elapsedMs += Math.max(0, deltaMs);
    if (this.active.elapsedMs >= MATCH3_LIGHTNING_DURATION_MS) {
      this.clear();
      return;
    }
    const frame = Math.floor(this.active.elapsedMs / LIGHTNING_FRAME_MS);
    if (frame !== this.active.frame) this.refreshGeometry();
  }

  clear(): void {
    this.active = null;
    this.renderSystem.disabled = true;
    this.outerGeometry.setPoints([]);
    this.coreGeometry.setPoints([]);
    if (!this.entitiesAttached) return;
    this.world.removeEntity(this.outerEntity);
    this.world.removeEntity(this.coreEntity);
    this.entitiesAttached = false;
  }

  private attachEntities(): void {
    if (this.entitiesAttached) return;
    this.world.addEntity(this.outerEntity);
    this.world.addEntity(this.coreEntity);
    this.entitiesAttached = true;
  }

  private refreshGeometry(): void {
    const active = this.active;
    if (!active) return;
    const frame = Math.floor(active.elapsedMs / LIGHTNING_FRAME_MS);
    active.frame = frame;
    this.outerGeometry.setPoints(createLightningSegments(
      [active.source[0], active.source[1], active.source[2] + 0.46],
      active.targets,
      active.sourceId,
      frame,
      0.46,
    ));
    this.coreGeometry.setPoints(createLightningSegments(
      [active.source[0], active.source[1], active.source[2] + 0.50],
      active.targets,
      active.sourceId,
      frame,
      0.50,
    ));
  }
}
