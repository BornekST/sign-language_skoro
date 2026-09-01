import { useState } from 'react'
import { loginAdmin } from '../services/api.js'

export default function LoginPage({ onLogin, onCancel }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await loginAdmin(username, password)
      onLogin(username)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>Administratorska prijava</h2>
        <p className="login-hint">Treniranje i upravljanje uzorcima dostupno je samo administratoru.</p>
        <label>
          Korisničko ime
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Lozinka
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
        </label>
        {error && <div className="login-error">{error}</div>}
        <div className="login-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Odustani</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Prijava…' : 'Prijavi se'}</button>
        </div>
      </form>
    </div>
  )
}
