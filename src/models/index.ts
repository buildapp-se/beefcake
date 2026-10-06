export type {
  ExerciseKind,
  Exercise,
  ExerciseProgression,
  SetEntry,
  SetType,
  ActiveSetEntry,
  ActiveExercise,
  ActiveWorkout,
  TemplateExercise,
  Template,
  SessionExercise,
  Session,
  ExerciseHistory,
  BodyWeight,
  BeefcakeDB,
  // Legacy typer för seedData.ts kompatibilitet
  LegacyTemplateExercise,
  LegacySessionExercise,
  LegacySession,
  LegacyExerciseHistory
} from '../db/schema'

export { 
  getDB, 
  generateId, 
  nowISO, 
  todayISO,
  // Migreringsfunktioner
  migrateTemplateExercise,
  migrateSessionExercise,
  migrateSession,
  migrateExerciseHistory
} from '../db/schema'