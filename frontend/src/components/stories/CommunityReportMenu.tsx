import React from 'react';
import { useAppSelector, useAppDispatch } from '../../store';
import { setSelectedReportId, PREDEFINED_TAGS } from '../../store/communityReportSlice';

export const CommunityReportMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const reports = useAppSelector(state => state.communityReport.reports);
  const selectedReportId = useAppSelector(state => state.communityReport.selectedReportId);
  const isFormOpen = useAppSelector(state => state.communityReport.isFormOpen);

  if (isFormOpen) return null;

  const selectedReport = reports.find(r => r.id === selectedReportId);

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      width: '320px',
      maxHeight: 'calc(100vh - 140px)',
      background: 'rgba(25, 25, 25, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '4px',
      color: '#fff',
      zIndex: 100,
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      fontFamily: '"Inter", "system-ui", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '20px 20px 10px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#00ffcc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🗑️</span> Community Reports
        </h2>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#aaaaaa', lineHeight: 1.4 }}>
          Right-click anywhere on the map to create a new report. View existing reports by clicking their markers.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {selectedReport ? (
          <div>
            <button 
              onClick={() => dispatch(setSelectedReportId(null))}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginBottom: '16px' }}
            >
              ← Back to list
            </button>
            
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px', fontFamily: 'monospace' }}>
              ID: {selectedReport.id.substring(0,8)}...
              <br/>
              Date: {new Date(selectedReport.createdAt).toLocaleString()}
            </div>
            
            <p style={{ fontSize: '14px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              {selectedReport.description}
            </p>

            {selectedReport.tags && selectedReport.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {selectedReport.tags.map((tagLabel, idx) => {
                  const preset = PREDEFINED_TAGS.find(t => t.label === tagLabel);
                  return (
                    <span key={idx} style={{ background: 'rgba(0,255,204,0.1)', color: '#00ffcc', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', border: '1px solid rgba(0,255,204,0.3)', display:'flex', alignItems:'center', gap:'4px' }}>
                      <span>{preset ? preset.emoji : '📌'}</span> {tagLabel}
                    </span>
                  );
                })}
              </div>
            )}

            {selectedReport.image && (
              <div style={{ width: '100%', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <img src={selectedReport.image} alt="Report attachment" style={{ width: '100%', display: 'block' }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#ccc' }}>Recent Submissions ({reports.length})</h3>
            {reports.length === 0 && (
              <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>No reports found.</div>
            )}
            {reports.map((report) => {
              const tagLabel = report.tags?.[0];
              const preset = PREDEFINED_TAGS.find(t => t.label === tagLabel);
              return (
                <div 
                  key={report.id}
                  onClick={() => dispatch(setSelectedReportId(report.id))}
                  style={{
                    padding: '12px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '16px' }}>{preset ? preset.emoji : '📌'}</div>
                    <div style={{ fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {report.description}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginLeft: '24px' }}>
                    {new Date(report.createdAt).toLocaleDateString()} • {tagLabel || 'Report'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
