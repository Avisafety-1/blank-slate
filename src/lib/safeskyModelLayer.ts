/**
 * Custom MapLibre-lag som rendrer SafeSky-trafikk som 3D GLTF-modeller (Matrice).
 * Bruker three.js på MapLibres egen WebGL-kontekst.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import maplibregl, { Map as MlMap, CustomLayerInterface } from "maplibre-gl";

export interface SafeSkyBeacon {
  id: string;
  lng: number;
  lat: number;
  altitude: number;
  course: number;
}

export interface SafeSkyModelLayer extends CustomLayerInterface {
  setBeacons: (beacons: SafeSkyBeacon[]) => void;
  destroy: () => void;
}

export function createSafeSkyModelLayer(modelUrl: string, opts?: { modelMeters?: number }): SafeSkyModelLayer {
  const MODEL_METERS = opts?.modelMeters ?? 140; // synlig størrelse i meter (overdreven for synlighet)
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let mapRef: MlMap | null = null;
  let template: THREE.Object3D | null = null;
  const objects = new Map<string, THREE.Object3D>();
  let pending: SafeSkyBeacon[] = [];

  const rebuild = () => {
    if (!scene || !template) return;
    const seen = new Set<string>();
    for (const b of pending) {
      seen.add(b.id);
      let obj = objects.get(b.id);
      if (!obj) {
        // Ytre group = posisjon + skala + bearing rundt up-aksen
        const outer = new THREE.Group();
        // Indre group = aksesnu (gltf +Y opp → map +Z opp)
        const inner = template.clone(true);
        inner.rotation.x = Math.PI / 2;
        outer.add(inner);
        scene.add(outer);
        objects.set(b.id, outer);
        obj = outer;
      }
      const merc = maplibregl.MercatorCoordinate.fromLngLat(
        { lng: b.lng, lat: b.lat },
        Math.max(0, b.altitude || 0),
      );
      const s = merc.meterInMercatorCoordinateUnits() * MODEL_METERS;
      obj.position.set(merc.x, merc.y, merc.z);
      obj.scale.set(s, s, s);
      // Bearing: rotér rundt z (up) etter aksesnu
      obj.rotation.z = THREE.MathUtils.degToRad(-(b.course || 0));
    }
    // Fjern utdaterte
    for (const [id, obj] of objects) {
      if (!seen.has(id)) {
        scene.remove(obj);
        objects.delete(id);
      }
    }
    mapRef?.triggerRepaint();
  };

  const layer: SafeSkyModelLayer = {
    id: "safesky-3d-models",
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      mapRef = map;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(0, -70, 100).normalize();
      scene.add(dir);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          template = gltf.scene;
          rebuild();
          mapRef?.triggerRepaint();
        },
        undefined,
        (err) => {
          console.error("[SafeSky3D] GLTF load failed", err);
        },
      );
    },

    render(_gl, matrix) {
      if (!renderer || !scene || !camera) return;
      const m = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
      camera.projectionMatrix = m;
      renderer.resetState();
      renderer.render(scene, camera);
    },

    setBeacons(next) {
      pending = next;
      rebuild();
    },

    destroy() {
      objects.forEach((o) => scene?.remove(o));
      objects.clear();
      template = null;
      scene = null;
      camera = null;
      // Vi eier ikke gl/canvas-konteksten — ikke kall renderer.dispose() på den.
      renderer = null;
      mapRef = null;
    },
  };

  return layer;
}
