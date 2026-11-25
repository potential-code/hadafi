import { describe, expect, it } from 'bun:test'
import { initialsAvatar } from '../initialsAvatar'

/** Mentor avatars are drawn locally: no third party ever receives a name. */
const svgOf = (url: string) => decodeURIComponent(url.slice(url.indexOf(',') + 1))

describe('initialsAvatar', () => {
  it('is an SVG data URL with up to two initials, in Hadafi magenta', () => {
    const url = initialsAvatar('Sara Al Mansoori')
    expect(url.startsWith('data:image/svg+xml')).toBe(true)
    expect(svgOf(url)).toContain('>SA</text>')
    expect(svgOf(url)).toContain('fill="#c8106a"')
  })

  it('never lets a name inject markup', () => {
    expect(svgOf(initialsAvatar('<x> &y'))).not.toMatch(/<x|&y/)
  })

  it('falls back to ? for an empty name', () => {
    expect(svgOf(initialsAvatar('  '))).toContain('>?</text>')
  })
})
