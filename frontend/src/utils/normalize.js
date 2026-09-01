/**
 * Normalize hand landmarks to translation- and scale-invariant features.
 * Mirrors the Python preprocessor.py logic exactly.
 *
 * Supports jednoručna (one-handed) and dvoručna (two-handed) HZJ signs.
 * Output is always 126 floats: [right_hand(63)] + [left_hand(63)]
 * Missing hand = zeros.
 */

function normalizeSingle(landmarks) {
  if (!landmarks || landmarks.length !== 21) return null

  // Backend may send compact 2D landmarks [x, y] for performance.
  // For normalization/training we treat missing z as 0.
  const [wxRaw, wyRaw, wzRaw] = landmarks[0]
  const wx = Number.isFinite(wxRaw) ? wxRaw : 0
  const wy = Number.isFinite(wyRaw) ? wyRaw : 0
  const wz = Number.isFinite(wzRaw) ? wzRaw : 0

  const pts = landmarks.map((lm) => {
    const [xRaw, yRaw, zRaw] = lm
    const x = Number.isFinite(xRaw) ? xRaw : 0
    const y = Number.isFinite(yRaw) ? yRaw : 0
    const z = Number.isFinite(zRaw) ? zRaw : 0
    return [x - wx, y - wy, z - wz]
  })

  // Scale: distance wrist → middle finger MCP (index 9)
  const [mx, my, mz] = pts[9]
  const scale = Math.sqrt(mx * mx + my * my + mz * mz)
  if (!Number.isFinite(scale) || scale < 1e-6) return null

  const normalized = pts.map(([x, y, z]) => [x / scale, y / scale, z / scale])
  // Preserve camera-space wrist position in the otherwise-zero wrist slot so
  // DTW can compare movement paths, not only changing finger shapes.
  normalized[0] = [wx, wy, wz]
  return normalized.flat()
}

/**
 * Build 126-dim feature vector from hand_data returned by the backend.
 * hand_data: { right: [[x,y,z]×21] | null, left: [[x,y,z]×21] | null }
 *
 * Also accepts raw single-hand landmark array for backwards compatibility.
 */
export function normalize(handDataOrLandmarks) {
  const zeros63 = new Array(63).fill(0)

  // Legacy: flat array of 21 landmarks passed directly
  if (Array.isArray(handDataOrLandmarks) && Array.isArray(handDataOrLandmarks[0])) {
    const right = normalizeSingle(handDataOrLandmarks) ?? zeros63
    return [...right, ...zeros63]
  }

  // New format: { right, left }
  const rightFeatures = normalizeSingle(handDataOrLandmarks?.right) ?? zeros63
  const leftFeatures  = normalizeSingle(handDataOrLandmarks?.left)  ?? zeros63

  return [...rightFeatures, ...leftFeatures]
}
