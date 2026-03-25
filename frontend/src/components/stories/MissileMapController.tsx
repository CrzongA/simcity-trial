import React, { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  WEAPONS, addPinnedStrike, setIsPlacing, setSelectedWeaponId,
  updatePinnedStrikeBillboard, removePinnedStrike
} from '../../store/missileStrikeSlice';
import {
  Cartesian2, Cartesian3, Cartographic, Color, CallbackProperty,
  ScreenSpaceEventHandler, ScreenSpaceEventType, Entity,
  Math as CesiumMath, ColorMaterialProperty, ConstantProperty,
  SceneTransforms, Ellipsoid, Plane, IntersectionTests,
  sampleTerrainMostDetailed, HeightReference, PolylineDashMaterialProperty
} from 'cesium';

interface Props {
  viewerRef: React.MutableRefObject<any>;
}

export const MissileMapController: React.FC<Props> = ({ viewerRef }) => {
  const dispatch = useAppDispatch();
  const selectedWeaponId = useAppSelector(state => state.missileStrike.selectedWeaponId);
  const isPlacing = useAppSelector(state => state.missileStrike.isPlacing);
  const pinnedStrikes = useAppSelector(state => state.missileStrike.pinnedStrikes);

  const [draggingId, setDraggingId] = useState<string | null>(null);

  // REFS for high-performance direct DOM manipulation
  const billboardsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const hoverCartesianRef = useRef<Cartesian3 | null>(null);

  // Sync pinnedStrikes for CallbackProperty usage
  const pinnedStrikesRef = useRef(pinnedStrikes);
  useEffect(() => { pinnedStrikesRef.current = pinnedStrikes; }, [pinnedStrikes]);

  const pinnedEntitiesRef = useRef<{ strikeId: string; entities: Entity[] }[]>([]);

  // 1. Placement Handler (Cesium ScreenSpaceEvents)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    handlerRef.current = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handlerRef.current.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (!isPlacing) {
        hoverCartesianRef.current = null;
        return;
      }
      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (ray) {
        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        hoverCartesianRef.current = cartesian || null;
      }
      viewer.scene.requestRender();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handlerRef.current.setInputAction(() => {
      if (!isPlacing || !hoverCartesianRef.current || !selectedWeaponId) return;

      const carto = Cartographic.fromCartesian(hoverCartesianRef.current);
      const strikeId = Date.now().toString();
      const lng = CesiumMath.toDegrees(carto.longitude);
      const lat = CesiumMath.toDegrees(carto.latitude);

      sampleTerrainMostDetailed(viewer.terrainProvider, [carto]).then(updated => {
        const height = (updated && updated.length > 0 && updated[0].height !== undefined) ? updated[0].height : 0;

        dispatch(addPinnedStrike({
          id: strikeId,
          weaponId: selectedWeaponId,
          lng, lat, height,
          billboardLng: lng,
          billboardLat: lat,
          billboardHeight: 400
        }));
      });

      dispatch(setIsPlacing(false));
      dispatch(setSelectedWeaponId(''));
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handlerRef.current?.destroy();
      handlerRef.current = null;
    };
  }, [isPlacing, selectedWeaponId, viewerRef, dispatch]);

  // 2. Drag Handlers (React-based - identical to Location Billboard logic)
  const handleDragMove = (e: React.MouseEvent) => {
    if (!draggingId || !viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    const strike = pinnedStrikes.find(s => s.id === draggingId);
    if (!strike) return;

    const mousePos = new Cartesian2(e.clientX, e.clientY);
    const ray = viewer.camera.getPickRay(mousePos);
    if (!ray) return;

    const currentPos = Cartesian3.fromDegrees(strike.billboardLng, strike.billboardLat, strike.billboardHeight);
    const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(currentPos);
    const dragPlane = Plane.fromPointNormal(currentPos, normal);

    const newPos = IntersectionTests.rayPlane(ray, dragPlane);
    if (newPos) {
      const newCarto = Cartographic.fromCartesian(newPos);
      dispatch(updatePinnedStrikeBillboard({
        id: strike.id,
        lng: CesiumMath.toDegrees(newCarto.longitude),
        lat: CesiumMath.toDegrees(newCarto.latitude),
        height: newCarto.height
      }));
      viewer.scene.requestRender();
    }
  };

  const handleDragEnd = () => {
    if (draggingId) {
      setDraggingId(null);
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer) viewer.scene.screenSpaceCameraController.enableInputs = true;
    }
  };

  // 3. Render Entities (Domes + Polylines)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    // Clean up old entities
    const currentIds = new Set(pinnedStrikes.map(s => s.id));
    pinnedEntitiesRef.current = pinnedEntitiesRef.current.filter(pe => {
      if (!currentIds.has(pe.strikeId)) {
        pe.entities.forEach(e => viewer.entities.remove(e));
        return false;
      }
      return true;
    });

    // Add new entities (Domes + Connecting Polyline)
    pinnedStrikes.forEach(strike => {
      if (!pinnedEntitiesRef.current.some(pe => pe.strikeId === strike.id)) {
        const weapon = WEAPONS[strike.weaponId];
        if (!weapon) return;

        const groundPos = Cartesian3.fromDegrees(strike.lng, strike.lat, strike.height);
        const newEntities: Entity[] = [];

        // Blast Domes
        weapon.tiers.forEach(tier => {
          newEntities.push(viewer.entities.add({
            position: groundPos,
            ellipsoid: {
              radii: new Cartesian3(tier.radius, tier.radius, tier.radius),
              material: Color.fromCssColorString(tier.color),
              outline: false,
              maximumCone: CesiumMath.PI_OVER_TWO
            }
          }));
        });

        // ALIGNMENT FIX: Use Cesium Polyline with CallbackProperty for connecting line
        newEntities.push(viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const s = pinnedStrikesRef.current.find(x => x.id === strike.id);
              if (!s) return [];
              return [
                Cartesian3.fromDegrees(s.lng, s.lat, s.height),
                Cartesian3.fromDegrees(s.billboardLng, s.billboardLat, s.billboardHeight)
              ];
            }, false) as any,
            width: 1,
            material: new PolylineDashMaterialProperty({
              color: Color.fromCssColorString('#ff3c00').withAlpha(0.7),
              dashLength: 16
            })
          }
        }));

        pinnedEntitiesRef.current.push({ strikeId: strike.id, entities: newEntities });
      }
    });

    viewer.scene.requestRender();
  }, [pinnedStrikes, viewerRef]);

  // Handle Cursor Domes
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const ents: Entity[] = [];
    if (isPlacing && selectedWeaponId) {
      const weapon = WEAPONS[selectedWeaponId];
      weapon?.tiers.forEach(tier => {
        ents.push(viewer.entities.add({
          position: new CallbackProperty(() => hoverCartesianRef.current || Cartesian3.ZERO, false),
          show: new CallbackProperty(() => hoverCartesianRef.current !== null && isPlacing, false),
          ellipsoid: {
            radii: new ConstantProperty(new Cartesian3(tier.radius, tier.radius, tier.radius)),
            material: new ColorMaterialProperty(Color.fromCssColorString(tier.color).withAlpha(0.3)),
            maximumCone: CesiumMath.PI_OVER_TWO
          }
        }));
      });
    }
    return () => ents.forEach(e => viewer.entities.remove(e));
  }, [isPlacing, selectedWeaponId, viewerRef]);

  // 4. Update Billboard DOM transforms
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const updateBillboards = () => {
      pinnedStrikes.forEach(strike => {
        const div = billboardsRef.current.get(strike.id);
        if (!div) return;
        const pos = Cartesian3.fromDegrees(strike.billboardLng, strike.billboardLat, strike.billboardHeight);
        const winPos = SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
        if (winPos) {
          div.style.display = 'block';
          div.style.transform = `translate(-50%, -100%) translate(${winPos.x}px, ${winPos.y}px)`;
        } else {
          div.style.display = 'none';
        }
      });
    };

    const removeListener = viewer.scene.preRender.addEventListener(updateBillboards);
    return () => removeListener();
  }, [pinnedStrikes, viewerRef]);

  const handleDragStart = (id: string) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      setDraggingId(id);
    }
  };

  return (
    <div
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: draggingId ? 'auto' : 'none' }}
      onMouseMove={draggingId ? handleDragMove : undefined}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      {pinnedStrikes.map(strike => {
        const weapon = WEAPONS[strike.weaponId];
        const isDragging = draggingId === strike.id;

        return (
          <div
            key={strike.id}
            ref={el => { if (el) billboardsRef.current.set(strike.id, el); else billboardsRef.current.delete(strike.id); }}
            onMouseDown={() => handleDragStart(strike.id)}
            style={{
              position: 'absolute', top: 0, left: 0,
              zIndex: isDragging ? 50 : 40,
              background: 'rgba(16, 18, 23, 0.95)',
              border: isDragging ? '1px solid #ffcc00' : '1px solid #ff3c00',
              padding: '12px',
              fontFamily: '"Inter", sans-serif',
              pointerEvents: 'auto',
              borderRadius: '2px', // sharp
              minWidth: '220px',
              cursor: isDragging ? 'grabbing' : 'grab',
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              userSelect: 'none',
              display: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: '#fff', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {weapon?.name || 'Unknown Payload'}
                </strong>
                <span style={{ fontSize: '9px', color: 'rgba(255, 60, 0, 0.7)', letterSpacing: '0.5px' }}>DRAGGABLE HUD</span>
              </div>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => dispatch(removePinnedStrike(strike.id))}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(255, 60, 0, 0.2)', paddingTop: '8px' }}>
              {weapon?.tiers.map((tier, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#ff3c00' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tier.name}</span>
                  <span>{tier.radius >= 1000 ? `${(tier.radius / 1000).toFixed(1)}km` : `${tier.radius}m`}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
