import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, ShieldAlert, ArrowLeft, Radio, Sliders } from 'lucide-react';
import io from 'socket.io-client';
import { Room, createLocalAudioTrack, LocalAudioTrack } from 'livekit-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function AudioDevice() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [localTrack, setLocalTrack] = useState<LocalAudioTrack | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [error, setError] = useState('');

  const socketRef = useRef<any>(null);
  const telemetryIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Fetch connection token and join LiveKit room
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

    // Connect to telemetry socket server
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join-room', code.toUpperCase());

    const activeRoom = new Room({
      publishDefaults: {
        audioPreset: {
          maxBitrate: 96000,
        },
      },
    });

    const initAudio = async () => {
      try {
        await activeRoom.connect(lkUrl, token);
        setRoom(activeRoom);
        setIsConnected(true);

        // Create local audio track with noise suppression and echo cancellation
        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: noiseSuppression,
          autoGainControl: true,
        });

        await activeRoom.localParticipant.publishTrack(audioTrack);
        setLocalTrack(audioTrack);

        // Setup Web Audio API for VU Meter
        const mediaStream = new MediaStream([audioTrack.mediaStreamTrack]);
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(mediaStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Animate VU meter values
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVUMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Compute average volume level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          
          // Scale to 0-100 value
          const levelVal = Math.min(Math.round((average / 128) * 100), 100);
          setAudioLevel(levelVal);
          
          animationFrameRef.current = requestAnimationFrame(updateVUMeter);
        };
        updateVUMeter();

        // Telemetry loop (broadcasting levels to Director Panel)
        telemetryIntervalRef.current = setInterval(() => {
          socket.emit('telemetry-update', {
            eventCode: code.toUpperCase(),
            deviceId,
            role: 'AUDIO',
            name: deviceName,
            audioLevel: isMuted ? 0 : audioLevel,
            isMuted,
            health: 'EXCELLENT',
          });
        }, 500);

      } catch (err: any) {
        console.error('Audio capture initialization error:', err);
        setError('Failed to configure audio capture device: ' + err.message);
      }
    };

    initAudio();

    return () => {
      clearInterval(telemetryIntervalRef.current);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (activeRoom) {
        activeRoom.disconnect();
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [code, noiseSuppression]);

  // Toggle Mute
  const handleMuteToggle = async () => {
    if (!localTrack) return;
    try {
      if (isMuted) {
        await localTrack.unmute();
        setIsMuted(false);
      } else {
        await localTrack.mute();
        setIsMuted(true);
      }
    } catch (err: any) {
      console.error('Mute action error:', err);
    }
  };

  // Toggle Noise Suppression by recreating the track
  const handleNoiseSuppressionToggle = () => {
    const nextVal = !noiseSuppression;
    setNoiseSuppression(nextVal);
    // Setting state will trigger the useEffect cleanup & reinitialize with the new configuration
  };

  const handleDisconnect = () => {
    if (room) room.disconnect();
    navigate('/');
  };

  if (error) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-bg-darkest p-6 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <h2 className="text-xl font-bold text-white">Audio Capture Offline</h2>
        <p className="text-zinc-500 text-sm max-w-sm">{error}</p>
        <button onClick={handleDisconnect} className="bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 rounded-lg text-white font-medium">
          Exit Capture
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-bg-darkest relative overflow-hidden select-none">
      
      {/* Top Header */}
      <div className="flex justify-between items-center bg-bg-darker/60 p-4 rounded-xl border border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse-live" />
          <span className="text-sm font-bold text-white tracking-wide uppercase">Dedicated Audio Feed</span>
        </div>
        <span className="text-xs text-zinc-500 font-mono">ROOM: {code?.toUpperCase()}</span>
      </div>

      {/* VU Meter & Micro Level Panel */}
      <div className="flex-1 flex flex-col justify-center items-center py-12 max-w-md mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <div className={`p-6 rounded-full inline-flex ${isMuted ? 'bg-red-950/20 text-red-500 border border-red-500/20' : 'bg-amber-950/20 text-amber-500 border border-amber-500/20'}`}>
            {isMuted ? <MicOff className="w-12 h-12" /> : <Mic className="w-12 h-12 animate-pulse" />}
          </div>
          <h2 className="text-2xl font-bold text-white">{isMuted ? 'Audio Input Muted' : 'Audio Live'}</h2>
          <p className="text-xs text-zinc-500">Transmitting raw uncompressed micro feeds to local SFU switcher</p>
        </div>

        {/* Real-time Level VU Indicator */}
        <div className="w-full space-y-3 glass-panel p-6 border border-zinc-800">
          <div className="flex justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider">
            <span>VU Input Level</span>
            <span className="font-mono">{isMuted ? 0 : audioLevel}%</span>
          </div>
          
          {/* Decibel Color Ranges Bar */}
          <div className="h-6 w-full bg-zinc-900 border border-zinc-800/80 rounded-md overflow-hidden flex relative">
            <div 
              style={{ width: `${isMuted ? 0 : audioLevel}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 transition-all duration-75"
            />
            {/* Grid markings */}
            <div className="absolute inset-0 flex justify-between px-4 pointer-events-none opacity-20 text-[9px] text-white font-mono leading-6">
              <span>-60dB</span>
              <span>-30dB</span>
              <span>-12dB</span>
              <span>0dB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Actions Bottom Panel */}
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto w-full">
        <button
          onClick={handleMuteToggle}
          disabled={!isConnected}
          className={`py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all shadow-md ${
            isMuted 
              ? 'bg-red-600 hover:bg-red-500 text-white' 
              : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
        >
          {isMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {isMuted ? 'UNMUTE MIC' : 'MUTE MIC'}
        </button>

        <button
          onClick={handleNoiseSuppressionToggle}
          disabled={!isConnected}
          className={`py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all border shadow-md ${
            noiseSuppression 
              ? 'bg-amber-950/20 border-amber-500/40 text-amber-400' 
              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
          {noiseSuppression ? 'NOISE SUPPR: ON' : 'NOISE SUPPR: OFF'}
        </button>

        <button
          onClick={handleDisconnect}
          className="col-span-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-semibold py-3.5 rounded-xl text-center text-xs tracking-wider uppercase border border-zinc-800/80"
        >
          Disconnect Audio Feed
        </button>
      </div>

    </div>
  );
}
