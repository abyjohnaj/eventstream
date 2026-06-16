import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Video, Mic, Sliders, ShieldAlert, Radio, Battery, Wifi, Disc, Square, Monitor } from 'lucide-react';
import io from 'socket.io-client';
import { Room, RoomEvent, Participant, Track, RemoteTrack, TrackPublication, RemoteParticipant } from 'livekit-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Telemetry {
  deviceId: string;
  role: string;
  name: string;
  batteryLevel?: number;
  signalStrength?: number;
  health?: 'EXCELLENT' | 'GOOD' | 'POOR';
  audioLevel?: number;
  isMuted?: boolean;
}

export default function DirectorPanel() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeCameraIdentity, setActiveCameraIdentity] = useState<string>('');
  const [activeAudioIdentity, setActiveAudioIdentity] = useState<string>('');
  const [deviceTelemetry, setDeviceTelemetry] = useState<Record<string, Telemetry>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');

  // Local Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const socketRef = useRef<any>(null);
  const programVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // 1. Join room and setup Socket.IO control coordination
  useEffect(() => {
    if (!code) return;

    const token = sessionStorage.getItem(`lk_token_${code.toUpperCase()}`);
    const lkUrl = sessionStorage.getItem(`lk_url_${code.toUpperCase()}`);
    const deviceId = sessionStorage.getItem(`device_id_${code.toUpperCase()}`);
    const deviceName = sessionStorage.getItem(`device_name_${code.toUpperCase()}`);

    if (!token || !lkUrl || !deviceId || !deviceName) {
      setError('Session connection credentials missing. Please join from the Home Page.');
      return;
    }

    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join-room', code.toUpperCase());

    // Listen to telemetry updates from cameras and mics
    socket.on('telemetry-received', (data: Telemetry) => {
      setDeviceTelemetry((prev) => ({
        ...prev,
        [data.deviceId]: data,
      }));
    });

    // Listen to active source switching commands (so all directors are in sync)
    socket.on('active-camera-changed', (data: { participantIdentity: string }) => {
      setActiveCameraIdentity(data.participantIdentity);
    });

    socket.on('active-audio-changed', (data: { participantIdentity: string }) => {
      setActiveAudioIdentity(data.participantIdentity);
    });

    // Setup LiveKit room
    const activeRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    const updateParticipantsList = () => {
      const remoteList = Array.from(activeRoom.remoteParticipants.values()) as Participant[];
      setParticipants(remoteList);
    };

    const initDirector = async () => {
      try {
        await activeRoom.connect(lkUrl, token);
        setRoom(activeRoom);
        setIsConnected(true);
        updateParticipantsList();

        // Listen for new participants and tracks subscribing
        activeRoom.on(RoomEvent.ParticipantConnected, () => {
          updateParticipantsList();
        });

        activeRoom.on(RoomEvent.ParticipantDisconnected, (p) => {
          updateParticipantsList();
          // Cleanup telemetry
          setDeviceTelemetry((prev) => {
            const copy = { ...prev };
            const devId = Object.keys(copy).find(k => copy[k].name === p.name);
            if (devId) delete copy[devId];
            return copy;
          });
        });

        activeRoom.on(RoomEvent.TrackSubscribed, () => {
          updateParticipantsList();
        });

        activeRoom.on(RoomEvent.TrackUnsubscribed, () => {
          updateParticipantsList();
        });

      } catch (err: any) {
        console.error('Director LiveKit connection error:', err);
        setError('Failed to connect Director client: ' + err.message);
      }
    };

    initDirector();

    return () => {
      if (activeRoom) activeRoom.disconnect();
      if (socket) socket.disconnect();
    };
  }, [code]);

  // Bind video element to specific participant's camera track
  const attachVideoTrack = (participant: Participant, videoEl: HTMLVideoElement | null) => {
    if (!videoEl) return;
    
    // Find first video track published by participant using trackPublications map
    const trackPub = Array.from(participant.trackPublications.values()).find(
      (t) => t.kind === Track.Kind.Video
    );

    if (trackPub && trackPub.track && trackPub.track.mediaStreamTrack) {
      const track = trackPub.track as RemoteTrack;
      track.attach(videoEl);
    }
  };

  // Sync active program window video element
  useEffect(() => {
    if (!room || !activeCameraIdentity || !programVideoRef.current) return;

    // Search active camera participant from remote list
    const participant = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity === activeCameraIdentity
    ) as Participant | undefined;

    if (participant) {
      attachVideoTrack(participant, programVideoRef.current);
    }
  }, [activeCameraIdentity, participants]);

  // Switching active feeds (emit via Socket.IO)
  const triggerCameraSwitch = (identity: string) => {
    if (socketRef.current && code) {
      socketRef.current.emit('switch-active-camera', {
        eventCode: code.toUpperCase(),
        participantIdentity: identity,
      });
    }
  };

  const triggerAudioSwitch = (identity: string) => {
    if (socketRef.current && code) {
      socketRef.current.emit('switch-active-audio', {
        eventCode: code.toUpperCase(),
        participantIdentity: identity,
      });
    }
  };

  // Local Recording of Program Output (Composite Streams)
  const startRecording = () => {
    if (!room) return;

    // Retrieve active camera & audio tracks
    const cameraParticipant = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity === activeCameraIdentity
    ) as RemoteParticipant | undefined;
    const audioParticipant = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity === activeAudioIdentity
    ) as RemoteParticipant | undefined;

    const videoPub = cameraParticipant?.getTrackPublication(Track.Source.Camera);
    const audioPub = audioParticipant?.getTrackPublication(Track.Source.Microphone);

    const tracks: MediaStreamTrack[] = [];

    if (videoPub?.videoTrack?.mediaStreamTrack) {
      tracks.push(videoPub.videoTrack.mediaStreamTrack);
    } else {
      setError('Recording failed: Active camera feed missing or unavailable.');
      return;
    }

    if (audioPub?.audioTrack?.mediaStreamTrack) {
      tracks.push(audioPub.audioTrack.mediaStreamTrack);
    }

    const stream = new MediaStream(tracks);
    const options = { mimeType: 'video/webm;codecs=vp8,opus' };

    try {
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      setRecordedChunks([]);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eventstream-program-${code}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      // Record chunks every 1 second
      recorder.start(1000);
      setIsRecording(true);
    } catch (err: any) {
      console.error('Recording initialization error:', err);
      setError('Failed to start local program recording: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleDisconnect = () => {
    if (room) room.disconnect();
    navigate('/');
  };

  const cameras = participants.filter((p) => p.identity.startsWith('camera_'));
  const audios = participants.filter((p) => p.identity.startsWith('audio_'));

  return (
    <div className="flex-1 flex flex-col bg-bg-darkest select-none h-screen text-zinc-100 overflow-hidden">
      
      {/* Studio Header Row */}
      <header className="bg-bg-darker border-b border-zinc-900 px-6 py-3.5 flex justify-between items-center z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-red-950/20 border border-red-500/20 px-3 py-1 rounded-full">
            <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Master Switcher</span>
          </div>
          <span className="text-sm font-bold text-white font-mono">ROOM: {code?.toUpperCase()}</span>
        </div>

        {/* Master Control actions (Recording, Switcher) */}
        <div className="flex items-center gap-4">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="bg-zinc-900 border border-red-500 text-red-500 hover:bg-zinc-850 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-all animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-red-500" />
              STOP RECORDING
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={!activeCameraIdentity}
              className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition-all shadow-md shadow-red-950/20"
            >
              <Disc className="w-3.5 h-3.5" />
              REC PROGRAM
            </button>
          )}

          <button
            onClick={handleDisconnect}
            className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 font-semibold px-3 py-2 rounded-lg text-xs"
          >
            Leave Suite
          </button>
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Program Screen & Feeds Grid */}
        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
          
          {/* Active Live Program preview screen */}
          <div className="relative aspect-video max-h-[50vh] bg-black rounded-xl overflow-hidden border border-zinc-900 shadow-2xl flex items-center justify-center group">
            <video
              ref={programVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Live Program Tally indicator */}
            <div className="absolute top-4 left-4 bg-red-600 text-white font-extrabold px-3 py-1.5 rounded-md text-[10px] tracking-wider uppercase flex items-center gap-2 shadow-lg shadow-red-950/40">
              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
              LIVE PROGRAM OUTPUT
            </div>

            {!activeCameraIdentity && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 space-y-3">
                <Monitor className="w-10 h-10 text-zinc-700 animate-pulse" />
                <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">No active camera output selected</span>
              </div>
            )}
          </div>

          {/* Connected Cameras Grid inputs */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-black tracking-widest text-zinc-500 uppercase flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" /> Camera Feeds
            </h3>
            
            {cameras.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cameras.map((cam) => {
                  const isActive = cam.identity === activeCameraIdentity;
                  // Retrieve telemetry data
                  const devId = cam.identity.replace('camera_', '');
                  const telemetry = Object.values(deviceTelemetry).find(t => t.deviceId === devId) || {
                    deviceId: devId,
                    role: 'CAMERA',
                    name: cam.name || 'Unnamed Camera',
                    batteryLevel: 100,
                    signalStrength: 100,
                    health: 'EXCELLENT',
                  };

                  return (
                    <div 
                      key={cam.identity} 
                      onClick={() => triggerCameraSwitch(cam.identity)}
                      className={`relative aspect-video bg-zinc-950 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 group border-2 ${
                        isActive 
                          ? 'border-red-600 shadow-lg shadow-red-950/20' 
                          : 'border-zinc-900 hover:border-zinc-700'
                      }`}
                    >
                      <video
                        ref={(el) => {
                          previewVideoRefs.current[cam.identity] = el;
                          attachVideoTrack(cam, el);
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover pointer-events-none"
                      />

                      {/* Video source Label & Indicators overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-2.5 flex flex-col justify-between pointer-events-none">
                        
                        {/* Top: Telemetry Icons */}
                        <div className="flex justify-between items-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${
                            isActive ? 'bg-red-600 text-white' : 'bg-zinc-800/80 text-zinc-300'
                          }`}>
                            {isActive ? 'LIVE' : 'PREVIEW'}
                          </span>
                          
                          {/* Battery and signal icons */}
                          <div className="flex gap-2 text-white/90">
                            <div className="flex items-center gap-0.5 text-[8px] bg-black/60 px-1 py-0.5 rounded">
                              <Battery className="w-2.5 h-2.5" />
                              <span>{telemetry.batteryLevel}%</span>
                            </div>
                            <div className="flex items-center gap-0.5 text-[8px] bg-black/60 px-1 py-0.5 rounded">
                              <Wifi className="w-2.5 h-2.5" />
                              <span>{telemetry.signalStrength}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom: Feed details */}
                        <div className="flex justify-between items-end">
                          <span className="text-xs font-bold text-white tracking-wide truncate pr-4">{telemetry.name}</span>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest shrink-0">
                            {telemetry.health}
                          </span>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-zinc-800 rounded-xl space-y-2">
                <Video className="w-6 h-6 text-zinc-750" />
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">No cameras connected yet</span>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Audio Mixer Panel */}
        <div className="w-80 bg-bg-darker border-l border-zinc-900 p-4 space-y-6 flex flex-col h-full shrink-0">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 shrink-0">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-black tracking-widest text-zinc-400 uppercase">Audio Switcher / Mixer</h2>
          </div>

          {/* Connected Microphones */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {audios.length > 0 ? (
              audios.map((mic) => {
                const isActive = mic.identity === activeAudioIdentity;
                const devId = mic.identity.replace('audio_', '');
                const telemetry = Object.values(deviceTelemetry).find(t => t.deviceId === devId) || {
                  deviceId: devId,
                  role: 'AUDIO',
                  name: mic.name || 'Unnamed Audio Source',
                  audioLevel: 0,
                  isMuted: false,
                };

                return (
                  <div 
                    key={mic.identity}
                    onClick={() => triggerAudioSwitch(mic.identity)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 space-y-3 ${
                      isActive 
                        ? 'bg-amber-950/20 border-amber-500/80' 
                        : 'bg-bg-darkest border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-amber-500 text-bg-darkest' : 'bg-zinc-850 text-zinc-400'}`}>
                          <Mic className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-white truncate max-w-[120px]">{telemetry.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        isActive ? 'bg-amber-500 text-bg-darkest' : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {isActive ? 'ON AIR' : 'MUTED'}
                      </span>
                    </div>

                    {/* Volume level progress VU slider bar */}
                    <div className="space-y-1.5">
                      <div className="h-2 w-full bg-zinc-900 rounded overflow-hidden flex relative border border-zinc-850">
                        <div 
                          style={{ width: `${telemetry.isMuted ? 0 : (telemetry.audioLevel || 0)}%` }}
                          className={`h-full transition-all duration-75 ${
                            isActive ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500' : 'bg-zinc-700'
                          }`}
                        />
                      </div>
                      <div className="flex justify-between text-[8px] font-mono text-zinc-650">
                        <span>-40dB</span>
                        <span>-12dB</span>
                        <span>0dB</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-zinc-800 rounded-xl space-y-2">
                <Mic className="w-6 h-6 text-zinc-750" />
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider text-center">No audio sources connected</span>
              </div>
            )}
          </div>

          {/* Master Output Telemetry stats */}
          <div className="bg-bg-darkest border border-zinc-800 p-4 rounded-xl space-y-3 shrink-0">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">System Diagnostics</span>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-bg-darker p-2 rounded border border-zinc-900">
                <span className="text-zinc-600 block mb-0.5">ACTIVE CAM</span>
                <span className="font-mono text-white truncate block">
                  {cameras.find(c => c.identity === activeCameraIdentity)?.name || 'NONE'}
                </span>
              </div>
              <div className="bg-bg-darker p-2 rounded border border-zinc-900">
                <span className="text-zinc-600 block mb-0.5">ACTIVE AUDIO</span>
                <span className="font-mono text-white truncate block">
                  {audios.find(a => a.identity === activeAudioIdentity)?.name || 'NONE'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
