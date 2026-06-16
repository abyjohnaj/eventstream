import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Mic, Sliders, Play, Plus, ArrowRight, Radio } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Home() {
  const navigate = useNavigate();
  const [eventName, setEventName] = useState('');
  const [eventCode, setEventCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceRole, setDeviceRole] = useState<'CAMERA' | 'AUDIO' | 'DIRECTOR' | 'VIEWER'>('CAMERA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: eventName }),
      });

      if (!res.ok) {
        throw new Error('Failed to create event');
      }

      const data = await res.json();
      navigate(`/event/${data.eventCode}/dashboard`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create event. Is backend API running?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventCode.trim() || !deviceName.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Check event validity first
      const checkRes = await fetch(`${API_URL}/api/events/${eventCode.toUpperCase()}`);
      if (!checkRes.ok) {
        throw new Error('Event not found. Check the code.');
      }

      const eventData = await checkRes.json();

      // Submit joining register to get LiveKit token
      const joinRes = await fetch(`${API_URL}/api/events/${eventCode.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: deviceRole, name: deviceName }),
      });

      if (!joinRes.ok) {
        const errorData = await joinRes.json();
        throw new Error(errorData.error || 'Failed to join event');
      }

      const joinData = await joinRes.json();
      
      // Store connection data in session storage to pass to the respective page
      sessionStorage.setItem(`lk_token_${eventCode.toUpperCase()}`, joinData.token);
      sessionStorage.setItem(`lk_url_${eventCode.toUpperCase()}`, joinData.livekitUrl);
      sessionStorage.setItem(`device_name_${eventCode.toUpperCase()}`, deviceName);
      sessionStorage.setItem(`device_id_${eventCode.toUpperCase()}`, joinData.device.id);

      // Navigate to the respective device role route
      if (deviceRole === 'CAMERA') {
        navigate(`/event/${eventCode.toUpperCase()}/camera`);
      } else if (deviceRole === 'AUDIO') {
        navigate(`/event/${eventCode.toUpperCase()}/audio`);
      } else if (deviceRole === 'DIRECTOR') {
        navigate(`/event/${eventCode.toUpperCase()}/director`);
      } else {
        navigate(`/event/${eventCode.toUpperCase()}/viewer`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to join. Is backend API running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-bg-darkest to-bg-darkest">
      {/* Decorative Grid Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      <div className="w-full max-w-4xl z-10 space-y-12">
        {/* Hero Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/20 text-red-400 text-sm font-semibold tracking-wide">
            <Radio className="w-4 h-4 animate-pulse text-red-500" />
            LIVE MULTI-CAMERA BROADCAST SUITE
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white">
            Event<span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-amber-500">Stream</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Produce professional multicam livestreams using only web browsers and mobile phones. No specialized hardware needed.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto p-4 rounded-xl border border-red-900/40 bg-red-950/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Create Event Panel */}
          <div className="glass-panel p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-500" />
                Initialize Production
              </h2>
              <p className="text-sm text-zinc-400">
                Setup a new workspace for your technical crew and streaming pipelines.
              </p>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Event Title</label>
                <input
                  type="text"
                  placeholder="e.g. Hackathon 2026 Keynote"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full bg-bg-darkest border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-red-500 transition-all font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !eventName}
                className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Workspace...' : 'Create Production'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Join Event Panel */}
          <div className="glass-panel p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-amber-500" />
                Connect Device
              </h2>
              <p className="text-sm text-zinc-400">
                Join an active event code as a camera feed, microphone source, or director.
              </p>
            </div>

            <form onSubmit={handleJoinEvent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Event Code</label>
                  <input
                    type="text"
                    placeholder="XYZ-123"
                    value={eventCode}
                    onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                    className="w-full bg-bg-darkest border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-all font-mono font-bold tracking-widest text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Device Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Stage Left"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full bg-bg-darkest border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Select Device Role</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeviceRole('CAMERA')}
                    className={`p-3 rounded-lg border text-left flex flex-col gap-2 transition-all ${
                      deviceRole === 'CAMERA'
                        ? 'bg-red-950/20 border-red-500/80 text-white'
                        : 'bg-bg-darkest border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Video className="w-4 h-4 text-red-500" />
                    <div>
                      <div className="text-xs font-bold">Camera Feed</div>
                      <div className="text-[10px] text-zinc-400">Stream HD Mobile Video</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceRole('AUDIO')}
                    className={`p-3 rounded-lg border text-left flex flex-col gap-2 transition-all ${
                      deviceRole === 'AUDIO'
                        ? 'bg-amber-950/20 border-amber-500/80 text-white'
                        : 'bg-bg-darkest border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Mic className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="text-xs font-bold">Audio Capture</div>
                      <div className="text-[10px] text-zinc-400">Dedicated Mic Source</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceRole('DIRECTOR')}
                    className={`p-3 rounded-lg border text-left flex flex-col gap-2 transition-all ${
                      deviceRole === 'DIRECTOR'
                        ? 'bg-blue-950/20 border-blue-500/80 text-white'
                        : 'bg-bg-darkest border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Sliders className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-xs font-bold">Director Console</div>
                      <div className="text-[10px] text-zinc-400">Manage Feed Switching</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceRole('VIEWER')}
                    className={`p-3 rounded-lg border text-left flex flex-col gap-2 transition-all ${
                      deviceRole === 'VIEWER'
                        ? 'bg-emerald-950/20 border-emerald-500/80 text-white'
                        : 'bg-bg-darkest border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Play className="w-4 h-4 text-emerald-500" />
                    <div>
                      <div className="text-xs font-bold">Viewer Screen</div>
                      <div className="text-[10px] text-zinc-400">Watch the Output Stream</div>
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !eventCode || !deviceName}
                className="w-full bg-zinc-100 hover:bg-white text-bg-darkest font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Registering Device...' : 'Connect to Production'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Roles Details / Architecture Highlight */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-900">
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-zinc-300">Ultra-Low Latency</div>
            <div className="text-xs text-zinc-500">&lt;500ms switching via SFU</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-zinc-300">Modular Inputs</div>
            <div className="text-xs text-zinc-500">Separated video/audio capture</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-zinc-300">Live Telemetry</div>
            <div className="text-xs text-zinc-500">Monitor battery, signal, & health</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-sm font-bold text-zinc-300">Cloud WebRTC</div>
            <div className="text-xs text-zinc-500">No software or plugins to install</div>
          </div>
        </div>
      </div>
    </div>
  );
}
