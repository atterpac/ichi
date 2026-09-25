export const pixelStyles = [
  {
    id: 'relay',
    name: 'Relay',
    category: 'POCKET ROBOTS',
    description: 'Little machines with aerials, faceplates, and mismatched panels.',
    note: 'A mechanical companion for a developer tool.',
  },
  {
    id: 'spore',
    name: 'Spore',
    category: 'FOREST FOLK',
    description: 'Spotted mushroom caps over tiny, curious faces.',
    note: 'The broad cap makes a strong small-size silhouette.',
  },
  {
    id: 'lumen',
    name: 'Lumen',
    category: 'NIGHT MOTHS',
    description: 'Symmetrical wings with a personal pattern of luminous scales.',
    note: 'Pattern-led identity, without a cartoon face.',
  },
  {
    id: 'alley',
    name: 'Alley',
    category: 'STRAY CATS',
    description: 'Tall ears, bright eyes, a cream muzzle, and distinct coat patterns.',
    note: 'A familiar face with plenty of variation.',
  },
] as const
export type PixelStyle = (typeof pixelStyles)[number]['id']

const masks: Record<PixelStyle, string[]> = {
  relay: [
    '................',
    '.......??.......',
    '.......BB.......',
    '........A.......',
    '....AAAAAAAA....',
    '...AAHHHHHHAA...',
    '..BAKKKKKKKKAB..',
    '..BAKeKKKKeKAB..',
    '..BAKKKKKKKKAB..',
    '...AAAAAAAAAA...',
    '...ABBBBBBBBA...',
    '...AAKAKAKAAA...',
    '....AAAAAAAA....',
    '.....AA..AA.....',
    '....BBB..BBB....',
    '................',
  ],
  spore: [
    '................',
    '......AAAA......',
    '....AAAAAAAA....',
    '...AA**AAA*AA...',
    '..AAA**AA**AAA..',
    '.AA*AAAAAAAAAAA.',
    '.A**AAAAA**AAAA.',
    'AAAAAAAAAAAAAAAA',
    '.BBBBBBBBBBBBBB.',
    '....HHHHHHHH....',
    '.....HeHHeH.....',
    '.....HoHHoH.....',
    '.....HHHHHH.....',
    '......HooH......',
    '.....BBBBBB.....',
    '................',
  ],
  lumen: [
    '................',
    '.....A....A.....',
    '......A..A......',
    '.AA....AA....AA.',
    '.ABBA..AA..ABBA.',
    '.AB*BAAAAAAB*BA.',
    '.ABBBAAAAAABBBA.',
    '..ABBBAAAABBBA..',
    '...ABBAAAABBA...',
    '....AAAAAAA.....',
    '...ABBBAABBBA...',
    '..AB*BAAAAB*BA..',
    '..ABBBAAAABBBA..',
    '...AA..AA..AA...',
    '.......AA.......',
    '................',
  ],
  alley: [
    '................',
    '..AA........AA..',
    '..APA......APA..',
    '..APPAAAAAAPPA..',
    '..AAAAAAAAAAAA..',
    '.AAAAAABBAAAAAA.',
    '.AAeeAAAAAAeeAA.',
    '.AAeoAAAAAAoeAA.',
    '.AAAAAAAAAAAAAA.',
    'HHAAHHHPPHHHAAHH',
    '..AAHHHoHHHHAA..',
    '...AAHoHHoHAA...',
    '....AAHHHHAA....',
    '.....AAAAAA.....',
    '......BBBB......',
    '................',
  ],
}

export function pixelCreature(
  style: PixelStyle,
  r: () => number,
  palette: readonly string[],
): string {
  const grid = masks[style].map((row) => row.split(''))
  const offset = Math.floor(r() * palette.length)
  const colors: Record<string, string> = {
    A: palette[offset]!,
    B: palette[(offset + 1) % palette.length]!,
    H: '#f5e8cb',
    K: '#242332',
    e: '#fff5db',
    o: '#222131',
    P: '#eaa4a0',
  }
  // Coat markings vary within the silhouette, rather than changing only hue.
  const patches = Array.from({ length: 3 }, () => ({
    x: 3 + Math.floor(r() * 10),
    y: 3 + Math.floor(r() * 8),
    radius: 1 + Math.floor(r() * 2),
  }))
  const eyeMode = Math.floor(r() * 3)
  if (style === 'relay') {
    const aerial = 4 + Math.floor(r() * 8)
    grid[0]![aerial] = 'B'
    grid[1]![aerial] = 'A'
    grid[2]![aerial] = 'A'
    grid[3]![aerial] = 'A'
  }
  if (style === 'spore') {
    if (r() > 0.5) {
      grid[1]![5] = 'A'
      grid[1]![10] = 'A'
      grid[2]![3] = 'A'
      grid[2]![12] = 'A'
    }
  }
  if (style === 'alley') {
    // Distinct coat patterns stay above the muzzle and away from the eyes.
    const coat = Math.floor(r() * 3)
    for (let y = 3; y <= 8; y++)
      for (let x = 2; x < 14; x++) {
        if (grid[y]![x] !== 'A') continue
        if (
          (coat === 0 && x < 7) ||
          (coat === 1 && y < 6 && x % 3 === 0) ||
          (coat === 2 && x > 10 && y < 7)
        )
          grid[y]![x] = 'B'
      }
    if (r() > 0.6) {
      grid[1]![12] = '.'
      grid[2]![12] = 'A'
    }
  }
  if (style === 'lumen')
    grid.forEach((row) => {
      for (let x = 0; x < 8; x++) row[15 - x] = row[x]!
    })
  let body =
    '<rect x="2" y="2" width="96" height="96" rx="14" fill="#222033"/><g shape-rendering="crispEdges">'
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === '.') return
      if (cell === '?') {
        if (r() < 0.5) return
        cell = 'B'
      }
      if (cell === '*')
        cell = (style === 'lumen' ? (Math.min(x, 15 - x) + y + offset) % 3 !== 0 : r() > 0.35)
          ? 'H'
          : 'B'
      if (
        cell === 'A' &&
        style !== 'alley' &&
        patches.some(
          (p) =>
            Math.abs(
              (style === 'lumen' ? Math.min(p.x, 15 - p.x) : p.x) -
                (style === 'lumen' ? Math.min(x, 15 - x) : x),
            ) +
              Math.abs(p.y - y) <
            p.radius,
        )
      )
        cell = 'B'
      if (style === 'lumen') {
        const mirroredX = Math.min(x, 15 - x)
        if ((cell === 'B' || cell === 'H') && (mirroredX + y + offset) % 3 === 0) cell = 'H'
      }
      const height = cell === 'e' && eyeMode === 1 ? 3 : 5
      const width = cell === 'o' && eyeMode === 2 ? 3 : 5
      body += `<rect x="${10 + x * 5}" y="${10 + y * 5}" width="${width}" height="${height}" fill="${colors[cell] ?? colors.A}"/>`
    }),
  )
  return body + '</g>'
}
