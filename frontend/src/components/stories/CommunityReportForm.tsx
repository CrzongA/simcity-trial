import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { closeForm, addReport, setSelectedReportId, PREDEFINED_TAGS } from '../../store/communityReportSlice';

export const CommunityReportForm: React.FC = () => {
  const dispatch = useAppDispatch();
  const formLocation = useAppSelector(state => state.communityReport.formLocation);
  
  const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('community-activity');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!formLocation) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // client-side downscale
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // compress to jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setImageBase64(dataUrl);
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    
    const activeTagLabel = PREDEFINED_TAGS.find(t => t.id === selectedTag)?.label || 'Community Activity';
    const tagArray = [activeTagLabel];

    const payload = {
      lat: formLocation.lat,
      lng: formLocation.lng,
      height: formLocation.height,
      cartesian: formLocation.cartesian,
      description,
      tags: tagArray,
      image: imageBase64,
    };

    try {
        let url = 'http://localhost:3001/api/reports';
        try {
            const tempRes = await fetch(url, { method: 'OPTIONS' });
        } catch {
            url = '/api/reports';
        }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (data.report) {
        dispatch(addReport(data.report));
        dispatch(closeForm());
        dispatch(setSelectedReportId(data.report.id));
      }
    } catch (err) {
      console.error("Failed to submit report", err);
      alert("Failed to create report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      width: '320px',
      background: 'rgba(25, 25, 25, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '20px',
      color: '#fff',
      zIndex: 100,
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
      fontFamily: '"Inter", "system-ui", sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Create Report</h3>
        <button 
          onClick={() => dispatch(closeForm())}
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '18px' }}
        >×</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Description *</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff',
              padding: '8px',
              borderRadius: '4px',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
            placeholder="What needs to be reported?"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>Category *</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PREDEFINED_TAGS.map(tag => {
              const isActive = selectedTag === tag.id;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTag(tag.id)}
                  style={{
                    background: isActive ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255,255,255,0.05)',
                    border: isActive ? '1px solid #00ffcc' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: isActive ? '#00ffcc' : '#ccc',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{tag.emoji}</span>
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
           <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>Attach Image</label>
           <input 
             type="file" 
             accept="image/*"
             onChange={handleImageUpload}
             style={{ fontSize: '12px', color: '#ccc' }}
           />
           {imageBase64 && (
             <div style={{ marginTop: '8px', width: '100%', height: '120px', borderRadius: '4px', overflow: 'hidden' }}>
               <img src={imageBase64} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
             </div>
           )}
        </div>

        <button 
          type="submit"
          disabled={isSubmitting || !description.trim()}
          style={{
            marginTop: '8px',
            background: '#00ffcc',
            color: '#000',
            border: 'none',
            padding: '10px',
            borderRadius: '4px',
            fontWeight: 600,
            cursor: (isSubmitting || !description.trim()) ? 'not-allowed' : 'pointer',
            opacity: (isSubmitting || !description.trim()) ? 0.5 : 1
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
};
