import { useEffect, useState } from 'react'
import Home from './pages/Home.jsx'
import TrainingPage from './pages/TrainingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { clearAdminToken, getCurrentAdmin } from './services/api.js'
import './App.css'

export default function App() {
  const [page, setPage] = useState('home')
  const [admin, setAdmin] = useState(null)

  useEffect(() => {
    getCurrentAdmin().then(setAdmin).catch(clearAdminToken)
  }, [])

  const logout = () => {
    clearAdminToken()
    setAdmin(null)
    setPage('home')
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <span className="logo">🤟 ZnakovniAI</span>
          <nav>
            <button
              className={`nav-btn ${page === 'home' ? 'active' : ''}`}
              onClick={() => setPage('home')}
            >
              Prepoznavanje
            </button>
            {admin ? (
              <>
                <button className={`nav-btn ${page === 'training' ? 'active' : ''}`} onClick={() => setPage('training')}>
                  Treniranje
                </button>
                <button className="nav-btn" onClick={logout}>Odjava</button>
              </>
            ) : (
              <button className={`nav-btn ${page === 'login' ? 'active' : ''}`} onClick={() => setPage('login')}>
                Admin
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        {page === 'home' && <Home />}
        {page === 'login' && !admin && <LoginPage onLogin={(username) => { setAdmin({ username }); setPage('training') }} onCancel={() => setPage('home')} />}
        {page === 'training' && admin && <TrainingPage />}
      </main>
    </div>
  )
}
