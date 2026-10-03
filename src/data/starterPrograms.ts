/**
 * Startprogram: tre etablerade nybörjarupplägg, ett pass per Beefcake-program. Övningsnamnen
 * är katalogens svenska namn så att muskelgrupp, plattrad och övningsdatabasen hänger med.
 * Beefcake har ingen program-motor (se BACKLOG "Bygg inte"): progressionen står som text
 * och "+" i källan (AMRAP på sista setet) är bara nämnt i beskrivningen, sets och reps är
 * det fasta antalet. Vikt 0 betyder "sätt själv", loggvyn förifyller från förra passet.
 * Anger källan ett intervall (3-4 × 6-10) står undre gränsen här och progressionstexten säger
 * dubbel progression: upp till övre gränsen, sedan mer vikt (regel 2026-10-03; Reddit PPL är äldre
 * och tog mitten). Källorna och de avvisade programmen: vaultens "Beefcake Startprogram".
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
  },
  {
    id: 'sl-lite',
    name: 'StrongLifts 5×5 Lite (två pass i veckan)',
    author: 'Mehdi Hadim, stronglifts.com',
    description: 'Två eller tre pass i veckan med minst en vilodag emellan, växla A och B. Två set om fem på tre basövningar: för veckor med ont om tid eller dålig återhämtning. Byt upplägg efter 8 till 12 veckor.',
    progression: 'Klarar du alla set: lägg på 2,5 kg nästa gång (1,25 till 2,5 kg på bänk, press och rodd, marklyft tål 5 kg en tid). Missar du samma vikt tre gånger: sänk cirka 10 % och jobba upp igen.',
    source: { label: 'stronglifts.com', url: 'https://stronglifts.com/stronglifts-5x5/lite/' },
    templates: [
      { name: 'StrongLifts Lite A', exercises: [
        { name: 'Benböj', sets: 2, reps: 5 }, { name: 'Bänk', sets: 2, reps: 5 }, { name: 'Skivstångsrodd', sets: 2, reps: 5 }
      ] },
      { name: 'StrongLifts Lite B', exercises: [
        { name: 'Benböj', sets: 2, reps: 5 }, { name: 'Militärpress', sets: 2, reps: 5 }, { name: 'Marklyft', sets: 2, reps: 5 }
      ] }
    ]
  },
  {
    id: 'stopgap',
    name: 'Dumbbell Stopgap (bara hantlar)',
    author: 'u/Cammorak',
    description: 'Helkropp med bara hantlar, tre pass i veckan, växla A och B. Tre set med så många reps du klarar upp till tio, en minuts vila. Plankan är på tid: sekunder i repsfältet. Tänkt som nödlösning tills du har tillgång till stång.',
    progression: 'Klarar du 3×10: ta nästa hantelvikt nästa pass. Står du still på samma vikt och reps i tre pass: gå ner två steg och bygg upp igen.',
    source: { label: 'thefitness.wiki (arkiv av originalinlägget)', url: 'https://thefitness.wiki/reddit-archive/dumbbell-stopgap/' },
    templates: [
      { name: 'Stopgap A', exercises: [
        { name: 'Bulgarisk utfallsböj', sets: 3, reps: 10 }, { name: 'Golvpress hantlar', sets: 3, reps: 10 },
        { name: 'Stelbent marklyft hantlar', sets: 3, reps: 10 }, { name: 'Plankan', sets: 3, reps: 30 }
      ] },
      { name: 'Stopgap B', exercises: [
        { name: 'Bulgarisk utfallsböj', sets: 3, reps: 10 }, { name: 'Hantelpress', sets: 3, reps: 10 },
        { name: 'Hantelrodd båda armar', sets: 3, reps: 10 }, { name: 'Plankan', sets: 3, reps: 30 }
      ] }
    ]
  },
  {
    id: 'phul',
    name: 'PHUL (överkropp och underkropp)',
    author: 'Brandon Campbell, muscleandstrength.com',
    description: 'Fyra pass i veckan, till exempel måndag, tisdag, torsdag och fredag: två tunga styrkepass och två volympass, uppdelat på överkropp och underkropp. Källan anger intervall, här står den undre gränsen. Lämna ett rep i tanken.',
    progression: 'Dubbel progression (Beefcakes formulering, källan har ingen fast regel): jobba upp till övre repgränsen i alla set (styrka 5, volym 12), lägg sedan på 2,5 kg och börja om från undre gränsen.',
    source: { label: 'muscleandstrength.com', url: 'https://www.muscleandstrength.com/workouts/phul-workout' },
    templates: [
      { name: 'PHUL överkropp styrka', exercises: [
        { name: 'Bänk', sets: 3, reps: 3 }, { name: 'Snedbänk hantlar', sets: 3, reps: 6 }, { name: 'Skivstångsrodd', sets: 3, reps: 3 },
        { name: 'Latsdrag', sets: 3, reps: 6 }, { name: 'Militärpress', sets: 2, reps: 5 }, { name: 'Bicepscurl skivstång', sets: 2, reps: 6 },
        { name: 'Triceps stång', sets: 2, reps: 6 }
      ] },
      { name: 'PHUL underkropp styrka', exercises: [
        { name: 'Benböj', sets: 3, reps: 3 }, { name: 'Marklyft', sets: 3, reps: 3 }, { name: 'Benpress', sets: 3, reps: 10 },
        { name: 'Leg curl', sets: 3, reps: 6 }, { name: 'Vadpress maskin', sets: 4, reps: 6 }
      ] },
      { name: 'PHUL överkropp volym', exercises: [
        { name: 'Snedbänk', sets: 3, reps: 8 }, { name: 'Flyes hantel', sets: 3, reps: 8 }, { name: 'Kabelrodd', sets: 3, reps: 8 },
        { name: 'Hantelrodd', sets: 3, reps: 8 }, { name: 'Axlar sidolyft', sets: 3, reps: 8 }, { name: 'Bicepscurl lutande bänk', sets: 3, reps: 8 },
        { name: 'Triceps pushdown', sets: 3, reps: 8 }
      ] },
      { name: 'PHUL underkropp volym', exercises: [
        { name: 'Frontböj', sets: 3, reps: 8 }, { name: 'Utfall skivstång', sets: 3, reps: 8 }, { name: 'Leg extension', sets: 3, reps: 10 },
        { name: 'Leg curl', sets: 3, reps: 10 }, { name: 'Vadpress sittande', sets: 3, reps: 8 }, { name: 'Vadpress maskin', sets: 3, reps: 8 }
      ] }
    ]
  },
  {
    id: 'gbr',
    name: 'Generic Bulking Routine (Lyle McDonald)',
    author: 'Lyle McDonald',
    description: 'Fyra pass i veckan, överkropp och underkropp två gånger var (torsdag och fredag upprepar måndag och tisdag). Tunga basövningar först med tre minuters vila, sedan lättare med två. Stanna ett eller två reps före failure. Källan anger intervall, här står den undre gränsen.',
    progression: 'En cykel är åtta veckor: två veckor där du trappar upp under maxvikterna, sedan sex veckor med mer vikt så ofta det går. Nå övre repgränsen i första setet, lägg sedan på vikt.',
    source: { label: 'bodyrecomposition.com', url: 'https://bodyrecomposition.com/muscle-gain/popular-hypertrophy-programs' },
    templates: [
      { name: 'GBR underkropp', exercises: [
        { name: 'Benböj', sets: 3, reps: 6 }, { name: 'Rumänsk marklyft', sets: 3, reps: 6 }, { name: 'Benpress', sets: 2, reps: 10 },
        { name: 'Leg curl', sets: 2, reps: 10 }, { name: 'Vadpress maskin', sets: 3, reps: 6 }, { name: 'Vadpress sittande', sets: 2, reps: 10 }
      ] },
      { name: 'GBR överkropp', exercises: [
        { name: 'Bänk', sets: 3, reps: 6 }, { name: 'Skivstångsrodd', sets: 3, reps: 6 }, { name: 'Snedbänk', sets: 2, reps: 10 },
        { name: 'Latsdrag', sets: 2, reps: 10 }, { name: 'Triceps pushdown', sets: 1, reps: 12 }, { name: 'Bicepscurl hantel', sets: 1, reps: 12 }
      ] }
    ]
  },
  {
    id: 'sl-ultra',
    name: 'StrongLifts 5×5 Ultra (fyra pass)',
    author: 'Mehdi Hadim, stronglifts.com',
    description: 'Fyra korta pass i veckan, till exempel måndag, tisdag, torsdag och fredag: två underkroppspass och två överkroppspass. Ett naturligt steg efter ett helkroppsprogram. Källans tillbehörsövningar är valfria och utelämnade här.',
    progression: 'Klarar du alla set med god form: lägg på högst 2,5 kg nästa gång. Missar du samma vikt tre gånger: sänk cirka 10 % och jobba upp igen.',
    source: { label: 'stronglifts.com', url: 'https://stronglifts.com/stronglifts-5x5/ultra/' },
    templates: [
      { name: 'StrongLifts Ultra A', exercises: [{ name: 'Benböj', sets: 5, reps: 5 }, { name: 'Marklyft', sets: 1, reps: 5 }] },
      { name: 'StrongLifts Ultra B', exercises: [{ name: 'Bänk', sets: 5, reps: 5 }, { name: 'Skivstångsrodd', sets: 5, reps: 5 }] },
      { name: 'StrongLifts Ultra C', exercises: [{ name: 'Marklyft', sets: 5, reps: 5 }, { name: 'Benböj', sets: 1, reps: 5 }] },
      { name: 'StrongLifts Ultra D', exercises: [{ name: 'Militärpress', sets: 5, reps: 5 }, { name: 'Bänk', sets: 5, reps: 5 }] }
    ]
  },
  {
    id: 'arnold',
    name: 'Arnolds split (3-split, två varv i veckan)',
    author: 'Arnold Schwarzenegger, ur The New Encyclopedia of Modern Bodybuilding, återgiven av Steve Shaw',
    description: 'Avancerat: sex pass i veckan, varje pass två gånger, en vilodag. Tre till fyra set om tio, magen fem set om tjugofem. Långa pass med många övningar: ta bort det du inte har utrustning till.',
    progression: 'Källan har ingen fast regel. Förslag: nå failure runt tionde repet i första setet, och lägg på vikt när du klarar tio reps i alla set.',
    source: { label: 'muscleandstrength.com', url: 'https://www.muscleandstrength.com/workouts/arnold-schwarzenegger-volume-workout-routines' },
    templates: [
      { name: 'Arnold bröst och rygg', exercises: [
        { name: 'Bänk', sets: 3, reps: 10 }, { name: 'Snedbänk', sets: 3, reps: 10 }, { name: 'Pullover hantel', sets: 3, reps: 10 },
        { name: 'Chins', sets: 3, reps: 10 }, { name: 'Skivstångsrodd', sets: 3, reps: 10 }, { name: 'Marklyft', sets: 3, reps: 10 },
        { name: 'Crunch', sets: 5, reps: 25 }
      ] },
      { name: 'Arnold axlar och armar', exercises: [
        { name: 'Frivändning med press', sets: 3, reps: 10 }, { name: 'Axlar sidolyft', sets: 3, reps: 10 }, { name: 'Upprätt rodd', sets: 3, reps: 10 },
        { name: 'Militärpress', sets: 3, reps: 10 }, { name: 'Bicepscurl skivstång', sets: 3, reps: 10 }, { name: 'Bicepscurl hantel', sets: 3, reps: 10 },
        { name: 'Bänk smalt grepp', sets: 3, reps: 10 }, { name: 'Fransk press stående', sets: 3, reps: 10 }, { name: 'Handledscurl', sets: 3, reps: 10 },
        { name: 'Omvänd handledscurl', sets: 3, reps: 10 }, { name: 'Omvänd crunch', sets: 5, reps: 25 }
      ] },
      { name: 'Arnold ben och ländrygg', exercises: [
        { name: 'Benböj', sets: 3, reps: 10 }, { name: 'Utfall skivstång', sets: 3, reps: 10 }, { name: 'Leg curl', sets: 3, reps: 10 },
        { name: 'Stelbent marklyft', sets: 3, reps: 10 }, { name: 'Good morning', sets: 3, reps: 10 }, { name: 'Vadpress skivstång', sets: 3, reps: 10 },
        { name: 'Crunch', sets: 5, reps: 25 }
      ] }
    ]
  }
]
