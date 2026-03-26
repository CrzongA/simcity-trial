import React, { useEffect, useRef } from 'react';
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ellipsoid,
  HeadingPitchRoll,
  IntersectionTests,
  Math as CesiumMath,
  Plane,
  Quaternion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
} from 'cesium';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  selectModel,
  updateModelTransform,
  PlacedModel,
} from '../../store/modelDesignSlice';

interface Props {
  viewerRef: React.MutableRefObject<any>;
}

// Gizmo visual constants
const GIZMO_X  = Color.fromCssColorString('#ff4444'); // East  — red
const GIZMO_Y  = Color.fromCssColorString('#44ff44'); // North — green
const GIZMO_Z  = Color.fromCssColorString('#4488ff'); // Up    — blue
const ARM_FRAC = 0.15; // arm length = 15% of camera-to-model distance
const HANDLE_PX = 14;  // handle point pixel size

// ─── Per-frame scratch objects (avoid GC pressure) ───────────────────────────
const _delta      = new Cartesian3();
const _axisVec    = new Cartesian3();
const _projected  = new Cartesian3();
const _newPos     = new Cartesian3();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getENUAxes(pos: Cartesian3) {
  const mat = Transforms.eastNorthUpToFixedFrame(pos);
  return {
    east:  Cartesian3.normalize(new Cartesian3(mat[0], mat[1], mat[2]),  new Cartesian3()),
    north: Cartesian3.normalize(new Cartesian3(mat[4], mat[5], mat[6]),  new Cartesian3()),
    up:    Cartesian3.normalize(new Cartesian3(mat[8], mat[9], mat[10]), new Cartesian3()),
  };
}

function getHandleTip(
  modelPos: Cartesian3,
  axis: 'x' | 'y' | 'z',
  enuAxes: ReturnType<typeof getENUAxes>,
  armLength: number,
): Cartesian3 {
  const dir = axis === 'x' ? enuAxes.east : axis === 'y' ? enuAxes.north : enuAxes.up;
  return Cartesian3.add(
    modelPos,
    Cartesian3.multiplyByScalar(dir, armLength, new Cartesian3()),
    new Cartesian3(),
  );
}

// Plane facing the camera, perpendicular to the horizontal ground, used for Z-axis drag
function buildVerticalDragPlane(pos: Cartesian3, camDir: Cartesian3, up: Cartesian3): Plane {
  const dotUp = Cartesian3.dot(camDir, up);
  const horizontal = Cartesian3.subtract(
    camDir,
    Cartesian3.multiplyByScalar(up, dotUp, new Cartesian3()),
    new Cartesian3(),
  );
  Cartesian3.normalize(horizontal, horizontal);
  return Plane.fromPointNormal(pos, horizontal);
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ModelDesignMapController: React.FC<Props> = ({ viewerRef }) => {
  const dispatch = useAppDispatch();
  const { models, selectedModelId, transformMode } = useAppSelector(s => s.modelDesign);

  // Always-current refs for Cesium callbacks and event handlers
  const modelsRef        = useRef<PlacedModel[]>(models);
  const selectedIdRef    = useRef<string | null>(selectedModelId);
  const transformModeRef = useRef(transformMode);

  // Entity tracking
  const modelEntityMap  = useRef<Map<string, any>>(new Map());
  const gizmoEntities   = useRef<any[]>([]);

  // Drag state (all refs — no re-renders needed during drag)
  const dragAxisRef        = useRef<'x' | 'y' | 'z' | null>(null);
  const dragInitialPos     = useRef<{ lng: number; lat: number; height: number } | null>(null);
  const dragInitialHit     = useRef<Cartesian3 | null>(null);
  const dragVerticalNormal = useRef<Cartesian3 | null>(null);

  // ── Sync refs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    modelsRef.current     = models;
    selectedIdRef.current = selectedModelId;
  }, [models, selectedModelId]);

  useEffect(() => {
    transformModeRef.current = transformMode;
  }, [transformMode]);

  // ── Helpers bound to refs ─────────────────────────────────────────────────
  const getSelected = (): PlacedModel | null =>
    modelsRef.current.find(m => m.id === selectedIdRef.current) ?? null;

  const getModelPos = (model: PlacedModel) =>
    Cartesian3.fromDegrees(model.lng, model.lat, model.height);

  const getArmLength = (viewer: any, pos: Cartesian3) =>
    Math.max(5, Cartesian3.distance(viewer.camera.position, pos) * ARM_FRAC);

  // ── Gizmo management ─────────────────────────────────────────────────────
  const clearGizmo = (viewer: any) => {
    gizmoEntities.current.forEach(e => {
      if (!viewer.isDestroyed()) viewer.entities.remove(e);
    });
    gizmoEntities.current = [];
  };

  const buildTranslateGizmo = (viewer: any) => {
    const push = (def: any) => {
      const e = viewer.entities.add(def);
      gizmoEntities.current.push(e);
    };

    // Center sphere
    push({
      id: 'gizmo-center',
      position: new CallbackProperty(() => {
        const m = getSelected();
        return m ? getModelPos(m) : new Cartesian3();
      }, false),
      point: {
        pixelSize: 10,
        color: Color.WHITE,
        disableDepthTestDistance: Infinity,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
      },
    });

    // Per-axis: line shaft + handle sphere
    const axes: { axis: 'x' | 'y' | 'z'; color: Color }[] = [
      { axis: 'x', color: GIZMO_X },
      { axis: 'y', color: GIZMO_Y },
      { axis: 'z', color: GIZMO_Z },
    ];

    axes.forEach(({ axis, color }) => {
      // Shaft polyline
      push({
        id: `gizmo-${axis}-line`,
        polyline: {
          positions: new CallbackProperty(() => {
            const m = getSelected();
            if (!m) return [];
            const pos = getModelPos(m);
            const enu = getENUAxes(pos);
            const arm = getArmLength(viewer, pos);
            return [pos, getHandleTip(pos, axis, enu, arm)];
          }, false),
          width: 3,
          material: color,
          depthFailMaterial: color.withAlpha(0.25),
        },
      });

      // Handle point
      push({
        id: `gizmo-${axis}-handle`,
        position: new CallbackProperty(() => {
          const m = getSelected();
          if (!m) return new Cartesian3();
          const pos = getModelPos(m);
          const enu = getENUAxes(pos);
          const arm = getArmLength(viewer, pos);
          return getHandleTip(pos, axis, enu, arm);
        }, false),
        point: {
          pixelSize: HANDLE_PX,
          color,
          disableDepthTestDistance: Infinity,
          outlineColor: Color.WHITE,
          outlineWidth: 1,
        },
      });
    });
  };

  // ── Sync model entities when Redux models array changes ───────────────────
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    // Remove entities for deleted models
    modelEntityMap.current.forEach((entity, id) => {
      if (!models.find(m => m.id === id)) {
        viewer.entities.remove(entity);
        modelEntityMap.current.delete(id);
      }
    });

    // Create entities for new models
    models.forEach(model => {
      if (modelEntityMap.current.has(model.id)) return;

      const modelId = model.id; // stable capture for closures

      const entity = viewer.entities.add({
        id: `model-${modelId}`,
        position: new CallbackProperty(() => {
          const m = modelsRef.current.find(m => m.id === modelId);
          if (!m) return new Cartesian3();
          return Cartesian3.fromDegrees(m.lng, m.lat, m.height);
        }, false),
        orientation: new CallbackProperty(() => {
          const m = modelsRef.current.find(m => m.id === modelId);
          if (!m) return Quaternion.IDENTITY.clone();
          const pos = Cartesian3.fromDegrees(m.lng, m.lat, m.height);
          const hpr = new HeadingPitchRoll(
            CesiumMath.toRadians(m.heading),
            CesiumMath.toRadians(m.pitch),
            CesiumMath.toRadians(m.roll),
          );
          return Transforms.headingPitchRollQuaternion(pos, hpr);
        }, false),
        model: {
          uri: model.uri,
          scale: new CallbackProperty(() => {
            return modelsRef.current.find(m => m.id === modelId)?.scale ?? 1;
          }, false),
          show: new CallbackProperty(() => {
            return modelsRef.current.find(m => m.id === modelId)?.visible ?? true;
          }, false),
          minimumPixelSize: 32,
          maximumScale: 200000,
        },
      });

      modelEntityMap.current.set(modelId, entity);
    });

    viewer.scene.requestRender();
  }, [models]);

  // ── Rebuild gizmo when selection or transform mode changes ────────────────
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    clearGizmo(viewer);

    if (selectedModelId && transformMode === 'translate') {
      if (models.find(m => m.id === selectedModelId)) {
        buildTranslateGizmo(viewer);
      }
    }

    viewer.scene.requestRender();
  }, [selectedModelId, transformMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse interaction (mount once) ────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    const handler = new ScreenSpaceEventHandler(viewer.canvas);

    // LEFT_DOWN: begin drag on gizmo handle, or select a model entity
    handler.setInputAction((e: any) => {
      const picked = viewer.scene.pick(e.position);
      if (!picked?.id) return;

      // Resolve entity id string
      const entityId: string = typeof picked.id === 'string'
        ? picked.id
        : (picked.id?.id ?? '');

      if (entityId === 'gizmo-x-handle' ||
          entityId === 'gizmo-y-handle' ||
          entityId === 'gizmo-z-handle') {

        const axis = entityId[6] as 'x' | 'y' | 'z'; // 'gizmo-X-handle'
        const model = getSelected();
        if (!model) return;

        const pos = getModelPos(model);
        const ray = viewer.camera.getPickRay(e.position);
        if (!ray) return;

        let plane: Plane;
        if (axis === 'x' || axis === 'y') {
          const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(pos);
          plane = Plane.fromPointNormal(pos, normal);
          dragVerticalNormal.current = null;
        } else {
          const { up } = getENUAxes(pos);
          const vplane = buildVerticalDragPlane(pos, viewer.camera.direction, up);
          plane = vplane;
          dragVerticalNormal.current = Plane.clone(vplane).normal.clone();
        }

        const hit = IntersectionTests.rayPlane(ray, plane);
        if (!hit) return;

        dragAxisRef.current        = axis;
        dragInitialPos.current     = { lng: model.lng, lat: model.lat, height: model.height };
        dragInitialHit.current     = hit.clone();
        viewer.scene.screenSpaceCameraController.enableInputs = false;

      } else if (entityId.startsWith('model-')) {
        dispatch(selectModel(entityId.slice(6))); // 'model-' = 6 chars
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    // MOUSE_MOVE: apply constrained drag
    handler.setInputAction((e: any) => {
      if (!dragAxisRef.current || !dragInitialPos.current || !dragInitialHit.current) return;

      const init = dragInitialPos.current;
      const initialPos = Cartesian3.fromDegrees(init.lng, init.lat, init.height);
      const enu = getENUAxes(initialPos);

      const ray = viewer.camera.getPickRay(e.endPosition);
      if (!ray) return;

      let plane: Plane;
      if (dragAxisRef.current === 'x' || dragAxisRef.current === 'y') {
        const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(initialPos);
        plane = Plane.fromPointNormal(initialPos, normal);
      } else {
        if (!dragVerticalNormal.current) return;
        plane = Plane.fromPointNormal(initialPos, dragVerticalNormal.current);
      }

      const hit = IntersectionTests.rayPlane(ray, plane);
      if (!hit) return;

      // Delta from drag-start hit → project onto constrained axis
      Cartesian3.subtract(hit, dragInitialHit.current, _delta);

      const axisDir = dragAxisRef.current === 'x' ? enu.east
        : dragAxisRef.current === 'y' ? enu.north
        : enu.up;

      Cartesian3.clone(axisDir, _axisVec);
      const projDist = Cartesian3.dot(_delta, _axisVec);
      Cartesian3.multiplyByScalar(_axisVec, projDist, _projected);
      Cartesian3.add(initialPos, _projected, _newPos);

      const carto = Cartographic.fromCartesian(_newPos);
      const model = getSelected();
      if (!model) return;

      dispatch(updateModelTransform({
        id: model.id,
        lng:    CesiumMath.toDegrees(carto.longitude),
        lat:    CesiumMath.toDegrees(carto.latitude),
        height: carto.height,
      }));

      viewer.scene.requestRender();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // LEFT_UP: end drag
    handler.setInputAction(() => {
      if (dragAxisRef.current !== null) {
        dragAxisRef.current    = null;
        dragInitialPos.current = null;
        dragInitialHit.current = null;
        dragVerticalNormal.current = null;
        viewer.scene.screenSpaceCameraController.enableInputs = true;
      }
    }, ScreenSpaceEventType.LEFT_UP);

    return () => {
      handler.destroy();
      if (!viewer.isDestroyed()) {
        viewer.scene.screenSpaceCameraController.enableInputs = true;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Full cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed()) return;

      modelEntityMap.current.forEach(e => viewer.entities.remove(e));
      modelEntityMap.current.clear();

      gizmoEntities.current.forEach(e => viewer.entities.remove(e));
      gizmoEntities.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};
