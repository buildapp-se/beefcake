/**
 * Startprogram: tre etablerade nybörjarupplägg, ett pass per Beefcake-program. Övningsnamnen
 * är katalogens svenska namn så att muskelgrupp, plattrad och övningsdatabasen hänger med.
 * Beefcake har ingen program-motor (se BACKLOG "Bygg inte"): progressionen står som text
 * och "+" i källan (AMRAP på sista setet) är bara nämnt i beskrivningen, sets och reps är
 * det fasta antalet. Vikt 0 betyder "sätt själv", loggvyn förifyller från förra passet.
 */

export interface StarterExercise { name: string; sets: number; reps: number }
export interface StarterTemplate { name: string; exercises: StarterExercise[] }
export interface StarterProgram {
  id: string
  name: string
  author: string
  description: string
  progression: string
  source: { label: string; url: string }
  templates: StarterTemplate[]
}

export const STARTER_PROGRAMS: StarterProgram[] = [
  {
    id: 'bbr',
    name: 'Nybörjare fullkropp (r/Fitness Basic Beginner Routine)',
    author: 'The Fitness Wiki, förenklad version av Phraks GSLP',
    description: 'Tre pass i veckan, växla A och B med en vilodag emellan. Tre set om fem på varje lyft, sista setet så många reps du orkar med god form. Max tre månader, sedan GZCLP eller 5/3/1.',
    progression: 'Lägg på 1,25 kg per pass på bänk, press, rodd och chins, 2,5 kg på böj och mark. Över tio reps på sista setet: lägg på 2,5 till 5 kg i stället. Under 15 reps totalt: sänk 10 % och jobba upp igen.',
    source: { label: 'thefitness.wiki', url: 'https://thefitness.wiki/routines/r-fitness-basic-beginner-routine/' },
    templates: [
      { name: 'Nybörjare A', exercises: [
        { name: 'Skivstångsrodd', sets: 3, reps: 5 }, { name: 'Bänk', sets: 3, reps: 5 }, { name: 'Benböj', sets: 3, reps: 5 }
      ] },
      { name: 'Nybörjare B', exercises: [
        { name: 'Chins', sets: 3, reps: 5 }, { name: 'Militärpress', sets: 3, reps: 5 }, { name: 'Marklyft', sets: 3, reps: 5 }
      ] }
    ]
  },
  {
    id: 'gzclp',
    name: 'GZCLP',
    author: 'Cody LeFever (u/gzcl)',
    description: 'Fyra pass som rullar med minst en vilodag emellan. Varje pass har ett tungt lyft (T1, 5×3, sista setet AMRAP), ett medeltungt (T2, 3×10) och ett lätt (T3, 3×15, sista setet AMRAP). Här ligger steg 1 av tre.',
    progression: 'T1 och T2: lägg på 2,5 kg (bänk, press) eller 5 kg (böj, mark) varje gång. Klarar du inte repsen går du till nästa steg: T1 5×3 → 6×2 → 10×1, T2 3×10 → 3×8 → 3×6. T3: byt vikt när sista setet når 25 reps.',
    source: { label: 'thefitness.wiki', url: 'https://thefitness.wiki/routines/gzclp/' },
    templates: [
      { name: 'GZCLP dag 1', exercises: [
        { name: 'Benböj', sets: 5, reps: 3 }, { name: 'Bänk', sets: 3, reps: 10 }, { name: 'Latsdrag', sets: 3, reps: 15 }
      ] },
      { name: 'GZCLP dag 2', exercises: [
        { name: 'Militärpress', sets: 5, reps: 3 }, { name: 'Marklyft', sets: 3, reps: 10 }, { name: 'Hantelrodd', sets: 3, reps: 15 }
      ] },
      { name: 'GZCLP dag 3', exercises: [
        { name: 'Bänk', sets: 5, reps: 3 }, { name: 'Benböj', sets: 3, reps: 10 }, { name: 'Latsdrag', sets: 3, reps: 15 }
      ] },
      { name: 'GZCLP dag 4', exercises: [
        { name: 'Marklyft', sets: 5, reps: 3 }, { name: 'Militärpress', sets: 3, reps: 10 }, { name: 'Hantelrodd', sets: 3, reps: 15 }
      ] }
    ]
  },
  {
    id: 'ppl',
    name: 'Push/Pull/Legs (Reddit PPL)',
    author: 'u/Metallicdpa',
    description: 'Sex pass i veckan i ordningen pull, push, ben, en vilodag. Huvudlyftet: 4×5 plus ett sista set AMRAP (här 5×5). På pull växlar du marklyft och skivstångsrodd varannan vecka. Sidolyften körs som superset med tricepsövningarna i källan.',
    progression: 'Huvudlyften: 2,5 kg per pass på bänk, press, rodd och böj, 5 kg på mark. Tillbehör: lägg på vikt när du klarar tre set om tolv. Tre missade pass i rad: sänk 10 % och jobba upp.',
    source: { label: 'thefitness.wiki (arkiv av originalinlägget)', url: 'https://thefitness.wiki/reddit-archive/a-linear-progression-based-ppl-program-for-beginners/' },
    templates: [
      { name: 'PPL pull', exercises: [
        { name: 'Marklyft', sets: 1, reps: 5 }, { name: 'Latsdrag', sets: 3, reps: 10 }, { name: 'Kabelrodd', sets: 3, reps: 10 },
        { name: 'Face pull', sets: 5, reps: 15 }, { name: 'Hammercurl', sets: 4, reps: 10 }, { name: 'Bicepscurl hantel', sets: 4, reps: 10 }
      ] },
      { name: 'PPL push', exercises: [
        { name: 'Bänk', sets: 5, reps: 5 }, { name: 'Militärpress', sets: 3, reps: 10 }, { name: 'Snedbänk hantlar', sets: 3, reps: 10 },
        { name: 'Triceps pushdown', sets: 3, reps: 10 }, { name: 'Triceps över huvudet', sets: 3, reps: 10 }, { name: 'Axlar sidolyft', sets: 6, reps: 15 }
      ] },
      { name: 'PPL ben', exercises: [
        { name: 'Benböj', sets: 3, reps: 5 }, { name: 'Rumänsk marklyft', sets: 3, reps: 10 }, { name: 'Benpress', sets: 3, reps: 10 },
        { name: 'Leg curl', sets: 3, reps: 10 }, { name: 'Vadpress maskin', sets: 5, reps: 10 }
      ] }
    ]
  }
]
