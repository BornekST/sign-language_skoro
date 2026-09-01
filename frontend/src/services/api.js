const BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'znakovni_admin_token'

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY)
export const clearAdminToken = () => localStorage.removeItem(TOKEN_KEY)

function adminHeaders(json = false) {
  const token = getAdminToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function loginAdmin(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Prijava nije uspjela')
  }
  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, data.access_token)
  return data
}

export async function getCurrentAdmin() {
  const res = await fetch(`${BASE}/api/auth/me`, { headers: adminHeaders() })
  if (!res.ok) throw new Error('Administrator nije prijavljen')
  return res.json()
}

export async function fetchSigns() {
  const res = await fetch(`${BASE}/api/signs/`)
  if (!res.ok) throw new Error('Failed to fetch signs')
  return res.json()
}

export async function createSign(name, description = '') {
  const res = await fetch(`${BASE}/api/signs/`, {
    method: 'POST',
    headers: adminHeaders(true),
    body: JSON.stringify({ name, description }),
  })
  if (!res.ok) throw new Error('Failed to create sign')
  return res.json()
}

export async function deleteSign(id) {
  const res = await fetch(`${BASE}/api/signs/${id}`, { method: 'DELETE', headers: adminHeaders() })
  if (!res.ok) throw new Error('Failed to delete sign')
}

export async function addTrainingSample(sign_name, features) {
  const res = await fetch(`${BASE}/api/training/samples`, {
    method: 'POST',
    headers: adminHeaders(true),
    body: JSON.stringify({ sign_name, features }),
  })
  if (!res.ok) throw new Error('Failed to add sample')
  return res.json()
}

export async function getSampleCounts() {
  const res = await fetch(`${BASE}/api/training/samples/count`, { headers: adminHeaders() })
  if (!res.ok) throw new Error('Failed to get sample counts')
  return res.json()
}

export async function deleteSamples(sign_name) {
  const res = await fetch(`${BASE}/api/training/samples/${encodeURIComponent(sign_name.trim())}`, { method: 'DELETE', headers: adminHeaders() })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Brisanje nije uspjelo')
  }
  return res.json()
}

export async function startTraining() {
  const res = await fetch(`${BASE}/api/training/train`, {
    method: 'POST',
    headers: adminHeaders(true),
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Training failed to start')
  }
  return res.json()
}

export async function getTrainingStatus() {
  const res = await fetch(`${BASE}/api/training/train/status`, { headers: adminHeaders() })
  if (!res.ok) throw new Error('Failed to get training status')
  return res.json()
}

export async function getRecognitionStatus() {
  const res = await fetch(`${BASE}/api/recognition/status`)
  if (!res.ok) throw new Error('Failed to get recognition status')
  return res.json()
}

/**
 * Synthesize Croatian text via backend espeak-ng TTS.
 * Returns an AudioBuffer-ready Blob (audio/wav).
 * voice: "female" | "male"
 */
export async function synthesizeSpeech(text, voice = 'female') {
  const res = await fetch(`${BASE}/api/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  })
  if (!res.ok) throw new Error('TTS synthesis failed')
  return res.blob()
}
