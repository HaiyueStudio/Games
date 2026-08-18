import { Mesh3D } from '@haiyue/engine';
import {
  Geometry3D,
  createRoundedBox3D,
  createSphere3D,
  createTorus3D,
} from '@haiyue/engine/geometry';
import { BlinnPhongMaterial } from '@haiyue/engine/material';
import type { GemKind } from './Match3Board';
import { MATCH3_GEM_COLORS } from './Match3Palette';
import type { TileSpecial } from './Match3SpecialRules';

type Color = readonly [number, number, number, number];

/** Owns the reusable geometry/material variants used by match-3 tile states. */
export class Match3TilePresentation {
  private readonly normalGeometry: Geometry3D;
  private readonly bombGeometry: Geometry3D;
  private readonly rainbowGeometry: Geometry3D;
  private readonly superBombGeometry: Geometry3D;
  private readonly normalMaterials: BlinnPhongMaterial[] = [];
  private readonly bombMaterials: BlinnPhongMaterial[] = [];
  private readonly superBombMaterials: BlinnPhongMaterial[] = [];
  private readonly rainbowMaterial = new BlinnPhongMaterial({
    ambient: [0.18, 0.09, 0.28, 1],
    diffuse: [0.92, 0.42, 1, 1],
    specular: [1, 1, 1, 1],
    shininess: 118,
  });
  private lastRainbowFrame = -1;

  constructor(tileSize: number, tileDepth: number) {
    this.normalGeometry = createRoundedBox3D({
      width: tileSize,
      height: tileSize,
      depth: tileDepth,
      radius: 0.12,
      segments: 3,
    });
    this.bombGeometry = createSphere3D({
      radius: tileSize * 0.48,
      widthSegments: 18,
      heightSegments: 10,
    });
    this.rainbowGeometry = createRoundedBox3D({
      width: tileSize * 0.94,
      height: tileSize * 0.94,
      depth: tileDepth * 1.18,
      radius: 0.21,
      segments: 5,
    });
    this.superBombGeometry = createTorus3D({
      radius: tileSize * 0.29,
      tube: tileSize * 0.135,
      radialSegments: 14,
      tubularSegments: 32,
    });

    for (const color of MATCH3_GEM_COLORS) {
      this.normalMaterials.push(new BlinnPhongMaterial({
        ambient: scaleColor(color, 0.24),
        diffuse: color,
        specular: [1, 1, 1, 1],
        shininess: 82,
      }));
      this.bombMaterials.push(new BlinnPhongMaterial({
        ambient: scaleColor(color, 0.24),
        diffuse: mixColor(color, [1, 1, 1, 1], 0.035),
        specular: [1, 1, 1, 1],
        shininess: 118,
      }));
      this.superBombMaterials.push(new BlinnPhongMaterial({
        ambient: scaleColor(color, 0.24),
        diffuse: mixColor(color, [1, 1, 1, 1], 0.035),
        specular: [1, 1, 1, 1],
        shininess: 118,
      }));
    }
  }

  createMesh(color: GemKind, special: TileSpecial = 'normal'): Mesh3D {
    return new Mesh3D(this.geometryFor(special), this.materialFor(color, special));
  }

  apply(mesh: Mesh3D, color: GemKind | null, special: TileSpecial): void {
    mesh.geometry = this.geometryFor(special);
    mesh.material = this.materialFor(color, special);
  }

  materialFor(color: GemKind | null, special: TileSpecial): BlinnPhongMaterial {
    if (special === 'rainbow') return this.rainbowMaterial;
    if (color === null) throw new Error(`${special} match-3 tiles require a color.`);
    if (special === 'bomb') return requiredItem(this.bombMaterials, color, 'bomb materials');
    if (special === 'super-bomb') {
      return requiredItem(this.superBombMaterials, color, 'super-bomb materials');
    }
    return requiredItem(this.normalMaterials, color, 'normal materials');
  }

  update(timeMs: number): void {
    const frame = Math.floor(timeMs / 40);
    if (frame === this.lastRainbowFrame) return;
    this.lastRainbowFrame = frame;
    const angle = timeMs * 0.0042;
    const color: Color = [
      0.58 + Math.sin(angle) * 0.36,
      0.58 + Math.sin(angle + Math.PI * 2 / 3) * 0.36,
      0.58 + Math.sin(angle + Math.PI * 4 / 3) * 0.36,
      1,
    ];
    this.rainbowMaterial.diffuse = color;
    this.rainbowMaterial.ambient = scaleColor(color, 0.27);
  }

  private geometryFor(special: TileSpecial): Geometry3D {
    if (special === 'bomb') return this.bombGeometry;
    if (special === 'rainbow') return this.rainbowGeometry;
    if (special === 'super-bomb') return this.superBombGeometry;
    return this.normalGeometry;
  }
}

function scaleColor(color: Color, scale: number): Color {
  return [color[0] * scale, color[1] * scale, color[2] * scale, color[3]];
}

function mixColor(first: Color, second: Color, amount: number, scale = 1): Color {
  return [
    (first[0] * (1 - amount) + second[0] * amount) * scale,
    (first[1] * (1 - amount) + second[1] * amount) * scale,
    (first[2] * (1 - amount) + second[2] * amount) * scale,
    first[3],
  ];
}

function requiredItem<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} is missing index ${index}.`);
  return value;
}
