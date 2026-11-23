import { Alkove, createAgentInput } from 'alkove'

const modeListeners = new Set()

let installed = false
let originalGetUserMedia = null
let context = null
let current = null
let pending = null
let speaking = false
let configured = false
let ingesting = false
let gatedTrack = null

export function isElevenLabsCapture(constraints) {
  const audio = constraints?.audio
  if (!audio || typeof audio !== 'object') {
    return false
  }
  // The SDK marks its own capture with voiceIsolation. Alkove opens the raw
  // microphone with that flag off, so the two calls stay distinct.
  return audio.voiceIsolation === true
}

function configureOnce() {
  if (configured || typeof window === 'undefined') {
    return
  }
  configured = true
  Alkove.configure({
    modelBaseUrl: '/alkove/',
    assetBaseUrl: '/alkove/',
  })
}

function notify(direct) {
  modeListeners.forEach((listener) => listener(direct))
}

export function onIsolationMode(listener) {
  modeListeners.add(listener)
  return () => modeListeners.delete(listener)
}

export function primeModels() {
  configureOnce()
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  return Alkove.preload('agent').catch(() => {})
}

export function warmAudio() {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return null
  }
  installIsolation()
  if (!context || context.state === 'closed') {
    context = new AudioContext()
  }
  context.resume().catch(() => {})
  return context
}

export function markAgentSpeaking(on) {
  speaking = on
  current?.farEndActive(Boolean(on))
}

function applyIngest() {
  if (gatedTrack && gatedTrack.readyState === 'live') {
    gatedTrack.enabled = ingesting
  }
}

export function silenceUntilHeld(track) {
  gatedTrack = track
  track.enabled = ingesting
  return track
}

export function setIngesting(on) {
  ingesting = Boolean(on)
  applyIngest()
}

export function releaseIsolation() {
  const input = current
  current = null
  gatedTrack = null
  ingesting = false
  speaking = false
  notify(false)
  if (input && input.status !== 'disposed') {
    input.dispose()
  }
}

function attach(input) {
  const stopListening = input.on('mode', (event) => {
    const direct = event.mode === 'raw' && event.reason && event.reason !== 'loading'
    notify(direct)
  })
  input.farEndActive(speaking)
  input.track?.addEventListener('ended', () => {
    stopListening()
    if (gatedTrack === input.track) {
      gatedTrack = null
    }
    if (current === input) {
      current = null
      notify(false)
    }
    if (input.status !== 'disposed') {
      input.dispose()
    }
  })
}

async function isolatedStream() {
  if (pending) {
    return pending
  }
  const audioContext = warmAudio()
  const run = (async () => {
    if (current && current.status !== 'disposed') {
      current.dispose()
      current = null
    }
    let input = null
    try {
      input = await createAgentInput({
        audioContext: audioContext ?? undefined,
        near: true,
        farEnd: 'manual',
        withTrack: true,
        normalize: true,
      })
      current = input
      attach(input)
      const track = input.track
      if (!track || track.readyState !== 'live') {
        throw new Error('O isolador não abriu o microfone.')
      }
      return new MediaStream([silenceUntilHeld(track)])
    } catch (error) {
      if (input && input.status !== 'disposed') {
        input.dispose()
      }
      if (current === input) {
        current = null
      }
      throw error
    }
  })()
  pending = run.finally(() => {
    pending = null
  })
  return pending
}

export function installIsolation() {
  if (installed || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return
  }
  installed = true
  configureOnce()
  originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = (constraints) => {
    if (!isElevenLabsCapture(constraints)) {
      return originalGetUserMedia(constraints)
    }
    return isolatedStream().catch(() => {
      notify(true)
      return originalGetUserMedia(constraints).then((stream) => {
        const track = stream.getAudioTracks()[0]
        if (track) {
          silenceUntilHeld(track)
        }
        return stream
      })
    })
  }
}
