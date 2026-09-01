function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function stats(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!valid.length) return { count: 0, mean: null, min: null, max: null, p95: null }
  const p95Index = Math.min(valid.length - 1, Math.ceil(valid.length * 0.95) - 1)
  return {
    count: valid.length,
    mean: round(valid.reduce((sum, value) => sum + value, 0) / valid.length),
    min: round(valid[0]),
    max: round(valid[valid.length - 1]),
    p95: round(valid[p95Index]),
  }
}

function words(value) {
  return value.trim().toUpperCase().split(/\s+/).filter(Boolean)
}

function editDistance(expected, recognized) {
  const rows = Array.from({ length: expected.length + 1 }, (_, i) => {
    const row = new Array(recognized.length + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j <= recognized.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= recognized.length; j += 1) {
      const substitution = expected[i - 1] === recognized[j - 1] ? 0 : 1
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + substitution,
      )
    }
  }
  return rows[expected.length][recognized.length]
}

function predictionRuns(frames) {
  const runs = []
  let current = null
  for (const frame of frames) {
    if (!frame.hand_detected || !frame.sign) {
      current = null
      continue
    }
    if (!current || current.word !== frame.sign) {
      current = { word: frame.sign, frames: 0, confidences: [] }
      runs.push(current)
    }
    current.frames += 1
    current.confidences.push(frame.confidence)
  }
  return runs.map((run) => ({
    word: run.word,
    frames: run.frames,
    mean_confidence_percent: round(
      run.confidences.reduce((sum, value) => sum + value, 0) / run.confidences.length * 100,
    ),
  }))
}

export function buildSessionReport({ startedAt, endedAt, frames, expectedText, recognizedText }) {
  const expectedWords = words(expectedText)
  const recognizedWords = words(recognizedText)
  const recognizedFrames = frames.filter((frame) => frame.sign)
  const confidenceValues = recognizedFrames.map((frame) => frame.confidence * 100)

  let stablePairs = 0
  let comparablePairs = 0
  let previousSign = null
  for (const frame of frames) {
    if (!frame.hand_detected || !frame.sign) {
      previousSign = null
      continue
    }
    if (previousSign !== null) {
      comparablePairs += 1
      if (previousSign === frame.sign) stablePairs += 1
    }
    previousSign = frame.sign
  }

  const distance = expectedWords.length ? editDistance(expectedWords, recognizedWords) : null
  const accuracy = expectedWords.length
    ? Math.max(0, 1 - distance / expectedWords.length) * 100
    : null

  return {
    report_version: 1,
    session: {
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
      total_processed_frames: frames.length,
      frames_with_detected_hands: frames.filter((frame) => frame.hand_detected).length,
      frames_with_prediction: recognizedFrames.length,
    },
    recognition: {
      expected_text: expectedText.trim() || null,
      recognized_text: recognizedText.trim(),
      expected_words: expectedWords,
      recognized_words: recognizedWords,
      word_edit_distance: distance,
      word_accuracy_percent: round(accuracy),
      accuracy_note: expectedWords.length
        ? 'Izračunato iz udaljenosti uređivanja između očekivanih i prepoznatih riječi.'
        : 'Nije izračunato jer očekivani tekst nije unesen.',
      prediction_runs: predictionRuns(frames),
    },
    confidence_percent: stats(confidenceValues),
    robustness: {
      prediction_stability_percent: comparablePairs ? round(stablePairs / comparablePairs * 100) : null,
      high_confidence_frame_rate_percent: recognizedFrames.length
        ? round(recognizedFrames.filter((frame) => frame.confidence >= 0.78).length / recognizedFrames.length * 100)
        : null,
      note: 'Robusnost je procjena stabilnosti uzastopnih predikcija, a ne test na vanjskom skupu podataka.',
    },
    latency_ms: {
      backend_processing: stats(frames.map((frame) => frame.processing_ms)),
      client_round_trip: stats(frames.map((frame) => frame.round_trip_ms)),
    },
  }
}

export function downloadSessionReport(report) {
  const stamp = report.session.ended_at.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `izvjestaj-prepoznavanja_${stamp}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
