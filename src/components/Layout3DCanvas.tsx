import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Loader2, Box, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { LayoutItemRow, ConexaoRow } from "@/lib/layouts";
import {
  tornarTransparente,
  restaurarOpacidade,
  descartarMaterialClonado,
} from "@/lib/three/selectionTransparency";

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
  selectedIds?: string[];
  dragState?: DragState | null;
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
}: Layout3DCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasCtx>({});
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
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a89e, 0.8);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    keyLight.position.set(20, 35, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -40;
    keyLight.shadow.camera.right = 40;
    keyLight.shadow.camera.top = 40;
    keyLight.shadow.camera.bottom = -40;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

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
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xdcdcdc,
      roughness: 0.92,
      metalness: 0.0,
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
      0xc0c0c0,
      0xd6d3d1,
    );
    grid.position.set(floorW / 2, 0.01, floorH / 2);
    scene.add(grid);

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
        if (t < 1) requestAnimationFrame(tween);
      };
      tween();
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
    };
    const onUp = () => {
      orbit.isDragging = false;
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
    tc.addEventListener("dragging-changed", (e) => {
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
      }
    });
    tc.addEventListener("objectChange", () => {
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
    });
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
    viewHelperDiv.addEventListener("pointerup", (event) => {
      const vh = viewHelper as unknown as { handleClick: (e: PointerEvent) => boolean };
      if (vh.handleClick(event)) {
        setTimeout(() => {
          const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
          orbit.radius = offset.length();
          orbit.theta = Math.atan2(offset.z, offset.x);
          orbit.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / orbit.radius)));
        }, 600);
      }
    });

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
      if (vh.animating) vh.update(delta);
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
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    ctxRef.current = {
      scene, camera, renderer, tc,
      groups: {},
      conexoesGroup,
      previewMarker: null,
      onTransform, onSelect, onConectarClick, onConexaoSelect,
      currentMode: mode,
      dom, animateToView,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("mousedown", onClickDown);
      dom.removeEventListener("mouseup", onClickUp);
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
      scene.traverse((o: THREE.Object3D) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
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
  }, [onTransform, onSelect, onConectarClick, onConexaoSelect, mode]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.tc) return;
    if (mode === "connect") {
      c.tc.detach();
      (c.tc as unknown as { visible: boolean }).visible = false;
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
  }, [mode, alturaLiberada]);

  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene || !c.groups) return;
    const groups = c.groups;

    const existingIds = Object.keys(groups);
    const newIds = items.map((i) => i.item_id);

    existingIds.forEach((id) => {
      if (!newIds.includes(id)) {
        const g = groups[id];
        descartarMaterialClonado(g);
        c.scene!.remove(g);
        g.traverse((o: THREE.Object3D) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        delete groups[id];
      }
    });

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    loader.setDRACOLoader(draco);

    items.forEach((it) => {
      const existing = groups[it.item_id];
      const w = (it.largura_mm ?? 1000) / 1000;
      const h = (it.altura_mm ?? 2000) / 1000;
      const d = (it.comprimento_mm ?? 1000) / 1000;
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

      const buildBoxFallback = () => {
        const cor = it.cor_categoria || "#888780";
        const geom = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(cor),
          roughness: 0.65,
          metalness: 0.15,
          transparent: true,
          opacity: 0.78,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = h / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        wrapper.add(mesh);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: new THREE.Color(cor), transparent: true, opacity: 0.95 }),
        );
        edges.position.y = h / 2;
        wrapper.add(edges);
      };

      const glbUrl = (it as unknown as { modelo_3d_url?: string | null }).modelo_3d_url;
      if (glbUrl) {
        loader.load(
          glbUrl,
          (gltf) => {
            const inner = gltf.scene;
            const rotX = (((it as unknown as { glb_rotacao_x?: number | null }).glb_rotacao_x ?? 0) * Math.PI) / 180;
            const rotZ = (((it as unknown as { glb_rotacao_z?: number | null }).glb_rotacao_z ?? 0) * Math.PI) / 180;
            inner.rotation.x = rotX;
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
            setLoadingGlb((p) => {
              const np = { ...p };
              delete np[it.item_id];
              return np;
            });
            buildBoxFallback();
          },
        );
      } else {
        buildBoxFallback();
      }
    });
  }, [items, pisoLarguraMm, pisoComprimentoMm]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const c = ctxRef.current;
    if (!c.tc || !c.groups) return;

    const prev = prevSelectedRef.current;
    if (prev && c.groups[prev]) {
      restaurarOpacidade(c.groups[prev]);
    }

    if (selectedId && c.groups[selectedId]) {
      c.tc.attach(c.groups[selectedId]);
      tornarTransparente(c.groups[selectedId]);
    } else {
      c.tc.detach();
    }

    prevSelectedRef.current = selectedId;
  }, [selectedId, items, pisoLarguraMm, pisoComprimentoMm]);

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
  }, [conexoes, selectedConexaoId, items, pisoLarguraMm, pisoComprimentoMm]);

  // Marcador do ponto temporario (modo conectar)
  useEffect(() => {
    const c = ctxRef.current;
    if (!c.scene) return;

    if (c.previewMarker) {
      c.scene.remove(c.previewMarker);
      if (c.previewMarker.geometry) c.previewMarker.geometry.dispose();
      const m = c.previewMarker.material as THREE.Material | undefined;
      if (m) m.dispose();
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
  }, [modoConexao, conexaoPontoTemp]);


  const goToView = (view: "top" | "front" | "back" | "left" | "right" | "iso") => {
    const c = ctxRef.current;
    if (!c.animateToView) return;
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
