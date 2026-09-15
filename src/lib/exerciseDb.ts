/**
 * Övningsdatabasen: 873 övningar ur free-exercise-db (public domain) med två bildrutor
 * per övning som animeras genom att växla. Datan ligger i src/data/exerciseDb.json
 * (GENERERAD av scripts/generate-exercise-db.py), bilderna hämtas från jsDelivr under
 * samma commit som datan. Egna övningar kopplas till en databaspost via namnkartan
 * nedan, samma mönster som MUSCLE_GROUP_MAP: aldrig ett fält i datamodellen.
 */

export interface DbExercise {
  id: string
  /** Svenskt namn ur scripts/exerciseDbSv.json */
  name: string
  /** Originalnamnet i källan, sökbart */
  nameEn: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string | null
  level: string
  category: string
  instructions: string[]
}

// Samma commit som scripts/generate-exercise-db.py, så bild och text alltid hör ihop
export const EXERCISE_DB_COMMIT = 'a859101d633a01c4a1a920d6a8ce41dabba0705f'

export function exerciseImageUrl(id: string, frame: 0 | 1): string {
  return `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${EXERCISE_DB_COMMIT}/exercises/${id}/${frame}.jpg`
}

let cache: Promise<DbExercise[]> | null = null
// Laddas först när en sida behöver den: 750 KB som ingen ska betala för på Hem
export function loadExerciseDb(): Promise<DbExercise[]> {
  if (!cache) cache = import('../data/exerciseDb.json').then(m => m.default as DbExercise[])
  return cache
}

export const MUSCLE_SV: Record<string, string> = {
  abdominals: 'Mage', abductors: 'Utsida höft', adductors: 'Insida lår', biceps: 'Biceps',
  calves: 'Vader', chest: 'Bröst', forearms: 'Underarmar', glutes: 'Säte', hamstrings: 'Baksida lår',
  lats: 'Lats', 'lower back': 'Ländrygg', 'middle back': 'Mellersta ryggen', neck: 'Nacke',
  quadriceps: 'Framsida lår', shoulders: 'Axlar', traps: 'Trapezius', triceps: 'Triceps'
}

export const EQUIPMENT_SV: Record<string, string> = {
  'body only': 'Kroppsvikt', barbell: 'Skivstång', dumbbell: 'Hantel', cable: 'Kabel', machine: 'Maskin',
  kettlebells: 'Kettlebell', 'e-z curl bar': 'EZ-stång', bands: 'Gummiband', 'medicine ball': 'Medicinboll',
  'exercise ball': 'Pilatesboll', 'foam roll': 'Foamroller', other: 'Övrigt'
}

export const LEVEL_SV: Record<string, string> = { beginner: 'Nybörjare', intermediate: 'Medel', expert: 'Avancerad' }

export const CATEGORY_SV: Record<string, string> = {
  strength: 'Styrka', stretching: 'Stretch', plyometrics: 'Plyometri', strongman: 'Strongman',
  powerlifting: 'Styrkelyft', cardio: 'Kondition', 'olympic weightlifting': 'Tyngdlyftning'
}

export function muscleLabel(m: string): string { return MUSCLE_SV[m] ?? m }
export function equipmentLabel(e: string | null): string { return e === null ? 'Ospecificerad' : (EQUIPMENT_SV[e] ?? e) }

export interface DbFilter { q: string; muscle: string; equipment: string }

// Alla ord i sökningen måste finnas i namnet (svenskt eller engelskt), ordningen kvittar.
// Muskel matchar primär eller sekundär.
export function searchExerciseDb(all: DbExercise[], f: DbFilter): DbExercise[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return all.filter(e => {
    const name = `${e.name} ${e.nameEn}`.toLowerCase()
    if (!words.every(w => name.includes(w))) return false
    if (f.muscle && !e.primaryMuscles.includes(f.muscle) && !e.secondaryMuscles.includes(f.muscle)) return false
    if (f.equipment && (e.equipment ?? 'other') !== f.equipment) return false
    return true
  })
}

// Egna övningsnamn (seeden och katalogen) → databaspost. Namn utan rad här får ingen bild,
// bara en sökning i databasen. Jämförs på gemener och trimmat, som resten av katalogen.
const EXERCISE_DB_MAP: Record<string, string> = {
  'Armhävningar': 'Pushups', 'Axlar baksida rep': 'Cable_Rope_Rear-Delt_Rows', 'Axlar sidolyft': 'Side_Lateral_Raise',
  'Axlar sidolyft bakåt': 'Reverse_Flyes', 'Benböj': 'Barbell_Squat', 'Benlyft mage': 'Flat_Bench_Lying_Leg_Raise',
  'Benspark': 'Leg_Extensions', 'Benspark baksida': 'Lying_Leg_Curls', 'Bicepscurl bänk': 'Preacher_Curl',
  'Bicepscurl ez stång': 'EZ-Bar_Curl', 'Bicepscurl hantel': 'Dumbbell_Bicep_Curl', 'Bänk': 'Barbell_Bench_Press_-_Medium_Grip',
  'Chins': 'Chin-Up', 'Hantelpress': 'Dumbbell_Shoulder_Press', 'Hantelrodd': 'One-Arm_Dumbbell_Row',
  'Hip-thrusts': 'Barbell_Hip_Thrust', 'Hopprep': 'Rope_Jumping', 'Hängande benlyft': 'Hanging_Leg_Raise',
  'Marklyft': 'Barbell_Deadlift', 'Militärpress': 'Standing_Military_Press', 'Situps': 'Sit-Up',
  'Skivstångsrodd': 'Bent_Over_Barbell_Row', 'Snedbänk': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Snedbänk hantlar': 'Incline_Dumbbell_Press', 'Triceps pushdown': 'Triceps_Pushdown', 'Triceps stång': 'EZ-Bar_Skullcrusher',
  'Vadpress skivstång': 'Standing_Barbell_Calf_Raise', 'Vadpress maskin': 'Standing_Calf_Raises', 'Ab roller': 'Ab_Roller',
  'Axelpress maskin': 'Machine_Shoulder_Military_Press', 'Latsdrag': 'Wide-Grip_Lat_Pulldown', 'Leg curl': 'Seated_Leg_Curl',
  'Leg extension': 'Leg_Extensions', 'Triceps dips stång': 'Dips_-_Triceps_Version', 'Triceps skull crush': 'EZ-Bar_Skullcrusher',
  'Underarm rulla vroom': 'Wrist_Roller', 'Underarm rulla inte-vroom': 'Wrist_Roller', 'Utfall bakåt': 'Dumbbell_Rear_Lunge',
  'Vadpress hantel': 'Standing_Dumbbell_Calf_Raise', 'Vadpress kettlebell': 'Standing_Dumbbell_Calf_Raise',
  // Startprogrammens övningar (src/data/starterPrograms.ts)
  'Kabelrodd': 'Seated_Cable_Rows', 'Face pull': 'Face_Pull', 'Hammercurl': 'Hammer_Curls',
  'Triceps över huvudet': 'Cable_Rope_Overhead_Triceps_Extension', 'Rumänsk marklyft': 'Romanian_Deadlift', 'Benpress': 'Leg_Press'
}
const MAP_LOWER = new Map(Object.entries(EXERCISE_DB_MAP).map(([k, v]) => [k.toLowerCase(), v]))

export function dbIdForName(name: string): string | null {
  return MAP_LOWER.get(name.trim().toLowerCase()) ?? null
}

export function ownNamesForDbId(dbId: string): string[] {
  return Object.entries(EXERCISE_DB_MAP).filter(([, v]) => v === dbId).map(([k]) => k)
}

// Exponerad för testet som kontrollerar att varje id i kartan finns i datan
export const EXERCISE_DB_MAP_IDS = Object.values(EXERCISE_DB_MAP)
