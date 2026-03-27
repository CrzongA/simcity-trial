import React, { useRef } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  Math as CesiumMath,
} from 'cesium';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  addModel,
  removeModel,
  selectModel,
  toggleModelVisibility,
  updateModelTransform,
  setTransformMode,
  PlacedModel,
  TransformMode,
} from '../../store/modelDesignSlice';

interface ModelDesignMenuProps {
  viewerRef: React.MutableRefObject<any>;
}

const LABEL: React.CSSProperties = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '4px',
  display: 'block',
};

const modeBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '6px 0',
  background: active ? 'rgba(0, 255, 204, 0.15)' : 'transparent',
  border: active ? '1px solid #00ffcc' : '1px solid rgba(255,255,255,0.2)',
  color: active ? '#00ffcc' : '#aaa',
  fontSize: '12px',
  cursor: 'pointer',
  borderRadius: '2px',
  fontFamily: 'inherit',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  transition: 'all 0.15s',
});

export const ModelDesignMenu: React.FC<ModelDesignMenuProps> = ({ viewerRef }) => {
  const dispatch = useAppDispatch();
  const { models, selectedModelId, transformMode } = useAppSelector(s => s.modelDesign);
  const selectedModel = models.find(m => m.id === selectedModelId) ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const uri = URL.createObjectURL(file);

    let lng = -1.1088;
    let lat = 50.7954;
    let height = 5;

    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && !viewer.isDestroyed()) {
      const canvas = viewer.canvas;
      const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      // Try to pick an actual scene position (works with photorealistic tiles)
      const pickedPos = viewer.scene.pickPosition(center);
      if (pickedPos && Cartesian3.magnitude(pickedPos) > 0) {
        const carto = Cartographic.fromCartesian(pickedPos);
        lng = CesiumMath.toDegrees(carto.longitude);
        lat = CesiumMath.toDegrees(carto.latitude);
        height = carto.height;
      } else {
        // Fallback: project camera position down to near-ground
        const camCarto = Cartographic.fromCartesian(viewer.camera.position);
        lng = CesiumMath.toDegrees(camCarto.longitude);
        lat = CesiumMath.toDegrees(camCarto.latitude);
        height = Math.max(0, camCarto.height - 100);
      }
    }

    const model: PlacedModel = {
      id: Date.now().toString(),
      name: file.name.replace(/\.[^/.]+$/, ''),
      uri,
      lng,
      lat,
      height,
      heading: 0,
      pitch: 0,
      roll: 0,
      scale: 1,
      visible: true,
    };

    dispatch(addModel(model));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFocusCamera = () => {
    if (!selectedModel) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    const entity = viewer.entities.getById(`model-${selectedModel.id}`);
    if (entity) {
      viewer.flyTo(entity, {
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(0),
          CesiumMath.toRadians(-25),
          0, // range=0 → Cesium auto-computes from bounding sphere
        ),
        duration: 1.5,
      });
    }
  };

  const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: '#00ffcc',
    cursor: 'pointer',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      width: '256px',
      background: '#101217',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '2px',
      padding: '16px',
      zIndex: 50,
      fontFamily: '"Inter", "system-ui", sans-serif',
      color: '#fff',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>
      {/* Header */}
      <span style={{
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '1px',
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
      }}>
        Design Portsmouth
      </span>

      {/* Upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '100%',
            padding: '8px',
            background: 'rgba(0,255,204,0.08)',
            border: '1px solid rgba(0,255,204,0.35)',
            color: '#00ffcc',
            fontSize: '12px',
            cursor: 'pointer',
            borderRadius: '2px',
            fontFamily: 'inherit',
            letterSpacing: '0.05em',
            transition: 'background 0.15s',
          }}
        >
          + Upload GLB / GLTF Model
        </button>
      </div>

      {/* Model list */}
      {models.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={LABEL}>Models ({models.length})</span>
          {models.map(model => {
            const isSelected = model.id === selectedModelId;
            return (
              <div
                key={model.id}
                onClick={() => dispatch(selectModel(model.id))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  background: isSelected ? 'rgba(0,255,204,0.08)' : 'rgba(255,255,255,0.02)',
                  border: isSelected ? '1px solid rgba(0,255,204,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: '13px',
                  flex: 1,
                  color: isSelected ? '#00ffcc' : '#ccc',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {model.name}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); dispatch(toggleModelVisibility(model.id)); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: model.visible ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                    padding: '2px 4px',
                    fontSize: '12px',
                    lineHeight: 1,
                  }}
                  title={model.visible ? 'Hide' : 'Show'}
                >
                  {model.visible ? '●' : '○'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); dispatch(removeModel(model.id)); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,80,80,0.6)',
                    padding: '2px 4px',
                    fontSize: '12px',
                    lineHeight: 1,
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Transform controls — only when a model is selected */}
      {selectedModel && (
        <>
          {/* Mode toggle */}
          <div>
            <span style={LABEL}>Transform</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['translate', 'rotate', 'scale'] as TransformMode[]).map(mode => (
                <button
                  key={mode}
                  style={modeBtn(transformMode === mode)}
                  onClick={() => dispatch(setTransformMode(mode))}
                >
                  {mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'}
                </button>
              ))}
            </div>
          </div>

          {/* Translate hint */}
          {transformMode === 'translate' && (
            <div>
              <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '6px',
              }}>
                {[
                  { color: '#ff4444', label: 'East' },
                  { color: '#44ff44', label: 'North' },
                  { color: '#4488ff', label: 'Up' },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, display: 'block' }}>
                Drag the coloured handles in the scene to reposition the model.
              </span>
            </div>
          )}

          {/* Rotate sliders */}
          {transformMode === 'rotate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                { key: 'heading' as const, label: 'Heading', min: -180, max: 180, unit: '°' },
                { key: 'pitch'   as const, label: 'Pitch',   min: -90,  max: 90,  unit: '°' },
                { key: 'roll'    as const, label: 'Roll',    min: -180, max: 180, unit: '°' },
              ]).map(({ key, label, min, max, unit }) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={LABEL}>{label}</span>
                    <span style={{ fontSize: '12px', color: '#00ffcc' }}>
                      {Math.round(selectedModel[key])}{unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={selectedModel[key]}
                    onChange={e =>
                      dispatch(updateModelTransform({ id: selectedModel.id, [key]: Number(e.target.value) }))
                    }
                    style={sliderStyle}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Scale slider */}
          {transformMode === 'scale' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={LABEL}>Scale</span>
                <span style={{ fontSize: '11px', color: '#00ffcc' }}>
                  {selectedModel.scale < 10
                    ? selectedModel.scale.toFixed(2)
                    : Math.round(selectedModel.scale)}×
                </span>
              </div>
              <input
                type="range"
                min={0.01}
                max={100}
                step={0.01}
                value={selectedModel.scale}
                onChange={e =>
                  dispatch(updateModelTransform({ id: selectedModel.id, scale: Number(e.target.value) }))
                }
                style={sliderStyle}
              />
              <button
                onClick={() => dispatch(updateModelTransform({ id: selectedModel.id, scale: 1 }))}
                style={{
                  marginTop: '6px',
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '11px',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  letterSpacing: '0.05em',
                }}
              >
                Reset to 1×
              </button>
            </div>
          )}

          {/* Focus camera */}
          <button
            onClick={handleFocusCamera}
            style={{
              width: '100%',
              padding: '6px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '2px',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Focus Camera on Model
          </button>
        </>
      )}

      {/* Empty state */}
      {models.length === 0 && (
        <span style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.25)',
          textAlign: 'center',
          lineHeight: 1.7,
          display: 'block',
        }}>
          Upload a GLB model to start designing your Portsmouth.
        </span>
      )}
    </div>
  );
};
