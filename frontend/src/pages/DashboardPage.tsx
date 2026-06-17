import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Radio, Users, Copy, Check, ShieldAlert, Monitor, Video, Mic, ExternalLink, ArrowLeft } from 'lucide-react';
import io from 'socket.io-client';
import { API_URL } from '../config/env.ts';

interface Device {
  id: string;
  role: string;
  name: string;
  joinedAt: string;
  isActive: boolean;
}

interface EventData {
  id: string;
  name: string;
  eventCode: string;
  status: string;
  devices: Device[];
}

export default function DashboardPage() {
  const { code } = useParams<{ code: string }>();
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedRole, setCopiedRole] = useState<string | null>(null);

  // Poll for device updates or listen via Socket.io
  useEffect(() => {
    if (!code) return;

    const fetchEvent = async () => {
      try {
        const res = await fetch(`${API_URL}/api/events/${code.toUpperCase()}`);
        if (!res.ok) throw new Error('Event not found');
        const data = await res.json();
        setEventData(data);
        setError('');
      } catch (err: any) {
        setError(err.message || 'Failed to sync event details');
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();

    // Connect to Socket.io to listen for real-time telemetry/join messages
    const socket = io(API_URL);
    socket.emit('join-room', code.toUpperCase());

    // When a telemetry update is received, it means a device is active. Poll or update local state.
    socket.on('telemetry-received', () => {
      fetchEvent();
    });

    const interval = setInterval(fetchEvent, 4000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, [code]);

  const copyToClipboard = (text: string, role: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-bg-darkest text-zinc-400">
        <Radio className="w-8 h-8 animate-pulse text-red-500 mb-2" />
        <span className="font-semibold tracking-wide">Syncing with Cloud Production Server...</span>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-bg-darkest text-zinc-400 p-6 space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <span className="font-semibold tracking-wide text-zinc-200 text-lg">Production Room Desynchronized</span>
        <p className="text-zinc-500 text-sm">{error || 'Event could not be fetched'}</p>
        <Link to="/" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-white font-medium">
          <ArrowLeft className="w-4 h-4" /> Return Home
        </Link>
      </div>
    );
  }

  const joinBaseUrl = `${window.location.origin}${window.location.pathname}#/`;

  return (
    <div className="flex-1 bg-bg-darkest p-6 md:p-12 relative overflow-hidden">
      <div className="max-w-5xl mx-auto space-y-8 z-10 relative">

        {/* Navigation & Status Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-900 pb-6">
          <div className="space-y-1">
            <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm mb-2 font-medium">
              <ArrowLeft className="w-4 h-4" /> BACK TO HOME
            </Link>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              {eventData.name}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </h1>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/event/${eventData.eventCode}/director`}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-950/20"
            >
              <Monitor className="w-4 h-4" /> Open Director Control
            </Link>
            <Link
              to={`/event/${eventData.eventCode}/viewer`}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/20"
            >
              <ExternalLink className="w-4 h-4" /> Open Viewer output
            </Link>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-8">

          {/* Main Info Block */}
          <div className="md:col-span-1 glass-panel p-6 space-y-6">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Production Code</label>
              <div className="text-4xl font-extrabold font-mono tracking-wider text-white bg-bg-darkest p-4 rounded-xl text-center border border-zinc-800">
                {eventData.eventCode}
              </div>
              <p className="text-zinc-500 text-xs mt-2 text-center">Share this code with your camera operators and audio crew.</p>
            </div>

            <div className="border-t border-zinc-800 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-zinc-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                Crew Quick Connect
              </h3>
              <p className="text-xs text-zinc-500">Copy these URLs to quickly configure devices with pre-filled roles.</p>

              {/* Camera joining link */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-zinc-400 flex items-center gap-1.5"><Video className="w-3.5 h-3.5 text-red-500" /> Camera URL</span>
                  <button
                    onClick={() => copyToClipboard(`${joinBaseUrl}?code=${eventData.eventCode}&role=CAMERA`, 'CAMERA')}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    {copiedRole === 'CAMERA' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono truncate bg-bg-darkest px-2 py-1.5 rounded-lg border border-zinc-800">
                  {joinBaseUrl}?code={eventData.eventCode}&role=CAMERA
                </div>
              </div>

              {/* Audio joining link */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-zinc-400 flex items-center gap-1.5"><Mic className="w-3.5 h-3.5 text-amber-500" /> Audio URL</span>
                  <button
                    onClick={() => copyToClipboard(`${joinBaseUrl}?code=${eventData.eventCode}&role=AUDIO`, 'AUDIO')}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    {copiedRole === 'AUDIO' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-[10px] text-zinc-600 font-mono truncate bg-bg-darkest px-2 py-1.5 rounded-lg border border-zinc-800">
                  {joinBaseUrl}?code={eventData.eventCode}&role=AUDIO
                </div>
              </div>
            </div>
          </div>

          {/* Active Crew & Devices */}
          <div className="md:col-span-2 glass-panel p-6 md:p-8 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-red-500 animate-pulse" />
              Connected Inputs & Crew
            </h2>

            {eventData.devices && eventData.devices.length > 0 ? (
              <div className="space-y-3">
                {eventData.devices.map((device) => (
                  <div key={device.id} className="flex justify-between items-center bg-bg-darkest/80 border border-zinc-800 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${device.role === 'CAMERA' ? 'bg-red-950/20 text-red-500' :
                          device.role === 'AUDIO' ? 'bg-amber-950/20 text-amber-500' :
                            device.role === 'DIRECTOR' ? 'bg-blue-950/20 text-blue-500' :
                              'bg-zinc-900 text-zinc-400'
                        }`}>
                        {device.role === 'CAMERA' ? <Video className="w-5 h-5" /> :
                          device.role === 'AUDIO' ? <Mic className="w-5 h-5" /> :
                            <Monitor className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">{device.name}</div>
                        <div className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">{device.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="text-xs text-zinc-500">Connected</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 border border-dashed border-zinc-800 rounded-xl">
                <Radio className="w-8 h-8 text-zinc-600 animate-pulse" />
                <div>
                  <div className="text-sm font-semibold text-zinc-400">Waiting for connections...</div>
                  <div className="text-xs text-zinc-600 max-w-xs mx-auto mt-1">Connect your camera and microphone devices using the code or quick links on the left.</div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
