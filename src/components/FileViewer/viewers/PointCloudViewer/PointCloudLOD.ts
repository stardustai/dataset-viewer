/**
 * PointCloudLOD - 点云 LOD 系统
 *
 * 为 Three.js Points 对象提供高性能的分块 LOD 渲染
 */

import {
  Group,
  Points,
  BufferGeometry,
  PointsMaterial,
  Box3,
  Vector3,
  Camera,
  Frustum,
  Matrix4,
  Material,
  BufferAttribute,
} from 'three';

interface LODOptions {
  maxLODLevel?: number;
  targetPointsPerChunk?: number;
  renderDistance?: number;
  lodCurve?: number;
  cameraMovementThreshold?: number;
  updateInterval?: number;
  autoChunkSize?: boolean;
  minChunkSize?: number;
  maxChunkSize?: number;
}

interface LODLevel {
  mesh: Points;
  pointCount: number;
}

interface Chunk {
  lodLevels: LODLevel[];
  bounds: Box3;
  center: Vector3;
  totalPoints: number;
  currentLOD: number;
  lodStableFrames: number;
}

interface ChunkData {
  indices: number[];
  bounds: Box3;
}

export class PointCloudLOD {
  private options: Required<LODOptions>;
  public group: Group;
  private chunks: Chunk[] = [];
  private originalGeometry: BufferGeometry;
  private originalMaterial: PointsMaterial;
  private stats = {
    pointCount: 0,
    visibleChunks: 0,
    totalChunks: 0,
    totalPoints: 0,
    lodDistribution: [0, 0, 0, 0, 0, 0, 0],
  };
  private lastCameraPosition = new Vector3();
  private lodUpdateDelay = 0;
  private lodEnabled = true;

  constructor(pointCloud: Points, options: LODOptions = {}) {
    this.options = {
      maxLODLevel: options.maxLODLevel ?? 4,
      targetPointsPerChunk: options.targetPointsPerChunk ?? 30000,
      renderDistance: options.renderDistance ?? 1000,
      lodCurve: options.lodCurve ?? 0.4,
      cameraMovementThreshold: options.cameraMovementThreshold ?? 1.0,
      updateInterval: options.updateInterval ?? 2,
      autoChunkSize: options.autoChunkSize ?? true,
      minChunkSize: options.minChunkSize ?? 5,
      maxChunkSize: options.maxChunkSize ?? 50,
    };

    this.validateOptions();

    this.group = new Group();
    this.originalGeometry = pointCloud.geometry;
    this.originalMaterial = pointCloud.material as PointsMaterial;

    this.buildChunkedLOD();
  }

  setLODEnabled(enabled: boolean): void {
    this.lodEnabled = enabled;

    if (!enabled) {
      for (const chunk of this.chunks) {
        for (let i = 0; i < chunk.lodLevels.length; i++) {
          chunk.lodLevels[i].mesh.visible = i === 0;
        }
        chunk.currentLOD = 0;
      }
    }
  }

  private validateOptions(): void {
    const { maxLODLevel, lodCurve, targetPointsPerChunk } = this.options;

    if (maxLODLevel < 0 || maxLODLevel > 6) {
      console.warn('PointCloudLOD: maxLODLevel should be between 0-6, clamping to valid range');
      this.options.maxLODLevel = Math.max(0, Math.min(6, maxLODLevel));
    }

    if (lodCurve < 0.1 || lodCurve > 1.0) {
      console.warn('PointCloudLOD: lodCurve should be between 0.1-1.0, using default 0.4');
      this.options.lodCurve = 0.4;
    }

    if (targetPointsPerChunk < 1000) {
      console.warn('PointCloudLOD: targetPointsPerChunk too small, using minimum 1000');
      this.options.targetPointsPerChunk = 1000;
    }
  }

  private buildChunkedLOD(): void {
    const positions = this.originalGeometry.attributes.position.array as Float32Array;
    const colors = this.originalGeometry.attributes.color?.array as Float32Array;
    const pointCount = positions.length / 3;

    this.stats.totalPoints = pointCount;

    if (!this.originalGeometry.boundingBox) {
      this.originalGeometry.computeBoundingBox();
    }
    const bbox = this.originalGeometry.boundingBox!;
    const size = bbox.getSize(new Vector3());

    const chunkSize = this.calculateChunkSize(pointCount, size);
    const chunkMap = this.createChunkMap(positions, bbox, chunkSize);
    this.createChunkLODs(positions, colors, chunkMap);

    this.stats.totalChunks = this.chunks.length;
  }

  private calculateChunkSize(pointCount: number, size: Vector3): number {
    if (!this.options.autoChunkSize) {
      return this.options.minChunkSize;
    }

    const volume = size.x * size.y * size.z;
    const density = pointCount / volume;
    const targetChunkVolume = this.options.targetPointsPerChunk / density;
    const autoChunkSize = Math.pow(targetChunkVolume, 1 / 3);

    return Math.max(this.options.minChunkSize, Math.min(this.options.maxChunkSize, autoChunkSize));
  }

  private createChunkMap(
    positions: Float32Array,
    bbox: Box3,
    chunkSize: number
  ): Map<string, ChunkData> {
    const chunkMap = new Map<string, ChunkData>();
    const pointCount = positions.length / 3;

    for (let i = 0; i < pointCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;

      const cx = Math.floor((x - bbox.min.x) / chunkSize);
      const cy = Math.floor((y - bbox.min.y) / chunkSize);
      const cz = Math.floor((z - bbox.min.z) / chunkSize);
      const chunkKey = `${cx},${cy},${cz}`;

      if (!chunkMap.has(chunkKey)) {
        chunkMap.set(chunkKey, {
          indices: [],
          bounds: new Box3(
            new Vector3(
              bbox.min.x + cx * chunkSize,
              bbox.min.y + cy * chunkSize,
              bbox.min.z + cz * chunkSize
            ),
            new Vector3(
              bbox.min.x + (cx + 1) * chunkSize,
              bbox.min.y + (cy + 1) * chunkSize,
              bbox.min.z + (cz + 1) * chunkSize
            )
          ),
        });
      }

      chunkMap.get(chunkKey)!.indices.push(i);
    }

    return chunkMap;
  }

  private createChunkLODs(
    positions: Float32Array,
    colors: Float32Array | undefined,
    chunkMap: Map<string, ChunkData>
  ): void {
    for (const chunkData of chunkMap.values()) {
      if (chunkData.indices.length < 5) continue;

      const chunk = this.createChunk(positions, colors, chunkData);
      this.chunks.push(chunk);
    }
  }

  private createChunk(
    positions: Float32Array,
    colors: Float32Array | undefined,
    chunkData: ChunkData
  ): Chunk {
    const indices = chunkData.indices;
    const lodLevels: LODLevel[] = [];

    for (let lod = 0; lod <= this.options.maxLODLevel; lod++) {
      const samplingRate = Math.pow(0.5, lod);
      const targetPoints = Math.max(10, Math.floor(indices.length * samplingRate));
      const sampledIndices = this.sampleIndices(indices, targetPoints);

      const geometry = new BufferGeometry();
      const lodPositions = new Float32Array(sampledIndices.length * 3);
      const lodColors = colors ? new Float32Array(sampledIndices.length * 3) : null;

      for (let i = 0; i < sampledIndices.length; i++) {
        const idx = sampledIndices[i];
        lodPositions[i * 3] = positions[idx * 3];
        lodPositions[i * 3 + 1] = positions[idx * 3 + 1];
        lodPositions[i * 3 + 2] = positions[idx * 3 + 2];

        if (colors && lodColors) {
          lodColors[i * 3] = colors[idx * 3];
          lodColors[i * 3 + 1] = colors[idx * 3 + 1];
          lodColors[i * 3 + 2] = colors[idx * 3 + 2];
        }
      }

      geometry.setAttribute('position', new BufferAttribute(lodPositions, 3));
      if (lodColors) {
        geometry.setAttribute('color', new BufferAttribute(lodColors, 3));
      }

      // 保存原始颜色（如果存在）
      const originalColorAttr = this.originalGeometry.getAttribute('originalColor');
      if (originalColorAttr) {
        const lodOriginalColors = new Float32Array(sampledIndices.length * 3);
        for (let i = 0; i < sampledIndices.length; i++) {
          const idx = sampledIndices[i];
          lodOriginalColors[i * 3] = (originalColorAttr.array as Float32Array)[idx * 3];
          lodOriginalColors[i * 3 + 1] = (originalColorAttr.array as Float32Array)[idx * 3 + 1];
          lodOriginalColors[i * 3 + 2] = (originalColorAttr.array as Float32Array)[idx * 3 + 2];
        }
        geometry.setAttribute('originalColor', new BufferAttribute(lodOriginalColors, 3));
      }

      // 保存反射率（如果存在）
      const intensityAttr = this.originalGeometry.getAttribute('intensity');
      if (intensityAttr) {
        const lodIntensity = new Float32Array(sampledIndices.length);
        for (let i = 0; i < sampledIndices.length; i++) {
          const idx = sampledIndices[i];
          lodIntensity[i] = (intensityAttr.array as Float32Array)[idx];
        }
        geometry.setAttribute('intensity', new BufferAttribute(lodIntensity, 1));
      }

      const material = this.originalMaterial.clone();
      material.size = this.originalMaterial.size * Math.max(0.5, 1.0 - lod * 0.15);

      const mesh = new Points(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = true;

      this.group.add(mesh);

      lodLevels.push({
        mesh,
        pointCount: sampledIndices.length,
      });
    }

    return {
      lodLevels,
      bounds: chunkData.bounds,
      center: chunkData.bounds.getCenter(new Vector3()),
      totalPoints: indices.length,
      currentLOD: -1,
      lodStableFrames: 0,
    };
  }

  private sampleIndices(indices: number[], targetCount: number): number[] {
    if (targetCount >= indices.length) {
      return indices;
    }

    const sampled: number[] = [];
    const step = indices.length / targetCount;

    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step);
      sampled.push(indices[index]);
    }

    return sampled;
  }

  update(camera: Camera): void {
    this.stats.pointCount = 0;
    this.stats.visibleChunks = 0;
    this.stats.lodDistribution = [0, 0, 0, 0, 0, 0, 0];

    const cameraPos = camera.position;

    const cameraMoved =
      cameraPos.distanceTo(this.lastCameraPosition) > this.options.cameraMovementThreshold;
    this.lodUpdateDelay++;
    const shouldUpdateLOD = cameraMoved || this.lodUpdateDelay >= this.options.updateInterval;

    if (shouldUpdateLOD) {
      this.lodUpdateDelay = 0;
      this.lastCameraPosition.copy(cameraPos);
    }

    const frustum = new Frustum();
    const matrix = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(matrix);

    for (const chunk of this.chunks) {
      if (!frustum.intersectsBox(chunk.bounds)) {
        this.hideChunk(chunk);
        continue;
      }

      const distance = cameraPos.distanceTo(chunk.center);

      if (distance > this.options.renderDistance) {
        this.hideChunk(chunk);
        continue;
      }

      if (this.lodEnabled) {
        if (shouldUpdateLOD) {
          const lodLevel = this.selectLOD(distance);
          this.updateChunkLOD(chunk, lodLevel);
        } else if (chunk.currentLOD >= 0 && chunk.currentLOD < chunk.lodLevels.length) {
          chunk.lodLevels[chunk.currentLOD].mesh.visible = true;
        }
      } else {
        if (chunk.currentLOD !== 0) {
          this.updateChunkLOD(chunk, 0);
        } else {
          chunk.lodLevels[0].mesh.visible = true;
        }
      }

      if (chunk.currentLOD >= 0 && chunk.currentLOD < chunk.lodLevels.length) {
        this.stats.visibleChunks++;
        this.stats.pointCount += chunk.lodLevels[chunk.currentLOD].pointCount;
        this.stats.lodDistribution[chunk.currentLOD]++;
      }
    }
  }

  private selectLOD(distance: number): number {
    const normalizedDistance = Math.min(1.0, distance / this.options.renderDistance);
    const lodFactor = Math.pow(normalizedDistance, this.options.lodCurve);
    const lodLevel = Math.floor(lodFactor * this.options.maxLODLevel);
    return Math.max(0, Math.min(this.options.maxLODLevel, lodLevel));
  }

  private updateChunkLOD(chunk: Chunk, lodLevel: number): void {
    if (chunk.currentLOD === lodLevel) return;

    const lodDiff = Math.abs(lodLevel - chunk.currentLOD);
    if (lodDiff === 1 && chunk.lodStableFrames < 3) {
      chunk.lodStableFrames++;
      return;
    }

    chunk.lodStableFrames = 0;

    if (chunk.currentLOD >= 0 && chunk.currentLOD < chunk.lodLevels.length) {
      chunk.lodLevels[chunk.currentLOD].mesh.visible = false;
    }

    if (lodLevel >= 0 && lodLevel < chunk.lodLevels.length) {
      chunk.lodLevels[lodLevel].mesh.visible = true;
      chunk.currentLOD = lodLevel;
    }
  }

  private hideChunk(chunk: Chunk): void {
    if (chunk.currentLOD >= 0 && chunk.currentLOD < chunk.lodLevels.length) {
      chunk.lodLevels[chunk.currentLOD].mesh.visible = false;
      chunk.currentLOD = -1;
    }
  }

  setPointSize(size: number): void {
    for (const chunk of this.chunks) {
      for (let lod = 0; lod < chunk.lodLevels.length; lod++) {
        const adjustedSize = size * Math.max(0.5, 1.0 - lod * 0.15);
        (chunk.lodLevels[lod].mesh.material as PointsMaterial).size = adjustedSize;
      }
    }
  }

  setRenderDistance(distance: number): void {
    this.options.renderDistance = distance;
  }

  setMaxLODLevel(level: number): void {
    this.options.maxLODLevel = Math.max(0, Math.min(6, level));
  }

  getStats() {
    return {
      pointCount: this.stats.pointCount,
      visibleChunks: this.stats.visibleChunks,
      totalChunks: this.stats.totalChunks,
      totalPoints: this.stats.totalPoints,
      lodDistribution: this.stats.lodDistribution,
    };
  }

  dispose(): void {
    for (const chunk of this.chunks) {
      for (const lodLevel of chunk.lodLevels) {
        if (lodLevel.mesh.geometry) {
          lodLevel.mesh.geometry.dispose();
        }
        if (lodLevel.mesh.material) {
          (lodLevel.mesh.material as Material).dispose();
        }
      }
    }
    this.chunks = [];
    this.group.clear();
  }
}
