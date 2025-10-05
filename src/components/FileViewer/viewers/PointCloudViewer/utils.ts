import { BufferGeometry, BufferAttribute } from 'three';
import type { PointCloudStats } from './types';

export function parsePtsFile(text: string): BufferGeometry {
  const lines = text.split('\n');
  const positions: number[] = [];
  const colors: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;

    const x = +parts[0];
    const y = +parts[1];
    const z = +parts[2];

    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;

    positions.push(x, y, z);

    // 处理颜色
    if (parts.length >= 6) {
      let r = +parts[3];
      let g = +parts[4];
      let b = +parts[5];

      if (r > 1 || g > 1 || b > 1) {
        r /= 255;
        g /= 255;
        b /= 255;
      }

      colors.push(
        Math.max(0, Math.min(1, r)),
        Math.max(0, Math.min(1, g)),
        Math.max(0, Math.min(1, b))
      );
    } else {
      colors.push(0.5, 0.5, 0.5);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));

  return geometry;
}

export function calculateStats(geometry: BufferGeometry): PointCloudStats {
  const positionAttr = geometry.getAttribute('position') as BufferAttribute;
  const colorAttr = geometry.getAttribute('color');
  const intensityAttr = geometry.getAttribute('intensity');

  if (!positionAttr) {
    throw new Error('No position attribute found');
  }

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;

  const center = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  };

  const scale = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);

  return {
    pointCount: positionAttr.count,
    hasColor: !!colorAttr,
    hasIntensity: !!intensityAttr,
    bounds: {
      min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
      max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
    },
    center,
    scale,
  };
}
