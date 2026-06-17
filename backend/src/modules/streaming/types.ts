export interface TelemetryUpdate {
  eventCode: string;
  deviceId: string;
  role: string;
  name: string;
  batteryLevel?: number;
  signalStrength?: number;
  health?: 'EXCELLENT' | 'GOOD' | 'POOR';
  audioLevel?: number;
  isMuted?: boolean;
  isActiveTrack?: boolean;
}

export interface SourceSwitchRequest {
  eventCode: string;
  participantIdentity: string;
}
