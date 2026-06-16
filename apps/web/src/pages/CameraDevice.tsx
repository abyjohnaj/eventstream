import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Video, RefreshCw, Battery, Wifi, ShieldAlert, ArrowLeft, Heart, Radio } from 'lucide-react';
import io from 'socket.io-client';
import { Room, RoomEvent, createLocalVideoTrack, LocalVideoTrack } from 'livekit-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function CameraDevice() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [localTrack, setLocalTrack] = useState<LocalVideoTrack | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isConnected, setIsConnected] = useState(false);
  const [tallyStatus, setTallyStatus] = useState<'LIVE' | 'PREVIEW' | 'SAFE'>('SAFE');
  const [error, setError] = useState('');

  // Mobile Telemetry Stats
  const [batteryLevel, setBatteryLevel] = useState<number>(100);
  const [signalStrength, setSignalStrength] = useState<number>(100); // percentage
  const [fps, setFps] = useState<number>(30);
  const [healthStatus, setHealthStatus] = useState<'EXCELLENT' | 'GOOD' | 'POOR'>('EXCELLENT');

  const videoElementRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<any>(null);
  const telemetryIntervalRef = useRef<any>(null);
  const participantIdentityRef = useRef<string>('');

  // 1. Fetch token and join LiveKit room
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

    participantIdentityRef.current = `camera_${deviceId}`;

    // Establish Socket.IO telemetry & control connection
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join-room', code.toUpperCase());

    // Listen for live switched cameras
    socket.on('active-camera-changed', (data: { participantIdentity: string }) => {
      if (data.participantIdentity === participantIdentityRef.current) {
        setTallyStatus('LIVE');
      } else {
        setTallyStatus('SAFE');
      }
    });

    // Battery API integration
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }

    // Network Signal estimation via connection API
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      const updateNetwork = () => {
        // Estimate signal based on type (4g = 100%, 3g = 60%, 2g = 20%)
        if (conn.effectiveType === '4g') setSignalStrength(100);
        else if (conn.effectiveType === '3g') setSignalStrength(60);
        else setSignalStrength(20);
      };
      updateNetwork();
      conn.addEventListener('change', updateNetwork);
    }

    // Initialize LiveKit Room and publish
    const activeRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoCodec: 'h264',
      },
    });

    const initConnection = async () => {
      try {
        await activeRoom.connect(lkUrl, token);
        setRoom(activeRoom);
        setIsConnected(true);

        // Publish video track (HD, 30fps)
        const videoTrack = await createLocalVideoTrack({
          resolution: { width: 1280, height: 720 },
          facingMode: facingMode,
          frameRate: 30,
        });

        await activeRoom.localParticipant.publishTrack(videoTrack);
        setLocalTrack(videoTrack);

        // Bind preview video
        if (videoElementRef.current) {
          videoTrack.attach(videoElementRef.current);
        }

        // Start Telemetry reporting interval (every 2 seconds)
        telemetryIntervalRef.current = setInterval(() => {
          // Calculate health from track status
          const active = videoTrack.mediaStreamTrack.enabled && videoTrack.mediaStreamTrack.readyState === 'live';
          const currentHealth = active ? (batteryLevel > 20 ? 'EXCELLENT' : 'GOOD') : 'POOR';
          setHealthStatus(currentHealth);

          socket.emit('telemetry-update', {
            eventCode: code.toUpperCase(),
            deviceId,
            role: 'CAMERA',
            name: deviceName,
            batteryLevel,
            signalStrength,
            health: currentHealth,
            isActiveTrack: tallyStatus === 'LIVE',
          });
        }, 2000);

      } catch (err: any) {
        console.error('WebRTC initialization error:', err);
        setError('Failed to configure camera or join streaming network: ' + err.message);
      }
    };

    initConnection();

    return () => {
      clearInterval(telemetryIntervalRef.current);
      if (activeRoom) {
        activeRoom.disconnect();
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [code]);

  // Handle front/rear camera switch
  const handleCameraToggle = async () => {
    if (!room || !localTrack) return;
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    try {
      // Detach old track
      if (videoElementRef.current) {
        localTrack.detach(videoElementRef.current);
      }
      await room.localParticipant.unpublishTrack(localTrack);
      localTrack.stop();

      // Create and publish new track
      const newVideoTrack = await createLocalVideoTrack({
        resolution: { width: 1280, height: 720 },
        facingMode: newFacingMode,
        frameRate: 30,
      });

      await room.localParticipant.publishTrack(newVideoTrack);
      setLocalTrack(newVideoTrack);

      if (videoElementRef.current) {
        newVideoTrack.attach(videoElementRef.current);
      }
    } catch (err: any) {
      console.error('Error switching camera source:', err);
      setError('Could not switch cameras: ' + err.message);
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
        <h2 className="text-xl font-bold text-white">Camera Offline</h2>
        <p className="text-zinc-500 text-sm max-w-sm">{error}</p>
        <button onClick={handleDisconnect} className="bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-lg text-white font-medium">
          Exit Broadcast
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black flex flex-col justify-between relative overflow-hidden select-none">
      
      {/* Tall Light Indicators (Top Panel) */}
      <div className="absolute top-0 inset-x-0 p-4 z-30 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
            tallyStatus === 'LIVE' ? 'bg-red-600 animate-pulse text-white' :
            tallyStatus === 'PREVIEW' ? 'bg-blue-600 text-white' :
            'bg-zinc-800 text-zinc-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${tallyStatus === 'LIVE' ? 'bg-white' : tallyStatus === 'PREVIEW' ? 'bg-white' : 'bg-zinc-500'}`} />
            {tallyStatus}
          </div>
          <span className="text-xs text-zinc-400 font-mono tracking-wider bg-black/40 px-2.5 py-1 rounded-md">CAM FEED: {code?.toUpperCase()}</span>
        </div>

        {/* Dynamic Mobile Status Gauges */}
        <div className="flex items-center gap-4 text-white">
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md">
            <Battery className={`w-4 h-4 ${batteryLevel < 20 ? 'text-red-500 animate-pulse' : 'text-zinc-300'}`} />
            <span className="text-xs font-mono">{batteryLevel}%</span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md">
            <Wifi className="w-4 h-4 text-zinc-300" />
            <span className="text-xs font-mono">{signalStrength}%</span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md">
            <Heart className={`w-4 h-4 ${healthStatus === 'EXCELLENT' ? 'text-emerald-500' : 'text-amber-500'}`} />
            <span className="text-xs font-mono">{healthStatus}</span>
          </div>
        </div>
      </div>

      {/* Screen Video Preview Frame */}
      <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center">
        <video
          ref={videoElementRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 space-y-4">
            <Radio className="w-8 h-8 animate-pulse text-red-500" />
            <span className="text-zinc-400 text-sm font-semibold tracking-wider">CONNECTING FEED PIPELINES...</span>
          </div>
        )}
      </div>

      {/* Mobile Stream Controls Overlay (Bottom Panel) */}
      <div className="absolute bottom-0 inset-x-0 p-6 z-30 flex justify-between items-center bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={handleDisconnect}
          className="bg-zinc-900/90 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold px-4 py-3 rounded-xl flex items-center gap-2 text-sm shadow-md"
        >
          <ArrowLeft className="w-4 h-4" /> DISCONNECT
        </button>

        <button
          onClick={handleCameraToggle}
          disabled={!isConnected}
          className="p-4 rounded-full bg-zinc-100 hover:bg-white text-bg-darkest transition-all shadow-xl hover:scale-105 disabled:opacity-50"
        >
          <RefreshCw className="w-6 h-6" />
        </button>

        <div className="w-28 text-right">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Signal Node</span>
          <span className="text-xs text-white font-mono">{isConnected ? 'LIVEKIT SFU' : 'OFFLINE'}</span>
        </div>
      </div>

    </div>
  );
}
