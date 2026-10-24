import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import jobRoutes from './routes/jobRoutes';
import userRoutes from './routes/userRoutes';
import candidateRoutes from './routes/candidateRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import publicRoutes from './routes/publicRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import clientShareRoutes from './routes/clientShareRoutes';
import publicClientShareRoutes from './routes/publicClientShareRoutes';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware with rawBody capture for secure HMAC webhook validation
app.use(cors());
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'TaskNera ATS Backend API',
    version: '1.0.0',
    health: '/api/health',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Backend server is running successfully v1.0.1',
    timestamp: new Date().toISOString()
  });
});

import { protect, optionalProtect } from './middleware/authMiddleware';
import {
  getCandidateEvaluation,
  getAllEvaluations,
  updateEvaluationDecisionController,
  deleteEvaluationController
} from './controllers/evaluationController';

// Authentication, User, Job, Candidate, Evaluation, Public Application & Super Admin Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/candidates', candidateRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/super-admin', superAdminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/public/client-shares', publicClientShareRoutes);
app.use('/public/client-shares', publicClientShareRoutes);
app.use('/api/jobs', clientShareRoutes);
app.use('/jobs', clientShareRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Evaluation Endpoints (Secured by database-level ownership)
app.get('/api/evaluations', protect, getAllEvaluations);
app.get('/api/evaluations/:id', protect, getCandidateEvaluation);
app.post('/api/evaluations/:id/decision', protect, updateEvaluationDecisionController);
app.patch('/api/evaluations/:id/decision', protect, updateEvaluationDecisionController);
app.delete('/api/evaluations/:id', protect, deleteEvaluationController);

import { ensureDefaultAdmin } from './controllers/authController';
import { bulkQueue } from './services/bulkQueueService';
import { bulkUploadService } from './services/bulkUploadService';

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Backend] Server listening on http://localhost:${PORT}`);
    ensureDefaultAdmin();
    // Start persistent background queue worker
    bulkUploadService;
    bulkQueue.start();
  });
}

export default app;
