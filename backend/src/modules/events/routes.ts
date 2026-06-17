import { Router, type Request, type Response } from 'express';
import { createParticipantToken } from '../../lib/livekit';
import { prisma } from '../../lib/prisma';
import { isDeviceRole } from './types';
import { generateEventCode } from './eventCode';

export const eventRouter = Router();

eventRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Event name is required and must be a string' });
      return;
    }

    const event = await prisma.event.create({
      data: {
        name,
        eventCode: generateEventCode(),
        status: 'DRAFT',
      },
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

eventRouter.get('/:code', async (req: Request, res: Response): Promise<void> => {
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

eventRouter.post('/:code/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code;

    if (typeof code !== 'string') {
      res.status(400).json({ error: 'Invalid event code' });
      return;
    }

    const { role, name } = req.body;

    if (!isDeviceRole(role)) {
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

    const device = await prisma.device.create({
      data: {
        eventId: event.id,
        role,
        name,
        isActive: true,
      },
    });

    const participantIdentity = `${role.toLowerCase()}_${device.id}`;
    const { token, livekitUrl } = await createParticipantToken({
      role,
      roomName: event.eventCode,
      participantIdentity,
      participantName: name,
    });

    res.json({
      event,
      device,
      token,
      livekitUrl,
    });
  } catch (error) {
    console.error('Error joining event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
