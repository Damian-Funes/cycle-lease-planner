import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Button } from "@/components/ui/button";
import { RotateCw, RotateCcw, RefreshCw, Loader2 } from "lucide-react";

interface GlbOrientationEditorProps {
  glbUrl: string;
  rotacaoX: number;
  rotacaoZ: number;
  onChange: (rotacaoX: number, rotacaoZ: number) => void;
}

interface CameraInfo {
  radius: number;
  height: number;
  targetY: number;
}

function applyRotation(
  inner: THREE.Group,
  rx: number,
  rz: number,
  cameraInfoRef: { current: CameraInfo },
) {
  inner.rotation.x = (rx * Math.PI) / 180;
  inner.rotation.z = (rz * Math.PI) / 180;
  inner.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(inner);
  const center = new THREE.Vector3();
  box.getCenter(center);
  inner.position.x = -center.x;
  inner.position.z = -center.z;
  inner.position.y = -box.min.y;

  inner.updateMatrixWorld(true);
  const newBox = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3();
  newBox.getSize(size);

  const diagonalXZ = Math.sqrt(size.x * size.x + size.z * size.z);
  const maxDim = Math.max(diagonalXZ, size.y);

  const fov = 35;
  const fovRad = (fov * Math.PI) / 180;
  const radius = Math.max((maxDim / 2) / Math.tan(fovRad / 2) * 1.4, 8);
  const height = Math.max(radius * 0.4, size.y / 2 + 1.5);
  const targetY = Math.max(size.y / 2, 0.5);

  cameraInfoRef.current = { radius, height, targetY };
}

export function GlbOrientationEditor({
  glbUrl,
  rotacaoX,
  rotacaoZ,
  onChange,
}: GlbOrientationEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<THREE.Group | null>(null);
  const cameraInfoRef = useRef<CameraInfo>({ radius: 8, height: 5, targetY: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current || !glbUrl) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 240;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f4);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 2000);
    camera.position.set(6, 5, 7);
    camera.lookAt(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(8, 12, 6);
    dir.castShadow = true;
    scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(30, 30, 0xc0c0c0, 0xd6d3d1);
    grid.position.y = 0.01;
    scene.add(grid);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    loader.setDRACOLoader(draco);

    let cancelled = false;
    let raf = 0;
    let theta = -Math.PI / 4;

    setLoading(true);
    setError(null);

    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled) return;
        const inner = gltf.scene;
        inner.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        scene.add(inner);
        innerRef.current = inner;
        applyRotation(inner, rotacaoX, rotacaoZ, cameraInfoRef);
        setLoading(false);
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        setError((err as { message?: string })?.message || "Erro ao carregar modelo");
        setLoading(false);
      },
    );

    const animate = () => {
      raf = requestAnimationFrame(animate);
      theta += 0.003;
      const { radius, height: camH, targetY } = cameraInfoRef.current;
      camera.position.x = Math.cos(theta) * radius;
      camera.position.z = Math.sin(theta) * radius;
      camera.position.y = camH;
      camera.lookAt(0, targetY, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      try {
        mount.removeChild(renderer.domElement);
      } catch {
        /* noop */
      }
      scene.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      innerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glbUrl]);

  useEffect(() => {
    if (innerRef.current) {
      applyRotation(innerRef.current, rotacaoX, rotacaoZ, cameraInfoRef);
    }
  }, [rotacaoX, rotacaoZ]);

  const rotateX = (dir: 1 | -1) => onChange((rotacaoX + dir * 90 + 360) % 360, rotacaoZ);
  const rotateZ = (dir: 1 | -1) => onChange(rotacaoX, (rotacaoZ + dir * 90 + 360) % 360);
  const reset = () => onChange(0, 0);

  return (
    <div className="space-y-2">
      <div ref={mountRef} className="w-full h-64 rounded-md border bg-stone-100 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-stone-100/80">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando modelo...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive p-3 text-center">
            {error}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">X:</span>
          <Button type="button" size="sm" variant="outline" onClick={() => rotateX(-1)} className="gap-1.5" title="Girar X -90°">
            <RotateCcw className="w-3.5 h-3.5" /> -90°
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => rotateX(1)} className="gap-1.5" title="Girar X +90°">
            <RotateCw className="w-3.5 h-3.5" /> +90°
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Z:</span>
          <Button type="button" size="sm" variant="outline" onClick={() => rotateZ(-1)} className="gap-1.5" title="Girar Z -90°">
            <RotateCcw className="w-3.5 h-3.5" /> -90°
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => rotateZ(1)} className="gap-1.5" title="Girar Z +90°">
            <RotateCw className="w-3.5 h-3.5" /> +90°
          </Button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={reset} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Resetar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          X={rotacaoX}° Z={rotacaoZ}°
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Gire até a face desejada ficar grudada no chão. A câmera rotaciona sozinha pra você ver de todos os ângulos.
      </p>
    </div>
  );
}
