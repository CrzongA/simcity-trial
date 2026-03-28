import React, { useEffect, useRef } from 'react';
import { Cartesian3, SceneTransforms, HeadingPitchRange, Color, Math as CesiumMath, BoundingSphere } from 'cesium';
import { useAppDispatch, useAppSelector } from '../../store';
import { setReports, setSelectedReportId, closeForm, PREDEFINED_TAGS, type CommunityReport } from '../../store/communityReportSlice';

interface Props {
  viewerRef: React.MutableRefObject<any>;
}

export const CommunityReportMapController: React.FC<Props> = ({ viewerRef }) => {
  const dispatch = useAppDispatch();
  const activeStory = useAppSelector(state => state.story.activeStory);
  const reports = useAppSelector(state => state.communityReport.reports);
  const selectedReportId = useAppSelector(state => state.communityReport.selectedReportId);
  const isFormOpen = useAppSelector(state => state.communityReport.isFormOpen);

  const billboardsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Data fetching
  useEffect(() => {
    if (activeStory !== 'community-reports') return;

    fetch('http://localhost:3001/api/reports')
      .then(res => res.json())
      .then(data => {
        if (data.reports) dispatch(setReports(data.reports));
      })
      .catch(() => {
        fetch('/api/reports')
          .then(res => res.json())
          .then(data => { if (data.reports) dispatch(setReports(data.reports)); })
          .catch(e => console.error("Failed to fetch reports", e));
      });
  }, [activeStory, dispatch, isFormOpen]);

  // Positioning logic via preRender
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const updatePositions = () => {
      if (activeStory !== 'community-reports') return;

      billboardsRef.current.forEach((el, id) => {
        if (!el) return;
        const report = reports.find(r => r.id === id);
        if (!report) {
          el.style.display = 'none';
          return;
        }

        // Hover 20m above ground
        const pos = Cartesian3.fromDegrees(report.lng, report.lat, report.height + 20);
        const winPos = SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);

        if (winPos) {
          el.style.display = 'flex';
          el.style.transform = `translate(-50%, -50%) translate(${winPos.x}px, ${winPos.y}px)`;
        } else {
          el.style.display = 'none';
        }
      });
    };

    const removeListener = viewer.scene.preRender.addEventListener(updatePositions);
    return () => removeListener();
  }, [viewerRef, reports, activeStory]);

  // Fly to selected report
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !selectedReportId) return;

    const report = reports.find(r => r.id === selectedReportId);
    if (report) {
      const pos = Cartesian3.fromDegrees(report.lng, report.lat, report.height + 20);
      viewer.camera.flyToBoundingSphere(new BoundingSphere(pos, 0), {
        duration: 1.5,
        offset: new HeadingPitchRange(CesiumMath.toRadians(-15), CesiumMath.toRadians(-35), 400)
      });
    }
  }, [viewerRef, selectedReportId, reports]);

  if (activeStory !== 'community-reports') return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 5,
      overflow: 'hidden'
    }}>
      {reports.map((report) => (
        <CommunityReportBillboard
          key={report.id}
          report={report}
          isSelected={selectedReportId === report.id}
          onClick={() => {
            dispatch(setSelectedReportId(report.id));
            dispatch(closeForm());
          }}
          billboardRef={(el) => {
            if (el) billboardsRef.current.set(report.id, el);
            else billboardsRef.current.delete(report.id);
          }}
        />
      ))}
    </div>
  );
};

// --- Sub-component for individual billboards ---

interface BillboardProps {
  report: CommunityReport;
  isSelected: boolean;
  onClick: () => void;
  billboardRef: (el: HTMLDivElement | null) => void;
}

const CommunityReportBillboard: React.FC<BillboardProps> = ({ report, isSelected, onClick, billboardRef }) => {
  const tagLabel = report.tags[0];
  const tagObj = PREDEFINED_TAGS.find(t => t.label === tagLabel);
  const emoji = tagObj ? tagObj.emoji : '📌';

  return (
    <div
      ref={billboardRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        cursor: 'pointer',
        background: isSelected ? '#ffffff' : 'rgba(25, 25, 25, 0.9)',
        border: isSelected ? '2px solid #00ffcc' : '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '50%',
        width: isSelected ? '48px' : '40px',
        height: isSelected ? '48px' : '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isSelected ? '24px' : '20px',
        boxShadow: isSelected ? '0 0 20px rgba(0, 255, 204, 0.6)' : '0 4px 12px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: isSelected ? 10 : 1,
      }}
    >
      <span style={{ filter: isSelected ? 'none' : 'grayscale(30%)' }}>
        {emoji}
      </span>

      {/* Selection indicator ring */}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          border: '2px solid #00ffcc',
          borderRadius: '50%',
          opacity: 0.5,
          animation: 'pulse 2s infinite'
        }} />
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.2; }
          100% { transform: scale(1); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
