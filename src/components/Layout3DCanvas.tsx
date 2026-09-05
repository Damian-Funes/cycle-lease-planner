import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Loader2, Box, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Maximize2 } from "lucide-react";
import type { LayoutItemRow, ConexaoRow } from "@/lib/layouts";
import {
  tornarTransparente,
  restaurarOpacidade,
  descartarMaterialClonado,
} from "@/lib/three/selectionTransparency";
import { descartarObjeto3D, removerEDescartar } from "@/lib/three/dispose";

export interface Layout3DCanvasProps {
  items: LayoutItemRow[];
  pisoLarguraMm: number;
  pisoComprimentoMm: number;
  selectedId: string | null;
  selectedIds?: string[];
  onSelect: (id: string | null, shift?: boolean) => void;
  onTransform: (id: string, posXmm: number, posYmm: number, posZmm: number, rotacaoDeg: number) => void;
  mode: "translate" | "rotate" | "connect";
  alturaLiberada?: boolean;
  conexoes?: ConexaoRow[];
  modoConexao?: boolean;
  conexaoPontoTemp?: { itemId: string; x: number; y: number; z: number } | null;
  selectedConexaoId?: string | null;
  onConectarClick?: (itemId: string, x: number, y: number, z: number) => void;
  onConexaoSelect?: (id: string | null) => void;
  onReady?: (api: Layout3DCanvasApi) => void;
}

export type ViewName = "top" | "front" | "back" | "left" | "right" | "iso";

export interface Layout3DCanvasApi {
  captureView: (view: ViewName) => string | null;
  fitAll: () => void;
}

interface DragBaseline { x: number; y: number; z: number; rotY: number }
interface DragState {
  baselines: Map<string, DragBaseline>;
  primaryStart: DragBaseline | null;
  primaryId: string | null;
}

interface CanvasCtx {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  tc?: TransformControls;
  groups?: Record<string, THREE.Group>;
  conexoesGroup?: THREE.Group;
  previewMarker?: THREE.Mesh | null;
  onTransform?: Layout3DCanvasProps["onTransform"];
  onSelect?: Layout3DCanvasProps["onSelect"];
  onConectarClick?: Layout3DCanvasProps["onConectarClick"];
  onConexaoSelect?: Layout3DCanvasProps["onConexaoSelect"];
  currentMode?: Layout3DCanvasProps["mode"];
  dom?: HTMLCanvasElement;
  animateToView?: (theta: number, phi: number, radius?: number) => void;
  fitAll?: () => void;
  selectedIds?: string[];
  dragState?: DragState | null;
  loader?: GLTFLoader;
  alive?: { current: boolean };
  invalidate?: () => void;
  atualizarSombras?: () => void;
  userNavigated?: boolean;
}

export function Layout3DCanvas({
  items,
  pisoLarguraMm,
  pisoComprimentoMm,
  selectedId,
  selectedIds = [],
  onSelect,
  onTransform,
  mode,
  alturaLiberada = false,
  conexoes = [],
  modoConexao = false,
  conexaoPontoTemp = null,
  selectedConexaoId = null,
  onConectarClick,
  onConexaoSelect,
  onReady,
}: Layout3DCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasCtx>({});
  const didInitialFitRef = useRef(false);
  const [loadingGlb, setLoadingGlb] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f4);

    const conexoesGroup = new THREE.Group();
    conexoesGroup.name = "conexoes";
    scene.add(conexoesGroup);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    // DPR visual limitado a 2 (a captura PNG/PDF restaura o DPR original abaixo).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const alive = { current: true };
    let needsRender = true;
    let tweenRaf = 0;
    const invalidate = () => {
      needsRender = true;
    };

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a89e, 0.8);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    keyLight.position.set(20, 35, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const keyLightDir = new THREE.Vector3(20, 35, 15).normalize();
    const keyLightTarget = new THREE.Object3D();
    scene.add(keyLightTarget);
    keyLight.target = keyLightTarget;

    /**
     * Ajusta a câmera de sombra aos bounds dos equipamentos (+ piso receptor),
     * medidos no espaço da luz. Chamado ao carregar/mover/remover — nunca por frame.
     */
    const atualizarSombras = () => {
      const { box } = getEquipmentBounds();
      box.union(
        new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(floorW, 0, floorH)),
      );
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const raio = Math.max(size.length() / 2, 2);
      const margem = raio * 0.1 + 0.5;

      keyLightTarget.position.copy(center);
      keyLightTarget.updateMatrixWorld(true);
      keyLight.position.copy(center).addScaledVector(keyLightDir, raio * 2.2 + 5);
      keyLight.updateMatrixWorld(true);

      const lookAt = new THREE.Matrix4().lookAt(
        keyLight.position,
        center,
        new THREE.Vector3(0, 1, 0),
      );
      const paraLuz = new THREE.Matrix4()
        .compose(
          keyLight.position,
          new THREE.Quaternion().setFromRotationMatrix(lookAt),
          new THREE.Vector3(1, 1, 1),
        )
        .invert();

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minD = Infinity;
      let maxD = -Infinity;
      const p = new THREE.Vector3();
      for (let i = 0; i < 8; i += 1) {
        p.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        ).applyMatrix4(paraLuz);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        const depth = -p.z;
        minD = Math.min(minD, depth);
        maxD = Math.max(maxD, depth);
      }

      const shadowCam = keyLight.shadow.camera;
      shadowCam.left = minX - margem;
      shadowCam.right = maxX + margem;
      shadowCam.bottom = minY - margem;
      shadowCam.top = maxY + margem;
      shadowCam.near = Math.max(0.5, minD - margem);
      shadowCam.far = Math.max(shadowCam.near + 1, maxD + margem);
      shadowCam.updateProjectionMatrix();
      keyLight.shadow.needsUpdate = true;
      invalidate();
    };

    const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.5);
    fillLight.position.set(-15, 20, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 15, -25);
    scene.add(rimLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambient);

    const floorW = Math.max(pisoLarguraMm / 1000, 5);
    const floorH = Math.max(pisoComprimentoMm / 1000, 5);
    const floorGeom = new THREE.PlaneGeometry(floorW, floorH);
    // Cimento polido — cinza médio com leve brilho
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a,
      roughness: 0.55,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.x = floorW / 2;
    floor.position.z = floorH / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(
      Math.max(floorW, floorH),
      Math.ceil(Math.max(floorW, floorH) * 2),
      0x6b6b6b,
      0x808080,
    );
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    grid.position.set(floorW / 2, 0.01, floorH / 2);
    scene.add(grid);

    // Vértice fixo de referência (origem 0,0) + arestas das duas laterais ancoradas
    const anchorPts = [
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(floorW, 0.02, 0),
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, 0.02, floorH),
    ];
    const anchorGeom = new THREE.BufferGeometry().setFromPoints(anchorPts);
    const anchorMat = new THREE.LineBasicMaterial({ color: 0xea580c, linewidth: 2 });
    const anchorLines = new THREE.LineSegments(anchorGeom, anchorMat);
    scene.add(anchorLines);

    const cornerMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 }),
    );
    cornerMarker.position.set(0, 0.025, 0);
    scene.add(cornerMarker);

    const orbit = {
      theta: -Math.PI / 4,
      phi: Math.PI / 3.5,
      radius: Math.max(floorW, floorH) * 1.4,
      target: new THREE.Vector3(floorW / 2, 0, floorH / 2),
      isDragging: false,
      locked: false,
    };
    const updateCam = () => {
      camera.position.x = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.z = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      camera.position.y = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
      camera.lookAt(orbit.target);
    };
    updateCam();

    const animateToView = (targetTheta: number, targetPhi: number, targetRadius?: number) => {
      cancelAnimationFrame(tweenRaf);
      const startTheta = orbit.theta;
      const startPhi = orbit.phi;
      const startRadius = orbit.radius;
      const endRadius = targetRadius ?? orbit.radius;
      const dur = 500;
      const t0 = performance.now();
      const tween = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        orbit.theta = startTheta + (targetTheta - startTheta) * ease;
        orbit.phi = startPhi + (targetPhi - startPhi) * ease;
        orbit.radius = startRadius + (endRadius - startRadius) * ease;
        invalidate();
        if (t < 1) tweenRaf = requestAnimationFrame(tween);
      };
      tween();
    };

    const getEquipmentBounds = () => {
      const box = new THREE.Box3();
      let hasGroups = false;
      const groups = ctxRef.current.groups || {};

      Object.values(groups).forEach((g) => {
        g.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(g);
        if (!b.isEmpty()) {
          box.union(b);
          hasGroups = true;
        }
      });

      if (!hasGroups) {
        box.min.set(0, 0, 0);
        box.max.set(floorW, 2, floorH);
      }

      const center = new THREE.Vector3();
      box.getCenter(center);

      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];

      return { box, center, corners, hasGroups };
    };

    const measureProjectedFit = (corners: THREE.Vector3[]) => {
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const view = camera.matrixWorldInverse;

      let maxAbsX = 0;
      let maxAbsY = 0;
      let minDepth = Number.POSITIVE_INFINITY;

      for (const corner of corners) {
        const worldPos = corner.clone();
        const camPos = worldPos.clone().applyMatrix4(view);
        minDepth = Math.min(minDepth, -camPos.z);

        const ndc = worldPos.project(camera);
        maxAbsX = Math.max(maxAbsX, Math.abs(ndc.x));
        maxAbsY = Math.max(maxAbsY, Math.abs(ndc.y));
      }

      return { maxAbsX, maxAbsY, minDepth };
    };

    const solveAdaptiveRadius = (corners: THREE.Vector3[], initialRadius: number, frameLimit = 0.9) => {
      const baseRadius = Math.max(initialRadius, 3);
      orbit.radius = baseRadius;
      updateCam();

      let probe = measureProjectedFit(corners);
      let safeRadius = baseRadius;

      for (let i = 0; i < 12; i += 1) {
        const overflow = Math.max(probe.maxAbsX / frameLimit, probe.maxAbsY / frameLimit);
        const tooClose = probe.minDepth <= camera.near * 1.5;
        if (overflow <= 1 && !tooClose) break;

        safeRadius = Math.max(safeRadius * Math.max(overflow, 1.08), safeRadius + 0.75);
        orbit.radius = safeRadius;
        updateCam();
        probe = measureProjectedFit(corners);
      }

      let low = baseRadius;
      let high = safeRadius;
      for (let i = 0; i < 10; i += 1) {
        const mid = (low + high) / 2;
        orbit.radius = mid;
        updateCam();
        const test = measureProjectedFit(corners);
        const overflow = Math.max(test.maxAbsX / frameLimit, test.maxAbsY / frameLimit);
        const tooClose = test.minDepth <= camera.near * 1.5;

        if (overflow <= 1 && !tooClose) {
          high = mid;
        } else {
          low = mid;
        }
      }

      return Math.max(high, 3);
    };

    const fitAll = () => {
      cancelAnimationFrame(tweenRaf);
      const { center, corners } = getEquipmentBounds();
      const startTarget = orbit.target.clone();
      const endTarget = new THREE.Vector3(center.x, center.y, center.z);
      const startRadius = orbit.radius;
      orbit.target.copy(endTarget);
      const endRadius = solveAdaptiveRadius(corners, Math.max(startRadius, Math.max(floorW, floorH) * 0.8), 0.88);
      orbit.target.copy(startTarget);
      const dur = 500;
      const t0 = performance.now();
      const tween = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const ease = 1 - Math.pow(1 - t, 3);
        orbit.target.lerpVectors(startTarget, endTarget, ease);
        orbit.radius = startRadius + (endRadius - startRadius) * ease;
        invalidate();
        if (t < 1) tweenRaf = requestAnimationFrame(tween);
      };
      tween();
    };

    const captureView = (view: ViewName): string | null => {
      const presets: Record<ViewName, [number, number]> = {
        top:   [-Math.PI / 2, 0.05],
        front: [-Math.PI / 2, Math.PI / 2 - 0.05],
        back:  [ Math.PI / 2, Math.PI / 2 - 0.05],
        left:  [ Math.PI,     Math.PI / 2 - 0.05],
        right: [ 0,           Math.PI / 2 - 0.05],
        iso:   [-Math.PI / 4, Math.PI / 3.5],
      };
      const [theta, phi] = presets[view];
      orbit.theta = theta;
      orbit.phi = phi;

      const { center, corners } = getEquipmentBounds();
      orbit.target.set(center.x, view === "top" ? 0 : center.y, center.z);
      orbit.radius = solveAdaptiveRadius(corners, Math.max(orbit.radius, Math.max(floorW, floorH) * 0.8), 0.9);
      updateCam();

      // Luz extra seguindo a câmera (melhora vistas laterais)
      const camLight = new THREE.DirectionalLight(0xffffff, 0.9);
      camLight.position.copy(camera.position);
      camLight.target.position.copy(orbit.target);
      scene.add(camLight);
      scene.add(camLight.target);

      // Captura na resolução original (DPR do dispositivo), sem o limite visual de 2.
      const dprVisual = renderer.getPixelRatio();
      const dprCaptura = window.devicePixelRatio || 1;
      const tamanhoCss = renderer.getSize(new THREE.Vector2());
      if (dprCaptura !== dprVisual) {
        renderer.setPixelRatio(dprCaptura);
        renderer.setSize(tamanhoCss.x, tamanhoCss.y);
      }

      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      } catch (e) {
        console.error("[captureView] falha:", e);
        return null;
      } finally {
        if (renderer.getPixelRatio() !== dprVisual) {
          renderer.setPixelRatio(dprVisual);
          renderer.setSize(tamanhoCss.x, tamanhoCss.y);
        }
        scene.remove(camLight);
        scene.remove(camLight.target);
        camLight.dispose();
        invalidate();
      }
    };

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.display = "block";
    let lastMouse = { x: 0, y: 0 };
    const pt = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      const m = e as MouseEvent;
      return { x: m.clientX, y: m.clientY };
    };
    const onDown = (e: MouseEvent) => {
      if (orbit.locked) return;
      orbit.isDragging = true;
      lastMouse = pt(e);
    };
    const onMove = (e: MouseEvent) => {
      if (!orbit.isDragging || orbit.locked) return;
      const p = pt(e);
      orbit.theta -= (p.x - lastMouse.x) * 0.005;
      orbit.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbit.phi - (p.y - lastMouse.y) * 0.005));
      lastMouse = p;
      ctxRef.current.userNavigated = true;
      invalidate();
    };
    const onUp = () => {
      orbit.isDragging = false;
      invalidate();
    };
    const zoomRaycaster = new THREE.Raycaster();
    const zoomNdc = new THREE.Vector2();
    const zoomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const onWheel = (e: WheelEvent) => {
      if (orbit.locked) return;
      e.preventDefault();

      const oldRadius = orbit.radius;
      const newRadius = Math.max(3, Math.min(150, oldRadius + e.deltaY * 0.02));
      if (newRadius === oldRadius) return;

      // ponto sob o cursor (no plano do piso) — vira o novo target proporcionalmente
      const rect = dom.getBoundingClientRect();
      zoomNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      zoomNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      zoomRaycaster.setFromCamera(zoomNdc, camera);
      const hit = new THREE.Vector3();
      const intersected = zoomRaycaster.ray.intersectPlane(zoomPlane, hit);

      orbit.radius = newRadius;

      if (intersected) {
        // fração de aproximação (0 = sem mover, 1 = target gruda no cursor)
        const t = (oldRadius - newRadius) / oldRadius;
        orbit.target.x += (hit.x - orbit.target.x) * t;
        orbit.target.z += (hit.z - orbit.target.z) * t;
      }
      ctxRef.current.userNavigated = true;
      invalidate();
    };
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const tc = new TransformControls(camera, dom);
    tc.setSize(0.8);
    tc.setTranslationSnap(0.1);
    tc.setRotationSnap(THREE.MathUtils.degToRad(90));
    tc.showY = false;
    tc.setMode("translate");
    const onDraggingChanged = (e: { value?: unknown }) => {
      const dragging = Boolean((e as { value: unknown }).value);
      orbit.locked = dragging;
      const c = ctxRef.current;
      if (dragging) {
        const ids = c.selectedIds && c.selectedIds.length > 0 ? c.selectedIds : (tc.object?.userData.itemId ? [tc.object.userData.itemId as string] : []);
        const baselines = new Map<string, DragBaseline>();
        ids.forEach((id) => {
          const g = c.groups?.[id];
          if (g) baselines.set(id, { x: g.position.x, y: g.position.y, z: g.position.z, rotY: g.rotation.y });
        });
        const primaryObj = tc.object;
        c.dragState = {
          baselines,
          primaryStart: primaryObj ? { x: primaryObj.position.x, y: primaryObj.position.y, z: primaryObj.position.z, rotY: primaryObj.rotation.y } : null,
          primaryId: (primaryObj?.userData.itemId as string) ?? null,
        };
      } else {
        const ds = c.dragState;
        if (ds) {
          ds.baselines.forEach((_b, id) => {
            const g = c.groups?.[id];
            if (!g) return;
            const posXmm = Math.round(g.position.x * 1000);
            const posYmm = Math.round(g.position.z * 1000);
            const posZmm = Math.round(g.position.y * 1000);
            const rotacaoDeg = Math.round(((g.rotation.y * 180) / Math.PI + 360) % 360);
            c.onTransform?.(id, posXmm, posYmm, posZmm, rotacaoDeg);
          });
        }
        c.dragState = null;
        atualizarSombras();
      }
      invalidate();
    };
    const onObjectChange = () => {
      const c = ctxRef.current;
      const obj = tc.object;
      if (!obj || !obj.userData.itemId) return;
      const ds = c.dragState;
      if (ds && ds.primaryStart && ds.baselines.size > 1) {
        const dx = obj.position.x - ds.primaryStart.x;
        const dy = obj.position.y - ds.primaryStart.y;
        const dz = obj.position.z - ds.primaryStart.z;
        const drot = obj.rotation.y - ds.primaryStart.rotY;
        ds.baselines.forEach((b, id) => {
          if (id === ds.primaryId) return;
          const g = c.groups?.[id];
          if (!g) return;
          g.position.set(b.x + dx, b.y + dy, b.z + dz);
          g.rotation.y = b.rotY + drot;
        });
      }
      invalidate();
    };
    tc.addEventListener("dragging-changed", onDraggingChanged);
    tc.addEventListener("objectChange", onObjectChange);
    // hover/mudança de eixo do gizmo
    tc.addEventListener("change", invalidate);
    const tcAny = tc as unknown as { getHelper?: () => THREE.Object3D };
    const tcHelper = tcAny.getHelper ? tcAny.getHelper() : (tc as unknown as THREE.Object3D);
    scene.add(tcHelper);

    const viewHelperDiv = document.createElement("div");
    viewHelperDiv.style.position = "absolute";
    viewHelperDiv.style.top = "10px";
    viewHelperDiv.style.right = "10px";
    viewHelperDiv.style.width = "128px";
    viewHelperDiv.style.height = "128px";
    viewHelperDiv.style.zIndex = "10";
    viewHelperDiv.style.pointerEvents = "auto";
    mount.appendChild(viewHelperDiv);
    const viewHelper = new ViewHelper(camera, viewHelperDiv);
    const onViewHelperPointerUp = (event: PointerEvent) => {
      const vh = viewHelper as unknown as { handleClick: (e: PointerEvent) => boolean };
      if (vh.handleClick(event)) {
        ctxRef.current.userNavigated = true;
        invalidate();
        setTimeout(() => {
          const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
          orbit.radius = offset.length();
          orbit.theta = Math.atan2(offset.z, offset.x);
          orbit.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / orbit.radius)));
          invalidate();
        }, 600);
      }
    };
    viewHelperDiv.addEventListener("pointerup", onViewHelperPointerUp);

    const raycaster = new THREE.Raycaster();
    const mouseV = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;
    const onClickDown = (e: MouseEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onClickUp = (e: MouseEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      const dragging = (tc as unknown as { dragging?: boolean }).dragging;
      if (moved > 5 || dragging) return;
      const rect = dom.getBoundingClientRect();
      mouseV.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseV, camera);
      const c = ctxRef.current;

      // MODO CONECTAR
      if (c.currentMode === "connect") {
        const groupsArr = Object.values(c.groups || {}) as THREE.Object3D[];
        const hits = raycaster.intersectObjects(groupsArr, true);
        if (hits.length === 0) return;

        let wrapper: THREE.Object3D | null = hits[0].object;
        while (wrapper && !wrapper.userData.itemId) wrapper = wrapper.parent;
        if (!wrapper) return;

        const itemId = wrapper.userData.itemId as string;
        const worldPoint = hits[0].point.clone();
        const localPoint = wrapper.worldToLocal(worldPoint.clone());

        const localBbox = new THREE.Box3();
        const wrapperMatrixInv = wrapper.matrixWorld.clone().invert();
        wrapper.children.forEach((child: THREE.Object3D) => {
          const childBox = new THREE.Box3().setFromObject(child);
          childBox.applyMatrix4(wrapperMatrixInv);
          localBbox.union(childBox);
        });
        if (localBbox.isEmpty()) {
          localBbox.min.set(-0.5, 0, -0.5);
          localBbox.max.set(0.5, 1, 0.5);
        }

        const snapDistMeters = 0.2;
        const distancias = [
          { d: Math.abs(localPoint.x - localBbox.min.x), p: new THREE.Vector3(localBbox.min.x, localPoint.y, localPoint.z) },
          { d: Math.abs(localPoint.x - localBbox.max.x), p: new THREE.Vector3(localBbox.max.x, localPoint.y, localPoint.z) },
          { d: Math.abs(localPoint.y - localBbox.min.y), p: new THREE.Vector3(localPoint.x, localBbox.min.y, localPoint.z) },
          { d: Math.abs(localPoint.y - localBbox.max.y), p: new THREE.Vector3(localPoint.x, localBbox.max.y, localPoint.z) },
          { d: Math.abs(localPoint.z - localBbox.min.z), p: new THREE.Vector3(localPoint.x, localPoint.y, localBbox.min.z) },
          { d: Math.abs(localPoint.z - localBbox.max.z), p: new THREE.Vector3(localPoint.x, localPoint.y, localBbox.max.z) },
        ];
        const maisProx = distancias.reduce((a, b) => (a.d < b.d ? a : b));
        const finalLocal = maisProx.d < snapDistMeters ? maisProx.p : localPoint;

        const xmm = Math.round(finalLocal.x * 1000);
        const ymm = Math.round(finalLocal.y * 1000);
        const zmm = Math.round(finalLocal.z * 1000);

        c.onConectarClick?.(itemId, xmm, ymm, zmm);
        return;
      }

      // MODO NORMAL: testar clique em conexao antes de equipamento
      if (c.conexoesGroup) {
        const conexHits = raycaster.intersectObjects(c.conexoesGroup.children, true);
        if (conexHits.length > 0) {
          let line: THREE.Object3D | null = conexHits[0].object;
          while (line && !line.userData.conexaoId) line = line.parent;
          if (line) {
            c.onConexaoSelect?.(line.userData.conexaoId as string);
            return;
          }
        }
      }

      const groupsArr = Object.values(c.groups || {}) as THREE.Object3D[];
      const hits = raycaster.intersectObjects(groupsArr, true);
      const shift = e.shiftKey;
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.itemId) obj = obj.parent;
        if (obj) c.onSelect?.(obj.userData.itemId as string, shift);
      } else if (!shift) {
        c.onSelect?.(null);
        c.onConexaoSelect?.(null);
      }
    };
    dom.addEventListener("mousedown", onClickDown);
    dom.addEventListener("mouseup", onClickUp);

    let raf = 0;
    const viewHelperClock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const delta = viewHelperClock.getDelta();
      const vh = viewHelper as unknown as { animating?: boolean; update: (d: number) => void };
      const animando = Boolean(vh.animating);
      if (animando) vh.update(delta);
      const arrastando =
        orbit.isDragging || Boolean((tc as unknown as { dragging?: boolean }).dragging);
      // Render sob demanda: só desenha quando algo mudou ou há animação/arraste ativo.
      if (!needsRender && !animando && !arrastando) return;
      needsRender = false;
      updateCam();
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      viewHelper.render(renderer);
      renderer.autoClear = true;
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    ctxRef.current = {
      scene, camera, renderer, tc,
      groups: {},
      conexoesGroup,
      previewMarker: null,
      onTransform, onSelect, onConectarClick, onConexaoSelect,
      currentMode: mode,
      dom, animateToView, fitAll,
      loader, alive, invalidate, atualizarSombras,
      userNavigated: false,
    };

    atualizarSombras();

    // Expõe API ao parent para captura de múltiplas vistas (PDF, etc).
    // Aguarda um frame para garantir que groups foram populados pelo effect de items.
    if (onReady) {
      const api: Layout3DCanvasApi = { captureView, fitAll };
      requestAnimationFrame(() => onReady(api));
    }

    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(tweenRaf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("mousedown", onClickDown);
      dom.removeEventListener("mouseup", onClickUp);
      viewHelperDiv.removeEventListener("pointerup", onViewHelperPointerUp);
      tc.removeEventListener("dragging-changed", onDraggingChanged);
      tc.removeEventListener("objectChange", onObjectChange);
      tc.removeEventListener("change", invalidate);
      tc.detach();
      tc.dispose();
      scene.remove(tcHelper);
      (viewHelper as unknown as { dispose?: () => void }).dispose?.();
      try {
        mount.removeChild(dom);
      } catch {
        /* noop */
      }
      try {
        mount.removeChild(viewHelperDiv);
      } catch {
        /* noop */
      }
      draco.dispose();
      // Libera geometrias/materiais/texturas próprios da cena (envMap é tratado à parte)
      descartarObjeto3D(scene);
      descartarObjeto3D(roomEnv);
      scene.environment = null;
      envRT.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      ctxRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pisoLarguraMm, pisoComprimentoMm]);

  useEffect(() => {
    ctxRef.current.onTransform = onTransform;
    ctxRef.current.onSelect = onSelect;
    ctxRef.current.onConectarClick = onConectarClick;
    ctxRef.current.onConexaoSelect = onConexaoSelect;
    ctxRef.current.currentMode = mode;
    ctxRef.current.selectedIds = selectedIds;
  }, [onTransform, onSelect, onConectarClick, onConexaoSelect, mode, selectedIds]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.tc) return;
    if (mode === "connect") {
      c.tc.detach();
      (c.tc as unknown as { visible: boolean }).visible = false;
      c.invalidate?.();
      return;
    }
    (c.tc as unknown as { visible: boolean }).visible = true;
    c.tc.setMode(mode as "translate" | "rotate");
    if (mode === "translate") {
      c.tc.showX = true;
      c.tc.showY = alturaLiberada;
      c.tc.showZ = true;
    } else {
      c.tc.showX = false;
      c.tc.showY = true;
      c.tc.showZ = false;
    }
    c.invalidate?.();
  }, [mode, alturaLiberada]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.groups || !c.loader) return;
    const groups = c.groups;
    const loader = c.loader;
    const alive = c.alive;

    const existingIds = Object.keys(groups);
    const newIds = items.map((i) => i.item_id);

    existingIds.forEach((id) => {
      if (!newIds.includes(id)) {
        const g = groups[id];
        descartarMaterialClonado(g);
        c.scene!.remove(g);
        descartarObjeto3D(g);
        delete groups[id];
      }
    });

    let pendentes = 0;
    const concluirCarga = () => {
      pendentes -= 1;
      if (pendentes > 0) return;
      c.atualizarSombras?.();
      c.invalidate?.();
      // Enquadramento inicial: uma única vez, e nunca sobrepondo navegação manual.
      if (!didInitialFitRef.current && !c.userNavigated && items.length > 0) {
        didInitialFitRef.current = true;
        c.fitAll?.();
      }
    };

    items.forEach((it) => {
      const existing = groups[it.item_id];
      const posX = (it.pos_x_mm ?? 0) / 1000;
      const posZ = (it.pos_y_mm ?? 0) / 1000;
      const posY = (it.pos_z_mm ?? 0) / 1000;
      const rotY = ((it.rotacao ?? 0) * Math.PI) / 180;

      if (existing) {
        existing.position.set(posX, posY, posZ);
        existing.rotation.set(0, rotY, 0);
        return;
      }

      const wrapper = new THREE.Group();
      wrapper.name = it.item_id;
      wrapper.userData.itemId = it.item_id;
      wrapper.position.set(posX, posY, posZ);
      wrapper.rotation.set(0, rotY, 0);
      c.scene!.add(wrapper);
      groups[it.item_id] = wrapper;

      const glbUrl = (it as unknown as { modelo_3d_url?: string | null }).modelo_3d_url;
      if (glbUrl) {
        pendentes += 1;
        loader.load(
          glbUrl,
          (gltf) => {
            const inner = gltf.scene;
            // Se o item foi removido ou o canvas desmontou, descarta a carga.
            if (!alive?.current || groups[it.item_id] !== wrapper) {
              descartarObjeto3D(inner);
              setLoadingGlb((p) => {
                const np = { ...p };
                delete np[it.item_id];
                return np;
              });
              concluirCarga();
              return;
            }
            const rotX = (((it as unknown as { glb_rotacao_x?: number | null }).glb_rotacao_x ?? 0) * Math.PI) / 180;
            const rotYglb = (((it as unknown as { glb_rotacao_y?: number | null }).glb_rotacao_y ?? 0) * Math.PI) / 180;
            const rotZ = (((it as unknown as { glb_rotacao_z?: number | null }).glb_rotacao_z ?? 0) * Math.PI) / 180;
            inner.rotation.x = rotX;
            inner.rotation.y = rotYglb;
            inner.rotation.z = rotZ;
            inner.traverse((o: THREE.Object3D) => {
              const mesh = o as THREE.Mesh;
              if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });
            inner.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(inner);
            const center = new THREE.Vector3();
            box.getCenter(center);
            inner.position.x -= center.x;
            inner.position.z -= center.z;
            inner.position.y -= box.min.y;
            wrapper.add(inner);
            setLoadingGlb((p) => {
              const np = { ...p };
              delete np[it.item_id];
              return np;
            });
            concluirCarga();
          },
          (xhr) => {
            if (xhr.total) {
              setLoadingGlb((p) => ({
                ...p,
                [it.item_id]: Math.round((xhr.loaded / xhr.total) * 100),
              }));
            }
          },
          () => {
            // Falha ao carregar GLB: não renderiza geometria de fallback.
            setLoadingGlb((p) => {
              const np = { ...p };
              delete np[it.item_id];
              return np;
            });
            concluirCarga();
          },
        );
      }
      // Sem modelo_3d_url: wrapper permanece vazio (sem cubo placeholder).

    });

    c.atualizarSombras?.();
    c.invalidate?.();

    if (pendentes === 0 && !didInitialFitRef.current && !c.userNavigated && items.length > 0) {
      didInitialFitRef.current = true;
      requestAnimationFrame(() => c.fitAll?.());
    }
  }, [items, pisoLarguraMm, pisoComprimentoMm]);

  const prevSelectedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const c = ctxRef.current;
    if (!c.tc || !c.groups) return;

    const allSel = selectedIds && selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    const prev = prevSelectedIdsRef.current;

    // restaurar opacidade dos que sairam
    prev.forEach((id) => {
      if (!allSel.includes(id) && c.groups?.[id]) restaurarOpacidade(c.groups[id]);
    });
    // aplicar transparencia nos novos
    allSel.forEach((id) => {
      if (!prev.includes(id) && c.groups?.[id]) tornarTransparente(c.groups[id]);
    });

    if (selectedId && c.groups[selectedId]) {
      c.tc.attach(c.groups[selectedId]);
    } else {
      c.tc.detach();
    }

    prevSelectedIdsRef.current = allSel;
    c.invalidate?.();
  }, [selectedId, selectedIds, items, pisoLarguraMm, pisoComprimentoMm]);

  // Renderiza conexoes
  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.conexoesGroup || !c.groups) return;
    const grp = c.conexoesGroup;

    while (grp.children.length > 0) {
      const child = grp.children[0] as THREE.Mesh;
      grp.remove(child);
      if (child.geometry) child.geometry.dispose();
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }

    conexoes.forEach((conex) => {
      const grupoOrigem = c.groups![conex.item_origem_id];
      const grupoDestino = c.groups![conex.item_destino_id];
      if (!grupoOrigem || !grupoDestino) return;

      grupoOrigem.updateMatrixWorld(true);
      grupoDestino.updateMatrixWorld(true);

      const localOrigem = new THREE.Vector3(
        conex.ponto_origem_x_mm / 1000,
        conex.ponto_origem_y_mm / 1000,
        conex.ponto_origem_z_mm / 1000,
      );
      const localDestino = new THREE.Vector3(
        conex.ponto_destino_x_mm / 1000,
        conex.ponto_destino_y_mm / 1000,
        conex.ponto_destino_z_mm / 1000,
      );

      const worldOrigem = grupoOrigem.localToWorld(localOrigem.clone());
      const worldDestino = grupoDestino.localToWorld(localDestino.clone());

      const dist = worldOrigem.distanceTo(worldDestino);
      if (dist < 0.001) return;

      const isSel = conex.id === selectedConexaoId;
      const cor = isSel ? 0x1d9e75 : 0x444444;
      const raio = isSel ? 0.04 : 0.025;

      const geom = new THREE.CylinderGeometry(raio, raio, dist, 12);
      const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, metalness: 0.1 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.conexaoId = conex.id;

      const meio = new THREE.Vector3().addVectors(worldOrigem, worldDestino).multiplyScalar(0.5);
      mesh.position.copy(meio);

      const direcao = new THREE.Vector3().subVectors(worldDestino, worldOrigem).normalize();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, direcao);
      mesh.setRotationFromQuaternion(quat);

      grp.add(mesh);
    });

    c.invalidate?.();
  }, [conexoes, selectedConexaoId, items, pisoLarguraMm, pisoComprimentoMm]);

  // Marcador do ponto temporario (modo conectar)
  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene) return;

    if (c.previewMarker) {
      removerEDescartar(c.previewMarker);
      c.previewMarker = null;
    }

    if (modoConexao && conexaoPontoTemp && c.groups) {
      const grupoOrigem = c.groups[conexaoPontoTemp.itemId];
      if (grupoOrigem) {
        grupoOrigem.updateMatrixWorld(true);
        const localOrigem = new THREE.Vector3(
          conexaoPontoTemp.x / 1000,
          conexaoPontoTemp.y / 1000,
          conexaoPontoTemp.z / 1000,
        );
        const worldOrigem = grupoOrigem.localToWorld(localOrigem.clone());
        const sphereGeom = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.position.copy(worldOrigem);
        c.scene.add(sphere);
        c.previewMarker = sphere;
      }
    }

    c.invalidate?.();
  }, [modoConexao, conexaoPontoTemp]);


  const goToView = (view: "top" | "front" | "back" | "left" | "right" | "iso") => {
    const c = ctxRef.current;
    if (!c.animateToView) return;
    c.userNavigated = true;
    const floorW = Math.max(pisoLarguraMm / 1000, 5);
    const floorH = Math.max(pisoComprimentoMm / 1000, 5);
    const baseRadius = Math.max(floorW, floorH) * 1.2;
    switch (view) {
      case "top":
        c.animateToView(-Math.PI / 2, 0.05, baseRadius);
        break;
      case "front":
        c.animateToView(-Math.PI / 2, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "back":
        c.animateToView(Math.PI / 2, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "left":
        c.animateToView(Math.PI, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "right":
        c.animateToView(0, Math.PI / 2 - 0.05, baseRadius);
        break;
      case "iso":
      default:
        c.animateToView(-Math.PI / 4, Math.PI / 3.5, baseRadius * 1.15);
        break;
    }
  };

  const btnCls =
    "px-2.5 py-1.5 text-xs font-medium rounded hover:bg-muted flex items-center gap-1.5";

  return (
    <div ref={mountRef} className="w-full h-full relative bg-stone-100">
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur border shadow-sm rounded-lg flex items-center gap-1 px-1.5 py-1 z-10">
        <button onClick={() => goToView("top")} className={btnCls} title="Vista superior">
          <ArrowDown className="w-3.5 h-3.5" /> Topo
        </button>
        <button onClick={() => goToView("front")} className={btnCls} title="Vista frontal">
          <ArrowUp className="w-3.5 h-3.5 rotate-180" /> Frente
        </button>
        <button onClick={() => goToView("back")} className={btnCls} title="Vista traseira">
          <ArrowUp className="w-3.5 h-3.5" /> Trás
        </button>
        <button onClick={() => goToView("left")} className={btnCls} title="Vista lateral esquerda">
          <ArrowLeft className="w-3.5 h-3.5" /> Esq
        </button>
        <button onClick={() => goToView("right")} className={btnCls} title="Vista lateral direita">
          <ArrowRight className="w-3.5 h-3.5" /> Dir
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button onClick={() => goToView("iso")} className={btnCls} title="Vista isométrica">
          <Box className="w-3.5 h-3.5" /> Iso
        </button>
        <div className="w-px h-5 bg-border mx-0.5" />
        <button
          onClick={() => ctxRef.current.fitAll?.()}
          className={btnCls}
          title="Enquadrar tudo (centraliza o desenho na tela)"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Enquadrar
        </button>
      </div>
      {Object.keys(loadingGlb).length > 0 && (
        <div className="absolute top-3 left-3 bg-background/95 border rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs z-10">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          Carregando {Object.keys(loadingGlb).length} modelo(s)...
        </div>
      )}
    </div>
  );
}
