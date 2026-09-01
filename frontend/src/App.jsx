import { useState } from 'react'
import Home from './pages/Home.jsx'
import TrainingPage from './pages/TrainingPage.jsx'
import './App.css'

export default function App() {
  const [page, setPage] = useState('home')

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
            <button
              className={`nav-btn ${page === 'training' ? 'active' : ''}`}
              onClick={() => setPage('training')}
            >
              Treniranje
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        {page === 'home' ? <Home /> : <TrainingPage />}
      </main>
    </div>
  )
}
