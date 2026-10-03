import { describe, expect, it } from 'vitest'
import { nextPrograms } from './nextPrograms'

const s = (templateName: string, date: string) => ({ templateName, date })

describe('nextPrograms', () => {
  it('det som väntat längst av de tre senaste programmen kommer först', () => {
    const result = nextPrograms([
      s('Ben', '2026-08-01'),
      s('Rygg', '2026-08-03'),
      s('Bröst', '2026-08-05'),
      s('Ben', '2026-08-07'),
      s('Rygg', '2026-08-09')
    ])
    expect(result).toEqual([
      { name: 'Bröst', date: '2026-08-05' },
      { name: 'Ben', date: '2026-08-07' },
      { name: 'Rygg', date: '2026-08-09' }
    ])
  })

  it('bara de tre senast körda programmen räknas, ett fjärde faller bort', () => {
    const result = nextPrograms([
      s('Kondition', '2026-07-01'),
      s('Ben', '2026-08-01'),
      s('Rygg', '2026-08-03'),
      s('Bröst', '2026-08-05')
    ])
    expect(result.map(p => p.name)).toEqual(['Ben', 'Rygg', 'Bröst'])
  })

  it('ordningen på indata spelar ingen roll', () => {
    const shuffled = [s('Rygg', '2026-08-09'), s('Ben', '2026-08-01'), s('Bröst', '2026-08-05'), s('Ben', '2026-08-07')]
    expect(nextPrograms(shuffled).map(p => p.name)).toEqual(['Bröst', 'Ben', 'Rygg'])
  })

  it('utan historik finns inget nästa pass', () => {
    expect(nextPrograms([])).toEqual([])
  })

  it('senaste datumet behålls om ett program förekommer flera gånger innan rotationen är full', () => {
    const result = nextPrograms([
      s('Bröst', '2026-08-02'),
      s('Rygg', '2026-08-03'),
      s('Ben', '2026-08-04'), // Äldre pass för Ben
      s('Ben', '2026-08-05')  // Senaste passet för Ben
    ])
    // Rotation ska innehålla Bröst, Rygg, Ben med deras senaste datum
    expect(result).toEqual([
      { name: 'Bröst', date: '2026-08-02' },
      { name: 'Rygg', date: '2026-08-03' },
      { name: 'Ben', date: '2026-08-05' }
    ])
  })
})
