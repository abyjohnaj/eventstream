import cors from 'cors';
import express from 'express';
import { eventRouter } from './modules/events/routes';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use('/api/events', eventRouter);

  return app;
}
