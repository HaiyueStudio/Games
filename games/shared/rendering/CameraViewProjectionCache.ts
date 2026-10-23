import { type Camera3D } from '@haiyue/engine';
import { type Transform3D } from '@haiyue/engine/components';
import { mat4 } from 'wgpu-matrix';

const ASPECT_EPSILON = 1e-6;

interface ProjectionSnapshot {
  projectionType: Camera3D['projectionType'];
  aspect: number;
  fov: number;
  near: number;
  far: number;
  reverseZ: boolean;
  orthoLeft: number;
  orthoRight: number;
  orthoTop: number;
  orthoBottom: number;
}

/** Rebuilds a view-projection matrix only when its transform or projection changes. */
export class CameraViewProjectionCache {
  private readonly viewMatrix = new Float32Array(16);
  private lastWorldVersion = -1;
  private lastProjection: ProjectionSnapshot | null = null;
  readonly matrix: Float32Array<ArrayBufferLike>;

  constructor(matrix: Float32Array<ArrayBufferLike> = new Float32Array(16)) {
    this.matrix = matrix;
  }

  update(
    transform: Transform3D,
    camera: Camera3D,
    viewportWidth: number,
    viewportHeight: number,
    force = false,
  ): boolean {
    if (transform.worldMatrixDirty) transform.updateWorldMatrix();

    const aspect = Math.max(1, viewportWidth) / Math.max(1, viewportHeight);
    if (Math.abs(camera.aspect - aspect) > ASPECT_EPSILON) camera.updateAspect(aspect);

    const projectionChanged = this.hasProjectionChanged(camera);
    if (!force
      && transform.worldVersion === this.lastWorldVersion
      && !projectionChanged) {
      return false;
    }

    mat4.inverse(transform.worldMatrix, this.viewMatrix);
    mat4.multiply(camera.projectionMatrix, this.viewMatrix, this.matrix);
    this.lastWorldVersion = transform.worldVersion;
    this.lastProjection = this.captureProjection(camera);
    return true;
  }

  invalidate(): void {
    this.lastWorldVersion = -1;
    this.lastProjection = null;
  }

  private hasProjectionChanged(camera: Camera3D): boolean {
    const last = this.lastProjection;
    return last === null
      || last.projectionType !== camera.projectionType
      || last.aspect !== camera.aspect
      || last.fov !== camera.fov
      || last.near !== camera.near
      || last.far !== camera.far
      || last.reverseZ !== camera.reverseZ
      || last.orthoLeft !== camera.orthoLeft
      || last.orthoRight !== camera.orthoRight
      || last.orthoTop !== camera.orthoTop
      || last.orthoBottom !== camera.orthoBottom;
  }

  private captureProjection(camera: Camera3D): ProjectionSnapshot {
    return {
      projectionType: camera.projectionType,
      aspect: camera.aspect,
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      reverseZ: camera.reverseZ,
      orthoLeft: camera.orthoLeft,
      orthoRight: camera.orthoRight,
      orthoTop: camera.orthoTop,
      orthoBottom: camera.orthoBottom,
    };
  }
}
