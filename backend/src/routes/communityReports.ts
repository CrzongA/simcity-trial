import { Router, Request, Response } from 'express';
import { getAllReports, addReport } from '../services/communityReports';

const router = Router();

// GET all reports
router.get('/', (_req: Request, res: Response) => {
  try {
    const reports = getAllReports();
    res.json({ reports });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve reports' });
  }
});

// POST a new report
router.post('/', (req: Request, res: Response) => {
  try {
    const { lat, lng, height, cartesian, description, tags, image } = req.body;
    
    if (lat === undefined || lng === undefined || !description) {
      res.status(400).json({ error: 'Missing required fields: lat, lng, description' });
      return;
    }

    const newReport = addReport({
      lat,
      lng,
      height: height || 0,
      cartesian,
      description,
      tags: tags || [],
      image: image || null,
    });

    res.status(201).json({ report: newReport });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create report' });
  }
});

export default router;
