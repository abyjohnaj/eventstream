import type { Server, Socket } from 'socket.io';
import type { SourceSwitchRequest, TelemetryUpdate } from './types';

export function registerRealtimeHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-room', (eventCode: string) => {
      socket.join(eventCode.toUpperCase());
      console.log(`Socket ${socket.id} joined room ${eventCode}`);
    });

    socket.on('telemetry-update', (data: TelemetryUpdate) => {
      const { eventCode } = data;

      if (eventCode) {
        socket.to(eventCode.toUpperCase()).emit('telemetry-received', data);
      }
    });

    socket.on('switch-active-camera', (data: SourceSwitchRequest) => {
      const { eventCode, participantIdentity } = data;

      if (eventCode) {
        io.to(eventCode.toUpperCase()).emit('active-camera-changed', {
          participantIdentity,
        });
        console.log(`Room ${eventCode}: Active camera switched to ${participantIdentity}`);
      }
    });

    socket.on('switch-active-audio', (data: SourceSwitchRequest) => {
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
}
