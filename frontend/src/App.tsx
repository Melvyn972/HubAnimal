import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import ConsultationPage from './pages/ConsultationPage'
import HomePage from './pages/HomePage'
import PatientPage from './pages/PatientPage'
import './poc.css'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="topbar">
          <div className="brand">Hub Animal</div>
          <nav className="nav">
            <a className="link" href="#/">
              Accueil
            </a>
          </nav>
        </header>

        <main className="container">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/patients/:patientId" element={<PatientPage />} />
            <Route path="/consultation" element={<ConsultationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
