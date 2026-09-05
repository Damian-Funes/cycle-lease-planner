import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { descartarObjeto3D, descartarSombraDaLuz } from "@/lib/three/dispose";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCw, RotateCcw, RefreshCw, Loader2, Wand2 } from "lucide-react";

interface GlbOrientationEditorProps {
  glbUrl: string;
  rotacaoX: number;
  rotacaoY?: number;
  rotacaoZ: number;
  onChange: (rotacaoX: number, rotacaoY: number, rotacaoZ: number) => void;
}

interface CameraInfo {
  radius: number;
  height: number;
  targetY: number;
}

function applyRotation(
  inner: THREE.Group,
  rx: number,
  ry: number,
  rz: number,
  cameraInfoRef: { current: CameraInfo },
) {
  inner.rotation.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
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

const norm = (v: number) => ((Math.round(v) % 360) + 360) % 360;

/**
 * Descobre a rotação embutida no arquivo GLB (nó raiz exportado torto)
 * e devolve a correção inversa em graus.
 */
function autoAlignFromModel(inner: THREE.Object3D): [number, number, number] | null {
  // `inner` (gltf.scene) já recebe a rotação de correção que o usuário aplica,
  // então só os nós filhos carregam a rotação embutida no arquivo.
  const candidates: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D, depth: number) => {
    if (depth > 2) return;
    candidates.push(o);
    o.children.forEach((c) => walk(c, depth + 1));
  };
  inner.children.forEach((c) => walk(c, 0));
  const found = candidates.find((o) => {
    const q = o.quaternion;
    return Math.abs(q.w) < 0.99999;
  });
  if (!found) return null;
  const inv = found.quaternion.clone().invert();
  const e = new THREE.Euler().setFromQuaternion(inv, "XYZ");
  return [
    norm((e.x * 180) / Math.PI),
    norm((e.y * 180) / Math.PI),
    norm((e.z * 180) / Math.PI),
  ];
}

export function GlbOrientationEditor({
  glbUrl,
  rotacaoX,
  rotacaoY = 0,
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a89e, 0.85);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
    keyLight.position.set(10, 18, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.55);
    fillLight.position.set(-8, 10, -6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
    rimLight.position.set(0, 8, -12);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

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
        if (cancelled) {
          // Carga descartada: libera os recursos do GLB abandonado.
          descartarObjeto3D(gltf.scene);
          return;
        }
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
        applyRotation(inner, rotacaoX, rotacaoY, rotacaoZ, cameraInfoRef);
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
      draco.dispose();
      [keyLight, fillLight, rimLight].forEach((l) => descartarSombraDaLuz(l));
      descartarObjeto3D(scene);
      descartarObjeto3D(roomEnv);
      scene.environment = null;
      envRT.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      innerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glbUrl]);

  useEffect(() => {
    if (innerRef.current) {
      applyRotation(innerRef.current, rotacaoX, rotacaoY, rotacaoZ, cameraInfoRef);
    }
  }, [rotacaoX, rotacaoY, rotacaoZ]);

  const bump = (axis: "x" | "y" | "z", delta: number) => {
    const nx = axis === "x" ? norm(rotacaoX + delta) : rotacaoX;
    const ny = axis === "y" ? norm(rotacaoY + delta) : rotacaoY;
    const nz = axis === "z" ? norm(rotacaoZ + delta) : rotacaoZ;
    onChange(nx, ny, nz);
  };

  const setAxis = (axis: "x" | "y" | "z", value: number) => {
    const v = Number.isFinite(value) ? norm(value) : 0;
    onChange(
      axis === "x" ? v : rotacaoX,
      axis === "y" ? v : rotacaoY,
      axis === "z" ? v : rotacaoZ,
    );
  };

  const reset = () => onChange(0, 0, 0);

  const autoAlign = () => {
    const inner = innerRef.current;
    if (!inner) return;
    // reseta antes de medir, para ler a rotação embutida no arquivo
    const result = autoAlignFromModel(inner);
    if (!result) {
      setError(null);
      return;
    }
    onChange(result[0], result[1], result[2]);
  };

  const axes: { key: "x" | "y" | "z"; label: string; value: number }[] = [
    { key: "x", label: "X", value: rotacaoX },
    { key: "y", label: "Y", value: rotacaoY },
    { key: "z", label: "Z", value: rotacaoZ },
  ];

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
        <Button type="button" size="sm" variant="secondary" onClick={autoAlign} className="gap-1.5">
          <Wand2 className="w-3.5 h-3.5" /> Alinhar automaticamente
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Resetar
        </Button>
      </div>

      <div className="space-y-1.5">
        {axes.map((a) => (
          <div key={a.key} className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-medium text-muted-foreground w-4">{a.label}:</span>
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, -90)} title={`Girar ${a.label} -90°`} className="gap-1 px-2">
              <RotateCcw className="w-3.5 h-3.5" /> 90
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, -5)} className="px-2">
              -5
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, -1)} className="px-2">
              -1
            </Button>
            <Input
              type="number"
              value={a.value}
              onChange={(e) => setAxis(a.key, Number(e.target.value))}
              className="h-8 w-20 text-center font-mono"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, 1)} className="px-2">
              +1
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, 5)} className="px-2">
              +5
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => bump(a.key, 90)} title={`Girar ${a.label} +90°`} className="gap-1 px-2">
              <RotateCw className="w-3.5 h-3.5" /> 90
            </Button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Use "Alinhar automaticamente" quando o modelo vier torto do CAD (rotação embutida no
        arquivo). Depois ajuste de 1° em 1° até a face desejada ficar grudada no chão. A câmera
        rotaciona sozinha pra você ver de todos os ângulos.
      </p>
    </div>
  );
}
