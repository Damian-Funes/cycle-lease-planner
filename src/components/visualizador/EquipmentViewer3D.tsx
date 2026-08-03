import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Loader2 } from "lucide-react";

export type ViewerPreset = "top" | "front" | "side" | "iso";

export interface EquipmentViewer3DApi {
  setAutoRotate: (on: boolean) => void;
  goToPreset: (preset: ViewerPreset) => void;
  reset: () => void;
}

interface Props {
  modeloUrl: string;
  rotacaoX?: number; // radianos
  rotacaoY?: number;
  rotacaoZ?: number;
  onAutoRotateChange?: (on: boolean) => void;
}

const EquipmentViewer3D = forwardRef<EquipmentViewer3DApi, Props>(function EquipmentViewer3D(
  { modeloUrl, rotacaoX = 0, rotacaoY = 0, rotacaoZ = 0, onAutoRotateChange },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    raf?: number;
    diagonal?: number;
    center?: THREE.Vector3;
    defaultPos?: THREE.Vector3;
  }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d1a);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(5, 4, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // 3-point lighting
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xb8d4e8, 0.4);
    fill.position.set(-5, 5, -3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe8c4, 0.6);
    rim.position.set(0, 3, -8);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xa8c0d0, 0x3a3520, 0.3);
    scene.add(hemi);

    // subtle ground shadow plane
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(20, 64),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.enablePan = false;

    ctxRef.current = { renderer, scene, camera, controls };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      ctxRef.current.raf = requestAnimationFrame(animate);
    };
    ctxRef.current.raf = requestAnimationFrame(animate);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    // Load model
    setLoading(true);
    setError(null);
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    loader.setDRACOLoader(draco);

    let modelGroup: THREE.Group | null = null;

    loader.load(
      modeloUrl,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.x = rotacaoX || 0;
        model.rotation.y = rotacaoY || 0;
        model.rotation.z = rotacaoZ || 0;
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            (o as THREE.Mesh).castShadow = true;
            (o as THREE.Mesh).receiveShadow = true;
          }
        });

        const wrapper = new THREE.Group();
        wrapper.add(model);
        scene.add(wrapper);
        modelGroup = wrapper;

        // Auto-fit
        const box = new THREE.Box3().setFromObject(wrapper);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // Drop wrapper so the model sits on ground (y=0)
        wrapper.position.y -= box.min.y;
        // Recompute box after y adjust
        const box2 = new THREE.Box3().setFromObject(wrapper);
        box2.getCenter(center);
        box2.getSize(size);

        const diagonal = size.length();
        const fov = (camera.fov * Math.PI) / 180;
        const dist = (diagonal / 2 / Math.tan(fov / 2)) * 1.2;

        controls.target.copy(center);
        controls.minDistance = diagonal * 0.4;
        controls.maxDistance = diagonal * 4;

        const startPos = new THREE.Vector3(
          center.x + dist * 0.7,
          center.y + dist * 0.5,
          center.z + dist * 0.7,
        );
        camera.position.copy(startPos);
        camera.lookAt(center);
        controls.update();

        ctxRef.current.diagonal = diagonal;
        ctxRef.current.center = center.clone();
        ctxRef.current.defaultPos = startPos.clone();
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("Erro ao carregar GLB", err);
        setError("Falha ao carregar modelo 3D");
        setLoading(false);
      },
    );

    return () => {
      if (ctxRef.current.raf) cancelAnimationFrame(ctxRef.current.raf);
      ro.disconnect();
      controls.dispose();
      pmrem.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modeloUrl, rotacaoX, rotacaoY, rotacaoZ]);

  useImperativeHandle(ref, () => ({
    setAutoRotate(on) {
      const c = ctxRef.current.controls;
      if (c) {
        c.autoRotate = on;
        onAutoRotateChange?.(on);
      }
    },
    goToPreset(preset) {
      const { camera, controls, diagonal, center } = ctxRef.current;
      if (!camera || !controls || !diagonal || !center) return;
      const d = diagonal * 1.2;
      let pos: THREE.Vector3;
      switch (preset) {
        case "top":
          pos = new THREE.Vector3(center.x, center.y + d * 1.2, center.z + 0.001);
          break;
        case "front":
          pos = new THREE.Vector3(center.x, center.y, center.z + d);
          break;
        case "side":
          pos = new THREE.Vector3(center.x + d, center.y, center.z);
          break;
        case "iso":
        default:
          pos = new THREE.Vector3(center.x + d * 0.7, center.y + d * 0.5, center.z + d * 0.7);
      }
      animateCamera(camera, controls, pos, center);
      controls.autoRotate = false;
      onAutoRotateChange?.(false);
    },
    reset() {
      const { camera, controls, defaultPos, center } = ctxRef.current;
      if (!camera || !controls || !defaultPos || !center) return;
      animateCamera(camera, controls, defaultPos, center);
    },
  }));

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0" />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400">
          {error}
        </div>
      )}
    </div>
  );
});

function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  to: THREE.Vector3,
  target: THREE.Vector3,
) {
  const from = camera.position.clone();
  const fromTarget = controls.target.clone();
  const duration = 600;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(from, to, e);
    controls.target.lerpVectors(fromTarget, target, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default EquipmentViewer3D;
