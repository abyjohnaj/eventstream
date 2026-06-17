import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { env } from './config/env';
import { registerRealtimeHandlers } from './modules/streaming/socket';

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

registerRealtimeHandlers(io);

httpServer.listen(env.port, () => {
  console.log(`EventStream API Server is running on port ${env.port}`);
});
