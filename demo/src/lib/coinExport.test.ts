import { describe, expect, it } from 'vitest'
import {
  EXPORT_FRAME_COUNT,
  angleAtFrame,
  frameTimestampUs,
  DEMO_URL,
  SHARE_TEXT,
  buildFilename,
  buildXIntentUrl,
  pickExportFormat,
  rotationAtProgress,
} from './coinExport'

describe('pickExportFormat', () => {
  it('prefers H.264 mp4 when supported', () => {
    expect(pickExportFormat(() => true)).toEqual({ mimeType: 'video/mp4;codecs=avc1.640028', extension: 'mp4' })
  })
  it('falls back to a bare mp4 when no H.264 profile is advertised', () => {
    expect(pickExportFormat((m) => m === 'video/mp4' || m.startsWith('video/webm'))).toEqual({
      mimeType: 'video/mp4',
      extension: 'mp4',
    })
  })
  it('falls back to vp9 webm, then plain webm', () => {
    expect(pickExportFormat((m) => m.startsWith('video/webm'))).toEqual({
      mimeType: 'video/webm;codecs=vp9',
      extension: 'webm',
    })
    expect(pickExportFormat((m) => m === 'video/webm')).toEqual({ mimeType: 'video/webm', extension: 'webm' })
  })
  it('returns null when nothing is supported', () => {
    expect(pickExportFormat(() => false)).toBeNull()
  })
})

describe('rotationAtProgress', () => {
  it('runs linearly from 0 to one full turn', () => {
    expect(rotationAtProgress(0)).toBe(0)
    expect(rotationAtProgress(0.25)).toBeCloseTo(Math.PI / 2)
    expect(rotationAtProgress(1)).toBeCloseTo(Math.PI * 2)
  })
  it('clamps out-of-range progress', () => {
    expect(rotationAtProgress(-1)).toBe(0)
    expect(rotationAtProgress(3)).toBeCloseTo(Math.PI * 2)
  })
})

describe('buildFilename', () => {
  it('uses the logo name', () => {
    expect(buildFilename('Firebird', 'mp4')).toBe('coin-firebird.mp4')
  })
  it('strips the extension and unsafe characters from uploads', () => {
    expect(buildFilename('My Logo (v2).PNG', 'webm')).toBe('coin-my-logo-v2.webm')
  })
  it('falls back to custom', () => {
    expect(buildFilename('', 'mp4')).toBe('coin-custom.mp4')
    expect(buildFilename(null, 'webm')).toBe('coin-custom.webm')
    expect(buildFilename('日本', 'mp4')).toBe('coin-custom.mp4')
  })
})

describe('buildXIntentUrl', () => {
  it('prefills text and the demo url', () => {
    const u = new URL(buildXIntentUrl())
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post')
    expect(u.searchParams.get('text')).toBe(SHARE_TEXT)
    expect(u.searchParams.get('url')).toBe(DEMO_URL)
  })
})

describe('frame-exact timeline', () => {
  it('has 180 frames for 6 s at 30 fps', () => {
    expect(EXPORT_FRAME_COUNT).toBe(180)
  })
  it('starts face-on and ends one step short of a full turn', () => {
    expect(angleAtFrame(0)).toBe(0)
    expect(angleAtFrame(90)).toBeCloseTo(Math.PI)
    expect(angleAtFrame(EXPORT_FRAME_COUNT - 1)).toBeCloseTo(Math.PI * 2 - (Math.PI * 2) / EXPORT_FRAME_COUNT)
  })
  it('steps timestamps at a constant rate', () => {
    expect(frameTimestampUs(0)).toBe(0)
    expect(frameTimestampUs(30)).toBe(1_000_000)
    expect(frameTimestampUs(1) - frameTimestampUs(0)).toBe(33_333)
  })
})
