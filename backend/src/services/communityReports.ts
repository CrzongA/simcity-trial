import fs from 'fs';
import path from 'path';

export interface CommunityReport {
  id: string;
  lat: number;
  lng: number;
  height: number;
  cartesian: { x: number; y: number; z: number };
  description: string;
  tags: string[];
  image: string | null; // base64
  createdAt: string;
}

const dataDir = path.join(__dirname, '../../../data');
const FILE_PATH = path.join(dataDir, 'reports.json');

// Ensure the data directory and file exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify([]), 'utf-8');
}

export function getAllReports(): CommunityReport[] {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read reports file:', error);
    return [];
  }
}

export function addReport(reportInput: Omit<CommunityReport, 'id' | 'createdAt'>): CommunityReport {
  const reports = getAllReports();
  
  const newReport: CommunityReport = {
    ...reportInput,
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 5),
    createdAt: new Date().toISOString(),
  };

  reports.push(newReport);

  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write report to file:', error);
    throw new Error('Could not save report');
  }

  return newReport;
}
