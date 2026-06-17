import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Mic, Sliders, Play, Plus, ArrowRight, Radio, Monitor, X } from 'lucide-react';
import { API_URL } from '../config/env';

interface ConnectedDevice {
  id: string;
  name: string;
  role: 'CAMERA' | 'AUDIO' | 'DIRECTOR' | 'VIEWER';
}

export default function HomePage() {
  const navigate = useNavigate();

  const [eventName, setEventName] = useState('');
  const [createdEvent, setCreatedEvent] = useState<{ name: string; code: string } | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [showAddDevice, setShowAddDevice] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceRole, setDeviceRole] = useState<'CAMERA' | 'AUDIO' | 'DIRECTOR' | 'VIEWER'>('CAMERA');
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (createdEvent) {
      setJoinCode(createdEvent.code);
    }
  }, [createdEvent]);

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
      if (!res.ok) throw new Error('Failed to create event');
      const data = await res.json();
      setCreatedEvent({ name: eventName, code: data.eventCode });
      setIsLive(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create event. Is backend API running?');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = createdEvent?.code || joinCode;
    if (!code.trim() || !deviceName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const checkRes = await fetch(`${API_URL}/api/events/${code.toUpperCase()}`);
      if (!checkRes.ok) throw new Error('Event not found. Check the code.');

      const joinRes = await fetch(`${API_URL}/api/events/${code.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: deviceRole, name: deviceName }),
      });
      if (!joinRes.ok) {
        const errorData = await joinRes.json();
        throw new Error(errorData.error || 'Failed to join event');
      }
      const joinData = await joinRes.json();

      sessionStorage.setItem(`lk_token_${code.toUpperCase()}`, joinData.token);
      sessionStorage.setItem(`lk_url_${code.toUpperCase()}`, joinData.livekitUrl);
      sessionStorage.setItem(`device_name_${code.toUpperCase()}`, deviceName);
      sessionStorage.setItem(`device_id_${code.toUpperCase()}`, joinData.device.id);

      if (deviceRole === 'CAMERA') navigate(`/event/${code.toUpperCase()}/camera`);
      else if (deviceRole === 'AUDIO') navigate(`/event/${code.toUpperCase()}/audio`);
      else if (deviceRole === 'DIRECTOR') navigate(`/event/${code.toUpperCase()}/director`);
      else navigate(`/event/${code.toUpperCase()}/viewer`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to join. Is backend API running?');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !deviceName.trim()) return;
    await handleAddDevice(e);
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case 'CAMERA': return <Video className="w-4 h-4 text-emerald-400" />;
      case 'AUDIO': return <Mic className="w-4 h-4 text-emerald-400" />;
      case 'DIRECTOR': return <Monitor className="w-4 h-4 text-emerald-400" />;
      case 'VIEWER': return <Play className="w-4 h-4 text-emerald-400" />;
      default: return <Video className="w-4 h-4 text-emerald-400" />;
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'CAMERA': return 'Camera';
      case 'AUDIO': return 'Audio';
      case 'DIRECTOR': return 'Director';
      case 'VIEWER': return 'Viewer';
      default: return role;
    }
  };

  return (
    // 🔴 RED — home-shell (root wrapper)
    <div className="home-shell" style={{ border: '2px solid red' }}>

      {/* 🟦 CYAN — Top Bar */}
      <header className="home-topbar" style={{ border: '2px solid cyan' }}>
        <div className="home-topbar__brand">
          <Radio className="w-4 h-4 text-emerald-400" />
          <span className="home-topbar__title">EventStream</span>
        </div>
        <div className="home-topbar__status">
          <span className="home-topbar__status-label">Status</span>
          <span className={`home-topbar__dot ${isLive ? 'home-topbar__dot--live' : ''}`} />
          <span className={`home-topbar__status-value ${isLive ? 'home-topbar__status-value--live' : ''}`}>
            {isLive ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      {/* 🟠 TOP ROW — Production + New Panel side by side */}
      <div className="home-top-row" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100%' }}>

        {/* 🟡 YELLOW — Production Section */}
        <section
          className="home-production"
          style={{ border: '2px solid yellow', width: isMobile ? '100%' : '450px', minWidth: 0, flexShrink: 1 }}
        >

          {/* 🟠 ORANGE — Top Row */}
          <div className="home-production__row--top" style={{ border: '2px solid orange' }}>
            <h2 className="home-production__heading">Production</h2>

            {createdEvent ? (
              // 🟤 GOLDENROD — info block when event created
              <div className="home-production__info" style={{ border: '2px solid goldenrod' }}>
                <div className="home-production__field">
                  <span className="home-production__label">Event:</span>
                  <span className="home-production__value">{createdEvent.name}</span>
                </div>
                <div className="home-production__field">
                  <span className="home-production__label">Code:</span>
                  <span className="home-production__value home-production__code">{createdEvent.code}</span>
                </div>
                <button
                  className="home-production__dashboard-btn"
                  onClick={() => navigate(`/event/${createdEvent.code}/dashboard`)}
                >
                  [ View Dashboard ]
                </button>
              </div>
            ) : (
              // 🟤 GOLDENROD — info block (no event yet)
              <div className="home-production__info" style={{ border: '2px solid goldenrod' }}>
                <div className="home-production__field">
                  <span className="home-production__label">Code:</span>
                  <input
                    type="text"
                    placeholder="5RE"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="home-production__input home-production__input--code"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 🟠 ORANGE dashed — Bottom Row (only when no event) */}
          {!createdEvent && (
            <div className="home-production__row--bottom" style={{ border: '2px dashed orange' }}>
              <div className="home-production__field">
                <span className="home-production__label">Event Name:</span>
                <input
                  type="text"
                  placeholder="Summer Media Shoot"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="home-production__input"
                />
              </div>
              <button
                type="submit"
                onClick={handleCreateEvent}
                disabled={loading || !eventName}
                className="home-production__create-btn"
              >
                {loading ? '[ Creating... ]' : '[ Create Production ]'}
              </button>
            </div>
          )}

          {error && <div className="home-production__error">{error}</div>}
        </section>

        {/* 🟩 LIME — New Panel (top-right area, next to Production) */}
        <div className="home-top-right" style={{ border: '2px solid lime', flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined, minHeight: 120, padding: '12px' }}>
          {/* New content goes here */}
        </div>

      </div>{/* end home-top-row */}

      {/* 🟣 PURPLE — Main Content wrapper */}
      <div className="home-main" style={{ border: '2px solid purple' }}>

        {/* 🟢 GREEN — Connected Devices Panel */}
        <section className="home-devices" style={{ border: '2px solid green' }}>
          <h3 className="home-devices__heading">Connected Devices</h3>

          {/* 🟢 GREEN dashed — devices list */}
          <div className="home-devices__list" style={{ border: '2px dashed green' }}>
            {connectedDevices.length > 0 ? (
              connectedDevices.map((d) => (
                <div key={d.id} className="home-devices__item">
                  {roleIcon(d.role)}
                  <span className="home-devices__name">{d.name}</span>
                  <span className="home-devices__dot" />
                </div>
              ))
            ) : (
              <>
                <div className="home-devices__item home-devices__item--placeholder">
                  <Video className="w-4 h-4 text-zinc-600" />
                  <span className="home-devices__name home-devices__name--dim">Cam A</span>
                  <span className="home-devices__dot home-devices__dot--idle" />
                </div>
                <div className="home-devices__item home-devices__item--placeholder">
                  <Video className="w-4 h-4 text-zinc-600" />
                  <span className="home-devices__name home-devices__name--dim">Cam B</span>
                  <span className="home-devices__dot home-devices__dot--idle" />
                </div>
                <div className="home-devices__item home-devices__item--placeholder">
                  <Mic className="w-4 h-4 text-zinc-600" />
                  <span className="home-devices__name home-devices__name--dim">Audio</span>
                  <span className="home-devices__dot home-devices__dot--idle" />
                </div>
                <div className="home-devices__item home-devices__item--placeholder">
                  <Monitor className="w-4 h-4 text-zinc-600" />
                  <span className="home-devices__name home-devices__name--dim">Director</span>
                  <span className="home-devices__dot home-devices__dot--idle" />
                </div>
              </>
            )}
          </div>

          <button className="home-devices__add-btn" onClick={() => setShowAddDevice(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Device
          </button>
        </section>

        {/* 🔵 BLUE — Live Preview Panel */}
        <section className="home-preview" style={{ border: '2px solid blue' }}>
          <h3 className="home-preview__heading">Live Preview</h3>

          {/* 🔵 BLUE dashed — viewport */}
          <div className="home-preview__viewport" style={{ border: '2px dashed blue' }}>
            <span className="home-preview__placeholder">No video input</span>
          </div>
        </section>
      </div>

      {/* 🩷 PINK — Footer Timeline */}
      <footer className="home-timeline" style={{ border: '2px solid hotpink' }}>
        <span className="home-timeline__label">Timeline / Scene Controls</span>
      </footer>

      {/* 🟣 FUCHSIA — Modal Overlay */}
      {showAddDevice && (
        <div className="home-modal-overlay" style={{ border: '2px solid fuchsia' }} onClick={() => setShowAddDevice(false)}>

          {/* 🟣 VIOLET — Modal box */}
          <div className="home-modal" style={{ border: '2px solid violet' }} onClick={(e) => e.stopPropagation()}>

            {/* 🟣 ORCHID — Modal header */}
            <div className="home-modal__header" style={{ border: '2px dashed orchid' }}>
              <h3 className="home-modal__title">Connect Device</h3>
              <button className="home-modal__close" onClick={() => setShowAddDevice(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 🟣 PLUM — Modal form */}
            <form onSubmit={handleAddDevice} className="home-modal__form" style={{ border: '2px dashed plum' }}>

              {/* each field gets a dotted mediumpurple border */}
              <div className="home-modal__field" style={{ border: '1px dotted mediumpurple' }}>
                <label className="home-modal__label">Event Code</label>
                <input
                  type="text"
                  placeholder="5RE"
                  value={createdEvent ? createdEvent.code : joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  readOnly={!!createdEvent}
                  className="home-modal__input home-modal__input--mono"
                />
              </div>

              <div className="home-modal__field" style={{ border: '1px dotted mediumpurple' }}>
                <label className="home-modal__label">Device Name</label>
                <input
                  type="text"
                  placeholder="e.g. Stage Left"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="home-modal__input"
                />
              </div>

              <div className="home-modal__field" style={{ border: '1px dotted mediumpurple' }}>
                <label className="home-modal__label">Role</label>
                {/* 🟤 TAN — roles button group */}
                <div className="home-modal__roles" style={{ border: '1px dotted tan' }}>
                  {(['CAMERA', 'AUDIO', 'DIRECTOR', 'VIEWER'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setDeviceRole(role)}
                      className={`home-modal__role-btn ${deviceRole === role ? 'home-modal__role-btn--active' : ''}`}
                    >
                      {roleIcon(role)}
                      <span>{roleLabel(role)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="home-production__error">{error}</div>}

              <button
                type="submit"
                disabled={loading || !deviceName || !(createdEvent?.code || joinCode)}
                className="home-modal__submit"
              >
                {loading ? 'Connecting...' : 'Connect'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}