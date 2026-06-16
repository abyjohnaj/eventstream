import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.tsx';
import Dashboard from './pages/Dashboard.tsx';
import CameraDevice from './pages/CameraDevice.tsx';
import AudioDevice from './pages/AudioDevice.tsx';
import DirectorPanel from './pages/DirectorPanel.tsx';
import ViewerPage from './pages/ViewerPage.tsx';

function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-bg-darkest text-zinc-100 flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/event/:code/dashboard" element={<Dashboard />} />
          <Route path="/event/:code/camera" element={<CameraDevice />} />
          <Route path="/event/:code/audio" element={<AudioDevice />} />
          <Route path="/event/:code/director" element={<DirectorPanel />} />
          <Route path="/event/:code/viewer" element={<ViewerPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
