import { describe, expect, it } from 'vitest'
import { isAllowedImageType } from './fileValidation'

describe('isAllowedImageType', () => {
  it('accepts common image mime types', () => {
    expect(isAllowedImageType('image/png')).toBe(true)
    expect(isAllowedImageType('image/jpeg')).toBe(true)
    expect(isAllowedImageType('image/webp')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isAllowedImageType('IMAGE/PNG')).toBe(true)
  })

  it('rejects non-image types', () => {
    expect(isAllowedImageType('text/plain')).toBe(false)
    expect(isAllowedImageType('application/pdf')).toBe(false)
    expect(isAllowedImageType('')).toBe(false)
  })
})
