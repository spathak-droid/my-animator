const normalizeHex = (hex: string): string => {
  const stripped = hex.replace('#', '')
  if (stripped.length === 3) {
    return stripped
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
  }
  return stripped.padEnd(6, '0').slice(0, 6)
}

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex)
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const toHexChannel = (value: number) => clamp(value, 0, 255).toString(16).padStart(2, '0')

export const hexToRgba = (hex: string, alpha = 1): string => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

export const adjustHexBrightness = (hex: string, amount: number): string => {
  const { r, g, b } = hexToRgb(hex)
  const delta = clamp(amount, -1, 1) * 255
  const nextR = Math.round(clamp(r + delta, 0, 255))
  const nextG = Math.round(clamp(g + delta, 0, 255))
  const nextB = Math.round(clamp(b + delta, 0, 255))
  return `#${toHexChannel(nextR)}${toHexChannel(nextG)}${toHexChannel(nextB)}`
}
