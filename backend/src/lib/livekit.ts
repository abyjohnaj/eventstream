import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { env } from '../config/env';
import type { DeviceRole } from '../modules/events/types';

export async function createParticipantToken(input: {
  role: DeviceRole;
  roomName: string;
  participantIdentity: string;
  participantName: string;
}): Promise<{ token: string; livekitUrl: string }> {
  const token = new AccessToken(env.livekit.apiKey, env.livekit.apiSecret, {
    identity: input.participantIdentity,
    name: input.participantName,
  });

  token.addGrant(createVideoGrant(input.role, input.roomName));

  return {
    token: await token.toJwt(),
    livekitUrl: env.livekit.url,
  };
}

function createVideoGrant(role: DeviceRole, roomName: string): VideoGrant {
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
  };


  if (role === 'DIRECTOR') {
    return {
      ...grant,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: true,
    };
  }

  if (role === 'CAMERA' || role === 'AUDIO') {
    return {
      ...grant,
      canPublish: true,
      canSubscribe: false,
      canPublishData: true,
    };
  }

  return {
    ...grant,
    canPublish: false,
    canSubscribe: true,
  };
}
