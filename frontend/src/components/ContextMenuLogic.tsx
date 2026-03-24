import React, { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import {
  Color,
  HeightReference,
  SceneTransforms,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  CameraEventType,
  CallbackProperty
} from 'cesium';
import type { BillboardData } from './CityMap';

// Subcomponent to guarantee execution strictly after the Viewer has fully initialized
export const ContextMenuLogic = ({
  setContextMenu,
  billboards,
  billboardsRef,
}: {
  setContextMenu: any;
  billboards: BillboardData[];
  billboardsRef: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
}) => {
  const { viewer } = useCesium();

  const billboardsRefState = useRef<BillboardData[]>(billboards);
  useEffect(() => { billboardsRefState.current = billboards; }, [billboards]);

  // Draw Lines and Points Imperatively
  useEffect(() => {
    if (!viewer) return;

    const entities: any[] = [];
    billboards.forEach(b => {
      const entity = viewer.entities.add({
        id: `line-${b.id}`,
        // Use CallbackProperty so the visual updates smoothly during drag
        position: new CallbackProperty(() => {
          const current = billboardsRefState.current.find((x: BillboardData) => x.id === b.id);
          return current?.surfaceCartesian || b.surfaceCartesian;
        }, false) as any,
        polyline: {
          positions: new CallbackProperty(() => {
            const current = billboardsRefState.current.find((x: BillboardData) => x.id === b.id);
            if (!current) return [b.cartesian, b.surfaceCartesian];
            return [current.cartesian, current.surfaceCartesian];
          }, false) as any,
          width: 4,
          material: Color.fromCssColorString('#00ffcc').withAlpha(0.7),
          depthFailMaterial: Color.fromCssColorString('#00ffcc').withAlpha(0.7),
        },
        point: {
          pixelSize: 12,
          color: Color.fromCssColorString('#00ffcc'),
          outlineColor: Color.fromCssColorString('#00ffcc').withAlpha(0.5),
          outlineWidth: 6,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        }
      });
      entities.push(entity);
    });

    // Request render to make them appear instantly
    viewer.scene.requestRender();

    return () => {
      entities.forEach((e: any) => viewer.entities.remove(e));
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    };
  }, [viewer, billboards]);

  // Close context menu on camera move
  useEffect(() => {
    if (!viewer) return;
    const hideMenu = () => setContextMenu((prev: any) => prev.show ? { ...prev, show: false } : prev);
    viewer.camera.moveStart.addEventListener(hideMenu);
    return () => {
      if (!viewer.isDestroyed()) viewer.camera.moveStart.removeEventListener(hideMenu);
    };
  }, [viewer, setContextMenu]);

  // Update Billboard Positions every render frame
  useEffect(() => {
    if (!viewer) return;
    const updateBillboards = () => {
      billboards.forEach(b => {
        const el = billboardsRef.current.get(b.id);
        if (el) {
          const screenPos = SceneTransforms.worldToWindowCoordinates(viewer.scene, b.cartesian);
          if (screenPos) {
            el.style.display = 'block';
            el.style.transform = `translate(-50%, -100%) translate(${screenPos.x}px, ${screenPos.y - 15}px)`;
          } else {
            el.style.display = 'none'; // Culled or behind camera
          }
        }
      });
    };
    const removeListener = viewer.scene.preRender.addEventListener(updateBillboards);
    return () => removeListener();
  }, [viewer, billboards, billboardsRef]);

  // Event Listeners for the Context Menu
  useEffect(() => {
    if (!viewer) return;

    // Remove default Right-Click Camera functions so they don't fight our menu
    viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      CameraEventType.WHEEL, CameraEventType.PINCH
    ];

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: any) => {
      let pickedPosition = undefined;
      if (viewer.scene.pickPositionSupported) {
        pickedPosition = viewer.scene.pickPosition(movement.position);
      }

      // Fallback
      if (!pickedPosition) {
        const ray = viewer.camera.getPickRay(movement.position);
        if (ray) {
          pickedPosition = viewer.scene.globe.pick(ray, viewer.scene);
        }
      }

      console.log("Right click mapped coordinates:", movement.position, '->', pickedPosition);

      if (pickedPosition) {
        setContextMenu({
          show: true,
          x: movement.position.x,
          y: movement.position.y,
          cartesian: pickedPosition
        });
        setTimeout(() => { if (!viewer.isDestroyed()) viewer.scene.requestRender(); }, 10);
      } else {
        console.warn("CityMap: Right click coordinates could not resolve to a 3D position.");
      }
    }, ScreenSpaceEventType.RIGHT_CLICK);

    const handleLeftClick = () => {
      setContextMenu((prev: any) => prev.show ? { ...prev, show: false } : prev);
      setTimeout(() => { if (!viewer.isDestroyed()) viewer.scene.requestRender(); }, 50);
    };

    handler.setInputAction(handleLeftClick, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
    };
  }, [viewer, setContextMenu]);

  return null;
};
