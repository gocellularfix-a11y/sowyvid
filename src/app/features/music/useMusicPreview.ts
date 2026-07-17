import { useEffect, useRef, useState } from 'react'
import { musicUrl } from '@features/music/musicUrl'

/**
 * ONE shared preview player for the whole Music Center. A single `<audio>`
 * element plays through the production media protocol (`sowyvid-media://music/`)
 * — the exact managed bytes the render later uses — so previewing is honest.
 *
 * Starting another track stops the current one: only one song ever plays. The
 * preview VOLUME here is the listening level, completely separate from a
 * commercial's background-music volume.
 */
export interface MusicPreview {
  playingId: string | null
  currentTime: number
  duration: number
  volume: number
  loading: boolean
  failed: boolean
  toggle: (trackId: string) => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  stop: () => void
}

export function useMusicPreview(): MusicPreview {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // Lazily create the single audio element and keep it for the component's life.
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
    audioRef.current.preload = 'metadata'
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = (): void => setCurrentTime(audio.currentTime)
    const onMeta = (): void => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onPlaying = (): void => setLoading(false)
    const onWaiting = (): void => setLoading(true)
    const onEnded = (): void => {
      setPlayingId(null)
      setCurrentTime(0)
    }
    const onError = (): void => {
      setFailed(true)
      setLoading(false)
      setPlayingId(null)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [])

  const stop = (): void => {
    const audio = audioRef.current
    if (audio) audio.pause()
    setPlayingId(null)
  }

  const toggle = (trackId: string): void => {
    const audio = audioRef.current
    if (!audio) return
    if (playingId === trackId) {
      audio.pause()
      setPlayingId(null)
      return
    }
    // Switching tracks: stop the old one first — never two at once.
    setFailed(false)
    setLoading(true)
    setCurrentTime(0)
    setDuration(0)
    audio.src = musicUrl(trackId)
    audio.volume = volume
    void audio.play().catch(() => {
      setFailed(true)
      setLoading(false)
      setPlayingId(null)
    })
    setPlayingId(trackId)
  }

  const seek = (seconds: number): void => {
    const audio = audioRef.current
    if (audio && Number.isFinite(seconds)) {
      audio.currentTime = seconds
      setCurrentTime(seconds)
    }
  }

  const setVolume = (v: number): void => {
    const clamped = Math.min(1, Math.max(0, v))
    setVolumeState(clamped)
    if (audioRef.current) audioRef.current.volume = clamped
  }

  return { playingId, currentTime, duration, volume, loading, failed, toggle, seek, setVolume, stop }
}
