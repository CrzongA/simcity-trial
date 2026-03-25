import React, { useEffect, useRef, useState } from 'react';
import { useAppSelector } from '../../store';
import {
  Cartesian3, Color, CallbackProperty, Entity,
  ColorMaterialProperty, ConstantProperty, PolygonHierarchy
} from 'cesium';
import { getInterpolatedSeaLevel } from '../../lib/seaLevelData';
import { PORTSEA_POLYGON_COORDS } from '../../lib/consts';

interface Props {
  viewerRef: React.MutableRefObject<any>;
  baseHeight: number;
  waterOpacity: number;
}

export const SeaLevelMapController: React.FC<Props> = ({ viewerRef, baseHeight, waterOpacity }) => {
  const activeStory = useAppSelector(state => state.story.activeStory);
  const selectedYear = useAppSelector(state => state.story.selectedYear);

  const [floodHeight, setFloodHeight] = useState<number>(0);
  const [animatedFloodHeight, setAnimatedFloodHeight] = useState<number>(0);

  const animatedFloodHeightRef = useRef<number>(0);
  const waterOpacityRef = useRef<number>(waterOpacity);
  const baseHeightRef = useRef<number>(baseHeight);
  const waterEntityRef = useRef<Entity | null>(null);

  // Sync refs for Cesium Callbacks
  useEffect(() => { waterOpacityRef.current = waterOpacity; }, [waterOpacity]);
  useEffect(() => { baseHeightRef.current = baseHeight; }, [baseHeight]);

  // Calculate target flood height based on selected year
  useEffect(() => {
    if (activeStory === 'sea-level-rise') {
      const currentLevel = getInterpolatedSeaLevel(selectedYear);
      const riseMeters = Math.max(0, currentLevel - 6.952 + 1.1);
      setFloodHeight(parseFloat(riseMeters.toFixed(2)));
    }
  }, [selectedYear, activeStory]);

  // Smooth animation for floodHeight
  useEffect(() => {
    let animationFrame: number;
    const startTime = performance.now();
    const duration = 1000;
    const startHeight = animatedFloodHeight;
    const targetHeight = floodHeight;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentHeight = startHeight + (targetHeight - startHeight) * easedProgress;
      setAnimatedFloodHeight(currentHeight);
      animatedFloodHeightRef.current = currentHeight;

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [floodHeight]);

  // Request render on animated height change
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && !viewer.isDestroyed() && activeStory === 'sea-level-rise') {
      viewer.scene.requestRender();
    }
  }, [animatedFloodHeight, activeStory, viewerRef]);

  // Reconcile Entity with Active Story State
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    if (activeStory === 'sea-level-rise') {
      if (!waterEntityRef.current) {
        const positions = Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat());
        waterEntityRef.current = viewer.entities.add({
          name: 'Flood Water (Story)',
          polygon: {
            hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
            height: new CallbackProperty(() => baseHeightRef.current, false),
            extrudedHeight: new CallbackProperty(
              () => baseHeightRef.current + animatedFloodHeightRef.current, false
            ),
            material: new ColorMaterialProperty(
              new CallbackProperty(
                () => Color.NAVY.withAlpha(Math.max(waterOpacityRef.current, 0.1)), false
              )
            ),
            outline: new ConstantProperty(false),
          }
        });
      }
    } else {
      if (waterEntityRef.current) {
        viewer.entities.remove(waterEntityRef.current);
        waterEntityRef.current = null;
      }
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();

    // Cleanup on unmount
    return () => {
      if (waterEntityRef.current && viewer && !viewer.isDestroyed()) {
        viewer.entities.remove(waterEntityRef.current);
        waterEntityRef.current = null;
        viewer.scene.requestRender();
      }
    };
  }, [activeStory, viewerRef]);

  return null; // Logic-only component for Cesium Imperative API
};
