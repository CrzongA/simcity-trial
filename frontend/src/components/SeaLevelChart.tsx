import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { setSelectedYear, setManualSeaLevelRise } from '../store/seaLevelSlice';
import { parseSeaLevelData } from '../lib/seaLevelData';

export const SeaLevelChart: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedYear = useAppSelector((state) => state.seaLevel.selectedYear);
  const manualSeaLevelRise = useAppSelector((state) => state.seaLevel.manualSeaLevelRise);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  // Parse data and calculate layout scales
  const data = useMemo(() => parseSeaLevelData(), []);

  const width = 320;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  if (data.length === 0) return null;

  const minYear = data[0].year;
  const maxYear = data[data.length - 1].year;
  const minVal = Math.min(...data.map(d => d.val));
  const maxVal = Math.max(...data.map(d => d.val));

  // Extend Y axis slightly for padding
  const yDomainMin = Math.floor(minVal * 10) / 10 - 0.1;
  const yDomainMax = Math.ceil(maxVal * 10) / 10 + 0.1;

  // Scales
  const getX = (year: number) => ((year - minYear) / (maxYear - minYear)) * innerWidth;
  const getY = (val: number) => innerHeight - ((val - yDomainMin) / (yDomainMax - yDomainMin)) * innerHeight;

  // Split paths into historical vs projected
  const historicalPoints = data.filter(d => d.isHistorical);
  const projectedPoints = data.filter(d => !d.isHistorical);

  // Connect the last historical to the first projected to avoid a gap
  if (historicalPoints.length > 0 && projectedPoints.length > 0) {
    projectedPoints.unshift(historicalPoints[historicalPoints.length - 1]);
  }

  const toPathStr = (points: typeof data) => {
    if (points.length === 0) return '';
    const start = points[0];
    let str = `M ${getX(start.year)},${getY(start.val)}`;
    for (let i = 1; i < points.length; i++) {
      str += ` L ${getX(points[i].year)},${getY(points[i].val)}`;
    }
    return str;
  };

  const historicalPath = toPathStr(historicalPoints);
  const projectedPath = toPathStr(projectedPoints);

  const selectedX = getX(selectedYear);
  const currentVal = data.find(d => d.year === selectedYear)?.val || 0;

  // Handle interaction for dragging
  const handlePointerInteraction = (e: React.PointerEvent<SVGSVGElement> | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    let ratio = x / innerWidth;
    ratio = Math.max(0, Math.min(1, ratio));
    const rawYear = minYear + ratio * (maxYear - minYear);
    // snap to nearest integer year
    dispatch(setSelectedYear(Math.round(rawYear)));
  };

  useEffect(() => {
    const onPointerUp = () => setIsDragging(false);
    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) {
        handlePointerInteraction(e);
      }
    };

    if (isDragging) {
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointermove', onPointerMove);
    }
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [isDragging]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: 20,
        transform: 'translateY(-50%)',
        zIndex: 50,
        background: '#101217',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '16px',
        width: `${width + 32}px`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        borderRadius: '2px', // Sharp
        fontFamily: '"Inter", "system-ui", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>SEA LEVEL PROJECTION</span>
        <span style={{ color: '#00ffcc', fontSize: '18px', fontWeight: 700 }}>{selectedYear}</span>
      </div>

      <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '16px', lineHeight: 1.4 }}>
        Mean Sea Level relative to datum. Drag the vertical line to simulate conditions from 1960 to 2160.
      </div>

      <div ref={containerRef} style={{ position: 'relative', width, height }}>
        <svg
          width={width}
          height={height}
          style={{ overflow: 'visible', cursor: 'ew-resize' }}
          onPointerDown={(e) => {
            setIsDragging(true);
            handlePointerInteraction(e);
          }}
        >
          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Grid Lines */}
            {[yDomainMin, yDomainMin + 0.5, yDomainMin + 1, yDomainMin + 1.5, yDomainMin + 2, yDomainMin + 2.5, yDomainMin + 3].map((yVal, i) => {
              if (yVal > yDomainMax) return null;
              const yPos = getY(yVal);
              return (
                <g key={`ygrid-${i}`}>
                  <line x1={0} y1={yPos} x2={innerWidth} y2={yPos} stroke="rgba(255,255,255,0.05)" />
                  <text x={-8} y={yPos + 4} fill="#666" fontSize="10px" textAnchor="end">{yVal.toFixed(1)}m</text>
                </g>
              );
            })}

            {/* X axis labels */}
            {[1960, 2000, 2050, 2100, 2150].map((xVal) => (
              <text key={`xgrid-${xVal}`} x={getX(xVal)} y={innerHeight + 16} fill="#666" fontSize="10px" textAnchor="middle">
                {xVal}
              </text>
            ))}

            {/* Historical Line */}
            <path
              d={historicalPath}
              fill="none"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={2}
            />

            {/* Projected Line */}
            <path
              d={projectedPath}
              fill="none"
              // Bright acid green / yellow for projection
              stroke="#ccff00"
              strokeWidth={2}
              strokeDasharray="4 4"
            />

            {/* Draggable Vertical Timeline */}
            <line
              x1={selectedX}
              y1={0}
              x2={selectedX}
              y2={innerHeight}
              stroke="#00ffcc"
              strokeWidth={1.5}
            />

            {/* Value Indicator Dot */}
            <circle
              cx={selectedX}
              cy={getY(currentVal || minVal)}
              r={4}
              fill="#101217"
              stroke="#00ffcc"
              strokeWidth={2}
            />
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', background: 'rgba(255,255,255,0.8)' }}></div>
          <span style={{ fontSize: '10px', color: '#888' }}>Historical</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '2px', borderTop: '2px dashed #ccff00' }}></div>
          <span style={{ fontSize: '10px', color: '#888' }}>RCP 8.5 Projection</span>
        </div>
      </div>

      {/* Manual Override */}
      <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
        <button
          onClick={() => {
            const next = !overrideOpen;
            setOverrideOpen(next);
            if (!next) dispatch(setManualSeaLevelRise(null));
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, color: manualSeaLevelRise !== null ? '#00ffcc' : '#888',
          }}
        >
          <span style={{ fontSize: '11px', letterSpacing: '0.5px', fontFamily: 'inherit' }}>
            MANUAL OVERRIDE{manualSeaLevelRise !== null ? ` — ${manualSeaLevelRise.toFixed(2)}m rise` : ''}
          </span>
          <span style={{ fontSize: '10px' }}>{overrideOpen ? '▲' : '▼'}</span>
        </button>

        {overrideOpen && (
          <div style={{ marginTop: '10px' }}>
            <input
              type="range"
              min={0} max={10} step={0.01}
              value={manualSeaLevelRise ?? 0}
              onChange={(e) => dispatch(setManualSeaLevelRise(parseFloat(e.target.value)))}
              style={{ width: '100%', accentColor: '#00ffcc', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: '#555' }}>0 m</span>
              <span style={{ fontSize: '10px', color: '#555' }}>10 m</span>
            </div>
            {manualSeaLevelRise !== null && (
              <button
                onClick={() => dispatch(setManualSeaLevelRise(null))}
                style={{
                  marginTop: '8px', width: '100%', background: 'none',
                  border: '1px solid rgba(255,255,255,0.1)', color: '#888',
                  fontSize: '10px', padding: '4px', cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.5px',
                }}
              >
                CLEAR — RETURN TO YEAR PROJECTION
              </button>
            )}
          </div>
        )}
      </div>

      {/* Data Source Footnote */}
      <div style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: '9px',
        color: '#666',
        lineHeight: 1.4
      }}>
        <div>
          Historical data: <a href="https://psmsl.org/data/obtaining/stations/350.php" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>NOC PSMSL</a>
        </div>
        <div style={{ marginTop: '2px' }}>
          Projections: <a href="https://data.ceda.ac.uk/badc/ukcp18/data/marine-sim/ext-sea-lev-expl" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>CEDA UKCP18</a>
        </div>
      </div>
    </div>
  );
};
