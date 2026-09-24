/* eslint-disable @typescript-eslint/no-explicit-any -- testerna bygger medvetet felaktig importdata */
import { describe, expect, it } from 'vitest'
import { parseImportData } from './importValidation'

function valid() {
  const set = { sets: 1, reps: 10, weight: 60 }
  return {
    templates: [{ id: 't1', name: 'Ben', updatedAt: '2026-09-01T10:00:00.000Z', exercises: [{ exerciseId: 'e1', defaultSetEntry: set, order: 0 }] }],
    exercises: [{ id: 'e1', name: 'Benböj', createdAt: '2026-09-01T10:00:00.000Z', kind: 'weight' as string, muscleGroup: 'Ben' }],
    sessions: [{ id: 's1', date: '2026-09-01', templateId: 't1', templateName: 'Ben', createdAt: '2026-09-01T10:00:00.000Z', exercises: [{ exerciseId: 'e1', exerciseName: 'Benböj', setEntries: [{ ...set }], order: 0 }] }],
    exerciseHistory: [{ id: 'h1', date: '2026-09-01', exerciseId: 'e1', exerciseName: 'Benböj', setEntries: [set], volume: 600, sessionId: 's1' }]
  }
}

describe('parseImportData', () => {
  it('accepterar en komplett tom backup', () => {
    expect(parseImportData(JSON.stringify({
      templates: [],
      exercises: [],
      sessions: [],
      exerciseHistory: []
    }))).toEqual({
      templates: [],
      exercises: [],
      sessions: [],
      exerciseHistory: [],
      bodyWeight: []
    })
  })

  it('accepterar kroppsvikt när den finns och släpper igenom en tom lista', () => {
    const rows = [{ date: '2026-09-01', kg: 82.5 }]
    expect(parseImportData(JSON.stringify({ ...valid(), bodyWeight: rows })).bodyWeight).toEqual(rows)
    expect(parseImportData(JSON.stringify({ ...valid(), bodyWeight: [] })).bodyWeight).toEqual([])
  })

  it('avvisar kroppsvikt utan giltigt datum, utan kilo eller med två värden samma dag', () => {
    expect(() => parseImportData(JSON.stringify({ ...valid(), bodyWeight: [{ date: 'igår', kg: 82.5 }] }))).toThrow('bodyWeight')
    expect(() => parseImportData(JSON.stringify({ ...valid(), bodyWeight: [{ date: '2026-09-01', kg: 0 }] }))).toThrow('bodyWeight')
    expect(() => parseImportData(JSON.stringify({ ...valid(), bodyWeight: [{ date: '2026-09-01', kg: 82 }, { date: '2026-09-01', kg: 83 }] }))).toThrow('dubbletter')
  })

  it('avvisar en backup som saknar en samling', () => {
    expect(() => parseImportData(JSON.stringify({
      templates: [],
      exercises: [],
      sessions: []
    }))).toThrow('exerciseHistory')
  })

  it('accepterar en komplett domänmodell', () => {
    expect(() => parseImportData(JSON.stringify(valid()))).not.toThrow()
  })

  it('avvisar ett set med negativ vikt', () => {
    const data = valid()
    data.sessions[0].exercises[0].setEntries[0].weight = -5
    expect(() => parseImportData(JSON.stringify(data))).toThrow('sessions')
  })

  it('avvisar en okänd övningstyp', () => {
    const data = valid()
    data.exercises[0].kind = 'cardio'
    expect(() => parseImportData(JSON.stringify(data))).toThrow('exercises')
  })

  it('avvisar historik som pekar på ett pass som saknas', () => {
    const data = valid()
    data.exerciseHistory[0].sessionId = 'borta'
    expect(() => parseImportData(JSON.stringify(data))).toThrow('pass som saknas')
  })

  it('avvisar dubbla ID:n innan någon data rensas', () => {
    expect(() => parseImportData(JSON.stringify({
      ...valid(),
      templates: [valid().templates[0], valid().templates[0]]
    }))).toThrow('dubbletter')
  })

  it('avvisar import som inte är ett objekt', () => {
    expect(() => parseImportData('null')).toThrow(/^Importen har fel format$/)
    expect(() => parseImportData('42')).toThrow(/^Importen har fel format$/)
    expect(() => parseImportData('"string"')).toThrow(/^Importen har fel format$/)
  })

  it('avvisar kroppsvikt som inte är en lista', () => {
    expect(() => parseImportData(JSON.stringify({ ...valid(), bodyWeight: {} }))).toThrow('Importen har fel format: bodyWeight')
  })

  it('avvisar saknad eller felaktig template-samling', () => {
    expect(() => parseImportData(JSON.stringify({ ...valid(), templates: null }))).toThrow('Importen har fel format: templates')
    expect(() => parseImportData(JSON.stringify({ ...valid(), templates: {} }))).toThrow('Importen har fel format: templates')
  })

  it('avvisar objekt utan id i samlingar', () => {
    const d1 = valid(); d1.templates.push(null as any);
    expect(() => parseImportData(JSON.stringify(d1))).toThrow('templates');

    const d2 = valid(); delete (d2.exercises[0] as any).id;
    expect(() => parseImportData(JSON.stringify(d2))).toThrow('exercises');

    const d3 = valid(); d3.sessions[0].id = '';
    expect(() => parseImportData(JSON.stringify(d3))).toThrow('sessions');
  })

  it('avvisar ogiltiga övningar', () => {
    const d1 = valid(); d1.exercises[0].name = '';
    expect(() => parseImportData(JSON.stringify(d1))).toThrow('exercises');

    const d2 = valid(); d2.exercises[0].createdAt = 123 as any;
    expect(() => parseImportData(JSON.stringify(d2))).toThrow('exercises');

    const d3 = valid(); d3.exercises[0].muscleGroup = 123 as any;
    expect(() => parseImportData(JSON.stringify(d3))).toThrow('exercises');
  })

  it('avvisar ogiltiga templates', () => {
    const d1 = valid(); d1.templates[0].name = '';
    expect(() => parseImportData(JSON.stringify(d1))).toThrow('templates');

    const d2 = valid(); d2.templates[0].updatedAt = 123 as any;
    expect(() => parseImportData(JSON.stringify(d2))).toThrow('templates');

    const d3 = valid(); d3.templates[0].exercises = {} as any;
    expect(() => parseImportData(JSON.stringify(d3))).toThrow('templates');

    const d4 = valid(); d4.templates[0].exercises[0] = null as any;
    expect(() => parseImportData(JSON.stringify(d4))).toThrow('templates');

    const d5 = valid(); d5.templates[0].exercises[0].exerciseId = '';
    expect(() => parseImportData(JSON.stringify(d5))).toThrow('templates');

    const d6 = valid(); d6.templates[0].exercises[0].defaultSetEntry = {} as any;
    expect(() => parseImportData(JSON.stringify(d6))).toThrow('templates');

    const d7 = valid(); d7.templates[0].exercises[0].order = '0' as any;
    expect(() => parseImportData(JSON.stringify(d7))).toThrow('templates');

    const d8 = valid(); 
    d8.templates[0].exercises.push({ exerciseId: 'e2', defaultSetEntry: { sets: 1, reps: 1, weight: 1 }, order: 1 });
    d8.templates[0].exercises[0].order = '0' as any;
    expect(() => parseImportData(JSON.stringify(d8))).toThrow('templates');
  })

  it('accepterar sessionsövningar med noteringar', () => {
    const data = valid();
    (data.sessions[0].exercises[0] as any).notes = 'Bra pass';
    expect(() => parseImportData(JSON.stringify(data))).not.toThrow();
  })

  it('avvisar sessionsövningar med ogiltiga fält', () => {
    const d1 = valid(); d1.sessions[0].exercises[0].exerciseName = 123 as any;
    expect(() => parseImportData(JSON.stringify(d1))).toThrow('sessions');

    const d2 = valid(); d2.sessions[0].exercises[0].order = '0' as any;
    expect(() => parseImportData(JSON.stringify(d2))).toThrow('sessions');

    const d3 = valid(); (d3.sessions[0].exercises[0] as any).notes = 123;
    expect(() => parseImportData(JSON.stringify(d3))).toThrow('sessions');

    const d4 = valid(); d4.sessions[0].exercises[0].exerciseId = '';
    expect(() => parseImportData(JSON.stringify(d4))).toThrow('sessions');

    const d5 = valid(); d5.sessions[0].exercises[0].setEntries = {} as any;
    expect(() => parseImportData(JSON.stringify(d5))).toThrow('sessions');
    
    const d6 = valid(); d6.sessions[0].exercises[0] = null as any;
    expect(() => parseImportData(JSON.stringify(d6))).toThrow('sessions');

    const d7 = valid(); 
    d7.sessions[0].exercises.push({ exerciseId: 'e2', exerciseName: 'Mark', setEntries: [], order: 1 });
    d7.sessions[0].exercises[0].order = '0' as any;
    expect(() => parseImportData(JSON.stringify(d7))).toThrow('sessions');
  })
})
