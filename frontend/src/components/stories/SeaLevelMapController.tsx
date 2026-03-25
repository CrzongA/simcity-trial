import React, { useEffect, useRef, useState } from 'react';
import { useAppSelector } from '../../store';
import {
  Cartesian3, Color, CallbackProperty, Entity,
  ConstantProperty, PolygonHierarchy,
  Material, JulianDate, Event as CesiumEvent, buildModuleUrl
} from 'cesium';
import { getInterpolatedSeaLevel } from '../../lib/seaLevelData';
import { PORTSEA_POLYGON_COORDS } from '../../lib/consts';

// Cache static values outside the class — these never change
const WATER_NORMAL_MAP = buildModuleUrl('Assets/Textures/waterNormals.jpg');
const WATER_BLEND_COLOR = new Color(0.3, 0.6, 0.9, 0.3);

class WaterMaterialProperty {
  private _definitionChanged: CesiumEvent;
  private _opacityRef: React.MutableRefObject<number>;
  private _lastAlpha: number = -1;
  private _cachedColor: Color;

  constructor(opacityRef: React.MutableRefObject<number>) {
    this._definitionChanged = new CesiumEvent();
    this._opacityRef = opacityRef;
    this._cachedColor = new Color(0.1, 0.3, 0.65, Math.max(opacityRef.current, 0.1));
  }

  // isConstant=true: GPU shader handles animation; JS doesn't need per-frame updates
  get isConstant() { return true; }
  get definitionChanged() { return this._definitionChanged; }

  getType(_time: JulianDate): string {
    return Material.WaterType;
  }

  getValue(_time: JulianDate, result?: any): any {
    if (!result) result = {};
    const alpha = Math.max(this._opacityRef.current, 0.1);
    // Only update color object when opacity actually changed
    if (alpha !== this._lastAlpha) {
      this._lastAlpha = alpha;
      this._cachedColor = new Color(0.1, 0.3, 0.65, alpha);
    }
    result.baseWaterColor = this._cachedColor;
    result.blendColor = WATER_BLEND_COLOR;
    result.normalMap = WATER_NORMAL_MAP;
    result.frequency = 800.0;
    result.animationSpeed = 0.03;
    result.amplitude = 8.0;
    result.specularIntensity = 0.8;
    return result;
  }

  /** Call this when opacity changes so Cesium re-evaluates the material */
  notifyChange(): void {
    this._definitionChanged.raiseEvent(this);
  }

  equals(other: any): boolean {
    return this === other;
  }
}

interface Props {
  viewerRef: React.MutableRefObject<any>;
  baseHeight: number;
  waterOpacity: number;
}

export const SeaLevelMapController: React.FC<Props> = ({ viewerRef, baseHeight, waterOpacity }) => {
  const activeStory = useAppSelector(state => state.story.activeStory);
  const selectedYear = useAppSelector(state => state.seaLevel.selectedYear);
  const manualSeaLevelRise = useAppSelector(state => state.seaLevel.manualSeaLevelRise);

  const [floodHeight, setFloodHeight] = useState<number>(0);
  const [animatedFloodHeight, setAnimatedFloodHeight] = useState<number>(0);

  const animatedFloodHeightRef = useRef<number>(0);
  const waterOpacityRef = useRef<number>(waterOpacity);
  const baseHeightRef = useRef<number>(baseHeight);
  const waterEntityRef = useRef<Entity | null>(null);
  const waterMaterialRef = useRef<WaterMaterialProperty | null>(null);

  // Sync refs for Cesium Callbacks
  useEffect(() => {
    waterOpacityRef.current = waterOpacity;
    waterMaterialRef.current?.notifyChange();
  }, [waterOpacity]);
  useEffect(() => { baseHeightRef.current = baseHeight; }, [baseHeight]);

  // Calculate target flood height — manual override takes priority over year-based
  useEffect(() => {
    if (activeStory === 'sea-level-rise') {
      if (manualSeaLevelRise !== null) {
        setFloodHeight(parseFloat(manualSeaLevelRise.toFixed(2)));
      } else {
        const currentLevel = getInterpolatedSeaLevel(selectedYear);
        const riseMeters = Math.max(0, currentLevel - 6.952 + 1.1);
        setFloodHeight(parseFloat(riseMeters.toFixed(2)));
      }
    }
  }, [selectedYear, activeStory, manualSeaLevelRise]);

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
        waterMaterialRef.current = new WaterMaterialProperty(waterOpacityRef);
        waterEntityRef.current = viewer.entities.add({
          name: 'Flood Water (Story)',
          polygon: {
            hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
            height: new CallbackProperty(() => baseHeightRef.current, false),
            extrudedHeight: new CallbackProperty(
              () => baseHeightRef.current + animatedFloodHeightRef.current, false
            ),
            material: new WaterMaterialProperty(waterOpacityRef),
            outline: new ConstantProperty(false),
          }
        });
      }
    } else {
      if (waterEntityRef.current) {
        viewer.entities.remove(waterEntityRef.current);
        waterEntityRef.current = null;
        waterMaterialRef.current = null;
      }
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();

    // Cleanup on unmount
    return () => {
      if (waterEntityRef.current && viewer && !viewer.isDestroyed()) {
        viewer.entities.remove(waterEntityRef.current);
        waterEntityRef.current = null;
        waterMaterialRef.current = null;
        viewer.scene.requestRender();
      }
    };
  }, [activeStory, viewerRef]);

  return null; // Logic-only component for Cesium Imperative API
};
