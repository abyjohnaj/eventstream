import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, Radio, Volume2, VolumeX, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';
import io from 'socket.io-client';
import { Room, RoomEvent, Participant, Track, RemoteTrack, RemoteParticipant } from 'livekit-client';
import { API_URL } from '../config/env.ts';

export default function ViewerPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeCameraIdentity, setActiveCameraIdentity] = useState<string>('');
  const [activeAudioIdentity, setActiveAudioIdentity] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState('');

  const socketRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const containerElementRef = useRef<HTMLDivElement>(null);

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

    // Connect to signaling control room
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join-room', code.toUpperCase());

    // Listen for director source switching commands
    socket.on('active-camera-changed', (data: { participantIdentity: string }) => {
      setActiveCameraIdentity(data.participantIdentity);
    });

    socket.on('active-audio-changed', (data: { participantIdentity: string }) => {
      setActiveAudioIdentity(data.participantIdentity);
    });

    const activeRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    const updateParticipantsList = () => {
      const list = Array.from(activeRoom.remoteParticipants.values()) as Participant[];
      setParticipants(list);
    };

    const initViewer = async () => {
      try {
        await activeRoom.connect(lkUrl, token);
        setRoom(activeRoom);
        setIsConnected(true);
        updateParticipantsList();

        activeRoom.on(RoomEvent.ParticipantConnected, () => {
          updateParticipantsList();
        });

        activeRoom.on(RoomEvent.ParticipantDisconnected, () => {
          updateParticipantsList();
        });

        activeRoom.on(RoomEvent.TrackSubscribed, () => {
          updateParticipantsList();
        });

        activeRoom.on(RoomEvent.TrackUnsubscribed, () => {
          updateParticipantsList();
        });

      } catch (err: any) {
        console.error('Viewer connection error:', err);
        setError('Failed to connect to the viewer stream: ' + err.message);
      }
    };

    initViewer();

    return () => {
      if (activeRoom) activeRoom.disconnect();
      if (socket) socket.disconnect();
    };
  }, [code]);

  // Bind video element to the currently selected active camera participant's video track
  useEffect(() => {
    if (!room || !activeCameraIdentity || !videoElementRef.current) return;

    const activeParticipant = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity === activeCameraIdentity
    ) as Participant | undefined;

    if (activeParticipant) {
      // Find the camera track
      const trackPub = Array.from(activeParticipant.trackPublications.values()).find(
        (t) => t.kind === Track.Kind.Video
      );

      if (trackPub && trackPub.track && trackPub.track.mediaStreamTrack) {
        const track = trackPub.track as RemoteTrack;
        track.attach(videoElementRef.current);
      }
    }
  }, [activeCameraIdentity, participants]);

  // Bind audio element to the currently selected active audio participant's audio track
  useEffect(() => {
    if (!room || !activeAudioIdentity || !audioElementRef.current) return;

    const activeParticipant = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity === activeAudioIdentity
    ) as Participant | undefined;

    if (activeParticipant) {
      // Find microphone audio track
      const trackPub = Array.from(activeParticipant.trackPublications.values()).find(
        (t) => t.kind === Track.Kind.Audio
      );

      if (trackPub && trackPub.track && trackPub.track.mediaStreamTrack) {
        const track = trackPub.track as RemoteTrack;
        track.attach(audioElementRef.current);
      }
    }
  }, [activeAudioIdentity, participants]);

  const toggleMute = () => {
    if (audioElementRef.current) {
      const nextMute = !isMuted;
      audioElementRef.current.muted = nextMute;
      setIsMuted(nextMute);
    }
  };

  const toggleFullscreen = () => {
    if (!containerElementRef.current) return;

    if (!document.fullscreenElement) {
      containerElementRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen request rejected:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  const handleDisconnect = () => {
    if (room) room.disconnect();
    navigate('/');
  };

  if (error) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-bg-darkest p-6 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-bold text-white">Stream Unavailable</h2>
        <p className="text-zinc-500 text-sm max-w-sm">{error}</p>
        <button onClick={handleDisconnect} className="bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-lg text-white font-medium">
          Exit Room
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-darkest p-6 md:p-12 items-center justify-center relative select-none">

      <div className="max-w-4xl w-full space-y-6">

        {/* Back Link & Info Row */}
        <div className="flex justify-between items-center w-full">
          <button
            onClick={handleDisconnect}
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm font-semibold uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" /> DISCONNECT VIEW
          </button>

          <div className="flex items-center gap-2 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1 rounded-full text-emerald-400">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">LIVE BROADCAST</span>
          </div>
        </div>

        {/* Video Player Display Container */}
        <div
          ref={containerElementRef}
          className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-zinc-900 shadow-2xl flex items-center justify-center group"
        >
          <video
            ref={videoElementRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          <audio
            ref={audioElementRef}
            autoPlay
          />

          {/* Player controls Overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">

            {/* Audio Toggle */}
            <button
              onClick={toggleMute}
              className="text-white hover:text-zinc-300 p-2 bg-black/40 rounded-lg backdrop-blur-sm transition-all"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Title / Info */}
            <span className="text-xs font-bold text-zinc-300 font-mono">ROOM: {code?.toUpperCase()}</span>

            {/* Screen Zoom Toggle */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-zinc-300 p-2 bg-black/40 rounded-lg backdrop-blur-sm transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

          </div>

          {/* Connecting State */}
          {(!isConnected || !activeCameraIdentity) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 space-y-3">
              <Radio className="w-8 h-8 text-zinc-700 animate-pulse" />
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                {!isConnected ? 'CONNECTING FEED PIPELINES...' : 'WAITING FOR DIRECTOR TO GO LIVE...'}
              </span>
            </div>
          )}
        </div>

        {/* Stream metadata info */}
        <div className="glass-panel p-6 border border-zinc-900 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-lg text-white">EventStream Broadcast Feed</h2>
            <p className="text-xs text-zinc-500 mt-1">Watching live director-switched feed via WebRTC SFU</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">Latency Mode</span>
            <span className="text-xs text-emerald-400 font-mono font-semibold">ULTRA-LOW (&lt;500ms)</span>
          </div>
        </div>

      </div>

    </div>
  );
}
