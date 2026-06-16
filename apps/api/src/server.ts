import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Helper function to generate unique Event Codes
function generateEventCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    if (i === 3) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// REST Endpoints

// 1. Create an Event
app.post('/api/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Event name is required and must be a string' });
      return;
    }

    const eventCode = generateEventCode();
    
    const event = await prisma.event.create({
      data: {
        name,
        eventCode,
        status: 'DRAFT',
      },
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Fetch Event details by Event Code
app.get('/api/events/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code;
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'Invalid event code' });
      return;
    }
    const event = await prisma.event.findUnique({
      where: { eventCode: code.toUpperCase() },
      include: { devices: true },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Register a device and join the event (obtain LiveKit token)
app.post('/api/events/:code/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code;
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'Invalid event code' });
      return;
    }
    const { role, name } = req.body;

    if (!role || !['CAMERA', 'AUDIO', 'DIRECTOR', 'VIEWER'].includes(role)) {
      res.status(400).json({ error: 'Invalid or missing role' });
      return;
    }

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Device name is required' });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { eventCode: code.toUpperCase() },
    });

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Register device in DB
    const device = await prisma.device.create({
      data: {
        eventId: event.id,
        role,
        name,
        isActive: true,
      },
    });

    // Create LiveKit Token
    const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
    const livekitUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';

    // LiveKit participant identity needs to be unique
    const participantIdentity = `${role.toLowerCase()}_${device.id}`;
    
    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: name,
    });

    // Configure grants based on the role
    const grants: any = {
      roomJoin: true,
      room: event.eventCode,
    };

    if (role === 'DIRECTOR') {
      grants.canPublish = true;
      grants.canSubscribe = true;
      grants.canPublishData = true;
      grants.roomAdmin = true;
    } else if (role === 'CAMERA') {
      grants.canPublish = true;
      grants.canSubscribe = false; // Cameras do not subscribe to other streams (optimizes mobile upload)
      grants.canPublishData = true;
    } else if (role === 'AUDIO') {
      grants.canPublish = true;
      grants.canSubscribe = false; // Audio sources do not subscribe to other streams
      grants.canPublishData = true;
    } else if (role === 'VIEWER') {
      grants.canPublish = false;
      grants.canSubscribe = true;
    }

    token.addGrant(grants);
    const tokenJwt = await token.toJwt();

    res.json({
      event,
      device,
      token: tokenJwt,
      livekitUrl,
    });
  } catch (error) {
    console.error('Error joining event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO Realtime Telemetry and Control Coordinates
io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  // Join Event Room
  socket.on('join-room', (eventCode: string) => {
    socket.join(eventCode.toUpperCase());
    console.log(`Socket ${socket.id} joined room ${eventCode}`);
  });

  // Camera and Audio telemetry updates (battery, health, signal, audio volume levels)
  socket.on('telemetry-update', (data: {
    eventCode: string;
    deviceId: string;
    role: string;
    name: string;
    batteryLevel?: number;
    signalStrength?: number; // 0-100 or 1-4 bars
    health?: 'EXCELLENT' | 'GOOD' | 'POOR';
    audioLevel?: number;
    isMuted?: boolean;
    isActiveTrack?: boolean;
  }) => {
    const { eventCode } = data;
    if (eventCode) {
      // Broadcast telemetry to everyone in the room (primarily the Director)
      socket.to(eventCode.toUpperCase()).emit('telemetry-received', data);
    }
  });

  // Director actions: Switch active camera
  socket.on('switch-active-camera', (data: {
    eventCode: string;
    participantIdentity: string;
  }) => {
    const { eventCode, participantIdentity } = data;
    if (eventCode) {
      // Broadcast the active camera change to the room
      io.to(eventCode.toUpperCase()).emit('active-camera-changed', {
        participantIdentity,
      });
      console.log(`Room ${eventCode}: Active camera switched to ${participantIdentity}`);
    }
  });

  // Director actions: Change active audio source
  socket.on('switch-active-audio', (data: {
    eventCode: string;
    participantIdentity: string;
  }) => {
    const { eventCode, participantIdentity } = data;
    if (eventCode) {
      io.to(eventCode.toUpperCase()).emit('active-audio-changed', {
        participantIdentity,
      });
      console.log(`Room ${eventCode}: Active audio source switched to ${participantIdentity}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`EventStream API Server is running on port ${PORT}`);
});
