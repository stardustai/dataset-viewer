import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  PointsMaterial,
  Points,
  BufferAttribute,
  SRGBColorSpace,
  Vector3,
  BufferGeometry,
  Material,
} from 'three';
import { OrbitControls, PLYLoader, XYZLoader } from 'three-stdlib';
import type { PointCloudStats, ColorMode, LoadingProgress } from './types';
import { parsePtsFile, calculateStats } from './utils';
import { PointCloudLOD } from './PointCloudLOD';
import { StreamingPCDLoader } from './StreamingLoader';

export class PointCloudRenderer {
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private controls: OrbitControls;
  private points: Points | null = null;
  private lod: InstanceType<typeof PointCloudLOD> | null = null;
  private animationId: number | null = null;
  private container: HTMLElement;
  private streamingChunks: Points[] = [];
  private originalColors: number[] | null = null;
  private intensityValues: number[] | null = null;
  public onProgress?: (progress: LoadingProgress) => void;

  constructor(container: HTMLElement) {
    this.container = container;

    // 初始化场景
    this.scene = new Scene();
    this.scene.background = new Color(0x1a1a1a);

    // 初始化相机
    this.camera = new PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    this.camera.up.set(0, 0, 1); // Z轴向上

    // 初始化渲染器
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 使用 sRGB 输出编码以正确显示颜色
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // 初始化控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;

    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize);

    // 开始动画循环
    this.animate();
  }

  async loadPointCloud(arrayBuffer: ArrayBuffer, fileExtension: string): Promise<PointCloudStats> {
    // 对于 PCD 文件使用流式加载
    if (fileExtension === 'pcd') {
      return this.loadPCDStreaming(arrayBuffer);
    }

    // 其他格式使用标准加载，开始解析阶段
    this.onProgress?.({
      percentage: 0,
      pointsProcessed: 0,
      stage: 'parsing',
    });

    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    try {
      let geometry: BufferGeometry;

      switch (fileExtension) {
        case 'ply':
          this.onProgress?.({
            percentage: 10,
            pointsProcessed: 0,
            stage: 'parsing',
          });
          const plyLoader = new PLYLoader();
          geometry = await new Promise<BufferGeometry>((resolve, reject) => {
            plyLoader.load(url, resolve, undefined, reject);
          });
          break;

        case 'xyz':
          this.onProgress?.({
            percentage: 10,
            pointsProcessed: 0,
            stage: 'parsing',
          });
          const xyzLoader = new XYZLoader();
          geometry = await new Promise<BufferGeometry>((resolve, reject) => {
            xyzLoader.load(url, resolve, undefined, reject);
          });
          break;

        case 'pts':
          this.onProgress?.({
            percentage: 10,
            pointsProcessed: 0,
            stage: 'parsing',
          });
          const text = new TextDecoder().decode(arrayBuffer);
          geometry = parsePtsFile(text);
          break;

        default:
          throw new Error(`Unsupported format: ${fileExtension}`);
      }

      this.onProgress?.({
        percentage: 60,
        pointsProcessed: 0,
        stage: 'parsing',
      });

      // 计算统计信息
      const stats = calculateStats(geometry);

      // 始终按高度着色
      this.applyHeightColors(geometry, stats);

      this.onProgress?.({
        percentage: 80,
        pointsProcessed: 0,
        stage: 'parsing',
      });

      // 创建材质和点云对象
      const material = new PointsMaterial({
        size: 0.1,
        vertexColors: true,
        sizeAttenuation: true,
      });

      this.points = new Points(geometry, material);

      // 开始LOD优化阶段
      this.onProgress?.({
        percentage: 0,
        pointsProcessed: 0,
        stage: 'optimizing',
        isIndeterminate: true,
      });

      // 应用 LOD 优化
      this.lod = new PointCloudLOD(this.points, {
        maxLODLevel: 4,
        targetPointsPerChunk: 30000,
        renderDistance: stats.scale * 5,
        lodCurve: 0.4,
      });

      this.scene.add(this.lod.group);

      // 调整相机位置
      this.adjustCamera(stats);

      this.onProgress?.({
        percentage: 100,
        pointsProcessed: 0,
        stage: 'optimizing',
      });

      return stats;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private applyHeightColors(geometry: BufferGeometry, stats: PointCloudStats): void {
    const positions = geometry.getAttribute('position') as BufferAttribute;
    const colors = new Float32Array(positions.count * 3);

    const minZ = stats.bounds.min.z;
    const maxZ = stats.bounds.max.z;
    const zRange = maxZ - minZ;

    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i);
      const t = zRange > 0 ? (z - minZ) / zRange : 0.5;

      // 蓝色 -> 绿色 -> 红色渐变
      if (t < 0.5) {
        const s = t * 2;
        colors[i * 3] = s * 0.2;
        colors[i * 3 + 1] = 0.4 + s * 0.6;
        colors[i * 3 + 2] = 1.0 - s * 0.8;
      } else {
        const s = (t - 0.5) * 2;
        colors[i * 3] = 0.2 + s * 0.8;
        colors[i * 3 + 1] = 1.0 - s * 0.4;
        colors[i * 3 + 2] = 0.2 - s * 0.2;
      }
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  private adjustCamera(stats: PointCloudStats): void {
    const distance = stats.scale * 0.2;
    this.camera.position.set(
      stats.center.x + distance,
      stats.center.y + distance,
      stats.center.z + distance
    );
    this.camera.lookAt(stats.center.x, stats.center.y, stats.center.z);
    this.controls.target.set(stats.center.x, stats.center.y, stats.center.z);
    this.controls.update();
  }

  setPointSize(size: number): void {
    if (this.lod) {
      this.lod.setPointSize(size);
    }
  }

  setColorMode(mode: ColorMode): void {
    if (!this.lod) return;

    // 遍历所有 LOD 块，更新颜色
    const chunks = (this.lod as any).chunks;
    if (!chunks) return;

    for (const chunk of chunks) {
      for (const lodLevel of chunk.lodLevels) {
        const geometry = lodLevel.mesh.geometry;
        const positions = geometry.getAttribute('position') as BufferAttribute;
        const originalColors = geometry.getAttribute('originalColor') as BufferAttribute;
        const intensityAttr = geometry.getAttribute('intensity') as BufferAttribute;

        if (mode === 'rgb' && originalColors) {
          // 使用原始 RGB 颜色
          const rgbColors = new Float32Array(originalColors.array);
          geometry.setAttribute('color', new BufferAttribute(rgbColors, 3));
        } else if (mode === 'intensity' && intensityAttr) {
          // 使用反射率着色（灰度渐变）
          const colors = new Float32Array(positions.count * 3);

          for (let i = 0; i < positions.count; i++) {
            const intensity = intensityAttr.getX(i);
            // 灰度渐变：黑色 -> 白色
            colors[i * 3] = intensity;
            colors[i * 3 + 1] = intensity;
            colors[i * 3 + 2] = intensity;
          }

          geometry.setAttribute('color', new BufferAttribute(colors, 3));
        } else {
          // 使用高度着色
          const colors = new Float32Array(positions.count * 3);

          let minZ = Infinity;
          let maxZ = -Infinity;
          for (let i = 0; i < positions.count; i++) {
            const z = positions.getZ(i);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
          }

          const zRange = maxZ - minZ;

          for (let i = 0; i < positions.count; i++) {
            const z = positions.getZ(i);
            const t = zRange > 0 ? (z - minZ) / zRange : 0.5;

            if (t < 0.5) {
              const s = t * 2;
              colors[i * 3] = s * 0.2;
              colors[i * 3 + 1] = 0.4 + s * 0.6;
              colors[i * 3 + 2] = 1.0 - s * 0.8;
            } else {
              const s = (t - 0.5) * 2;
              colors[i * 3] = 0.2 + s * 0.8;
              colors[i * 3 + 1] = 1.0 - s * 0.4;
              colors[i * 3 + 2] = 0.2 - s * 0.2;
            }
          }

          geometry.setAttribute('color', new BufferAttribute(colors, 3));
        }

        geometry.attributes.color.needsUpdate = true;
      }
    }
  }

  private handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();

    // 更新 LOD 系统
    if (this.lod) {
      this.lod.update(this.camera);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private async loadPCDStreaming(arrayBuffer: ArrayBuffer): Promise<PointCloudStats> {
    const allPositions: number[] = [];
    const allColors: number[] = [];
    let firstChunk = true;
    let tempStats: PointCloudStats | null = null;

    const loader = new StreamingPCDLoader({
      onProgress: progress => {
        this.onProgress?.({
          percentage: progress.percentage,
          pointsProcessed: progress.pointsProcessed,
          stage: progress.stage,
        });
      },
      onChunkReady: chunk => {
        // 累积所有点
        allPositions.push(...Array.from(chunk.positions));
        allColors.push(...Array.from(chunk.colors));

        // 保存原始颜色
        if (chunk.originalColors) {
          if (!this.originalColors) {
            this.originalColors = [];
          }
          this.originalColors.push(...Array.from(chunk.originalColors));
        }

        // 保存反射率
        if (chunk.intensityValues) {
          if (!this.intensityValues) {
            this.intensityValues = [];
          }
          this.intensityValues.push(...Array.from(chunk.intensityValues));
        }

        // 创建临时几何体用于即时渲染
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(chunk.positions, 3));
        geometry.setAttribute('color', new BufferAttribute(chunk.colors, 3));

        const material = new PointsMaterial({
          size: 0.1,
          vertexColors: true,
          sizeAttenuation: true,
        });

        const chunkMesh = new Points(geometry, material);
        this.scene.add(chunkMesh);
        this.streamingChunks.push(chunkMesh);

        // 第一个块时调整相机
        if (firstChunk) {
          firstChunk = false;
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const center = bbox.getCenter(new Vector3());
          const size = bbox.getSize(new Vector3());
          const scale = Math.max(size.x, size.y, size.z);

          tempStats = {
            pointCount: chunk.pointCount,
            hasColor: true,
            hasIntensity: false,
            bounds: {
              min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
              max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z },
            },
            center: { x: center.x, y: center.y, z: center.z },
            scale,
          };

          this.adjustCamera(tempStats);
        }
      },
    });

    await loader.loadStreaming(arrayBuffer);

    // 清理临时块
    for (const chunk of this.streamingChunks) {
      this.scene.remove(chunk);
      chunk.geometry.dispose();
      (chunk.material as Material).dispose();
    }
    this.streamingChunks = [];

    // 创建最终的几何体
    const finalGeometry = new BufferGeometry();
    finalGeometry.setAttribute('position', new BufferAttribute(new Float32Array(allPositions), 3));
    finalGeometry.setAttribute('color', new BufferAttribute(new Float32Array(allColors), 3));

    // 保存原始颜色（如果有）
    if (this.originalColors && this.originalColors.length > 0) {
      finalGeometry.setAttribute(
        'originalColor',
        new BufferAttribute(new Float32Array(this.originalColors), 3)
      );
    }

    // 保存反射率（如果有）
    if (this.intensityValues && this.intensityValues.length > 0) {
      finalGeometry.setAttribute(
        'intensity',
        new BufferAttribute(new Float32Array(this.intensityValues), 1)
      );
    }

    // 计算最终统计信息
    const stats = calculateStats(finalGeometry);

    // 更新 hasColor 和 hasIntensity 标志
    stats.hasColor = !!(this.originalColors && this.originalColors.length > 0);
    stats.hasIntensity = !!(this.intensityValues && this.intensityValues.length > 0);

    // 创建材质和点云对象
    const material = new PointsMaterial({
      size: 0.1,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.points = new Points(finalGeometry, material);

    // 开始LOD优化阶段
    this.onProgress?.({
      percentage: 0,
      pointsProcessed: 0,
      stage: 'optimizing',
      isIndeterminate: true,
    });

    // 应用 LOD 优化
    this.lod = new PointCloudLOD(this.points, {
      maxLODLevel: 4,
      targetPointsPerChunk: 30000,
      renderDistance: stats.scale * 5,
      lodCurve: 0.4,
    });

    this.scene.add(this.lod.group);

    return stats;
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    window.removeEventListener('resize', this.handleResize);

    // 清理流式加载的临时块
    for (const chunk of this.streamingChunks) {
      this.scene.remove(chunk);
      chunk.geometry.dispose();
      (chunk.material as Material).dispose();
    }
    this.streamingChunks = [];

    // 清理 LOD 系统
    if (this.lod) {
      this.lod.dispose();
      this.lod = null;
    }

    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as Material).dispose();
    }

    this.renderer.dispose();
    this.controls.dispose();

    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
