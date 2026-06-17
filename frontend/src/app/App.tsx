import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import DashboardPage from '../pages/DashboardPage';
import CameraDevicePage from '../pages/CameraDevicePage';
import AudioDevicePage from '../pages/AudioDevicePage';
import DirectorPanelPage from '../pages/DirectorPanelPage';
import ViewerPage from '../pages/ViewerPage';

function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-bg-darkest text-zinc-100 flex flex-col">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/event/:code/dashboard" element={<DashboardPage />} />
          <Route path="/event/:code/camera" element={<CameraDevicePage />} />
          <Route path="/event/:code/audio" element={<AudioDevicePage />} />
          <Route path="/event/:code/director" element={<DirectorPanelPage />} />
          <Route path="/event/:code/viewer" element={<ViewerPage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
