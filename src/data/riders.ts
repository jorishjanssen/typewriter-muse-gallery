// Mock data for the ProCycling prototype (men's elite only).
// Hardcoded on purpose — this phase validates the mobile UX before any real data source.

export interface SpecialtyScores {
  // 0–100 PCS-style points per specialty.
  oneDay: number;
  gc: number;
  timeTrial: number;
  sprint: number;
  climber: number;
  hills: number;
}

export interface PalmaresEntry {
  year: number;
  race: string;
  result: string;
  isWin?: boolean;
}

export interface SeasonResult {
  date: string; // ISO date
  race: string;
  result: string;
  pcsPoints?: number;
}

export interface SeasonSummary {
  year: number;
  team: string;
  wins: number;
  pcsPoints: number;
  results: SeasonResult[];
}

export interface Rider {
  id: string; // slug, e.g. "tadej-pogacar"
  name: string;
  nationality: string; // ISO 3166-1 alpha-2, e.g. "SI"
  nationalityName: string;
  dateOfBirth: string; // ISO date
  team: string;
  pcsRank: number;
  pcsPoints: number;
  wins: number;
  podiums: number;
  raceDays: number;
  specialties: SpecialtyScores;
  topPalmares: PalmaresEntry[];
  seasons: SeasonSummary[]; // newest first
}

export const SPECIALTY_LABELS: Record<keyof SpecialtyScores, string> = {
  oneDay: 'One-day races',
  gc: 'GC',
  timeTrial: 'Time trial',
  sprint: 'Sprint',
  climber: 'Climber',
  hills: 'Hills',
};

export const riders: Rider[] = [
  {
    id: 'tadej-pogacar',
    name: 'Tadej Pogačar',
    nationality: 'SI',
    nationalityName: 'Slovenia',
    dateOfBirth: '1998-09-21',
    team: 'UAE Team Emirates',
    pcsRank: 1,
    pcsPoints: 12480,
    wins: 89,
    podiums: 142,
    raceDays: 412,
    specialties: { oneDay: 96, gc: 99, timeTrial: 78, sprint: 52, climber: 98, hills: 94 },
    topPalmares: [
      { year: 2024, race: 'Tour de France', result: '1st', isWin: true },
      { year: 2024, race: 'Giro d\'Italia', result: '1st', isWin: true },
      { year: 2024, race: 'World Championships RR', result: '1st', isWin: true },
      { year: 2024, race: 'Il Lombardia', result: '1st', isWin: true },
      { year: 2024, race: 'Liège-Bastogne-Liège', result: '1st', isWin: true },
      { year: 2023, race: 'Tour of Flanders', result: '1st', isWin: true },
      { year: 2021, race: 'Tour de France', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'UAE Team Emirates',
        wins: 25,
        pcsPoints: 7200,
        results: [
          { date: '2024-09-29', race: 'World Championships RR', result: '1st', pcsPoints: 500 },
          { date: '2024-10-12', race: 'Il Lombardia', result: '1st', pcsPoints: 350 },
          { date: '2024-07-21', race: 'Tour de France', result: '1st', pcsPoints: 1300 },
          { date: '2024-05-26', race: 'Giro d\'Italia', result: '1st', pcsPoints: 1100 },
          { date: '2024-04-21', race: 'Liège-Bastogne-Liège', result: '1st', pcsPoints: 350 },
        ],
      },
      {
        year: 2023,
        team: 'UAE Team Emirates',
        wins: 17,
        pcsPoints: 5100,
        results: [
          { date: '2023-04-02', race: 'Tour of Flanders', result: '1st', pcsPoints: 350 },
          { date: '2023-07-23', race: 'Tour de France', result: '2nd', pcsPoints: 800 },
          { date: '2023-03-18', race: 'Paris-Nice', result: '1st', pcsPoints: 300 },
        ],
      },
    ],
  },
  {
    id: 'jonas-vingegaard',
    name: 'Jonas Vingegaard',
    nationality: 'DK',
    nationalityName: 'Denmark',
    dateOfBirth: '1996-12-10',
    team: 'Team Visma | Lease a Bike',
    pcsRank: 2,
    pcsPoints: 8950,
    wins: 32,
    podiums: 61,
    raceDays: 298,
    specialties: { oneDay: 71, gc: 97, timeTrial: 88, sprint: 28, climber: 96, hills: 79 },
    topPalmares: [
      { year: 2023, race: 'Tour de France', result: '1st', isWin: true },
      { year: 2022, race: 'Tour de France', result: '1st', isWin: true },
      { year: 2023, race: 'Critérium du Dauphiné', result: '1st', isWin: true },
      { year: 2024, race: 'Tour de France', result: '2nd' },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Team Visma | Lease a Bike',
        wins: 6,
        pcsPoints: 2400,
        results: [
          { date: '2024-07-21', race: 'Tour de France', result: '2nd', pcsPoints: 800 },
          { date: '2024-03-09', race: 'O Gran Camiño', result: '1st', pcsPoints: 220 },
        ],
      },
      {
        year: 2023,
        team: 'Jumbo-Visma',
        wins: 12,
        pcsPoints: 4600,
        results: [
          { date: '2023-07-23', race: 'Tour de France', result: '1st', pcsPoints: 1300 },
          { date: '2023-06-11', race: 'Critérium du Dauphiné', result: '1st', pcsPoints: 300 },
        ],
      },
    ],
  },
  {
    id: 'mathieu-van-der-poel',
    name: 'Mathieu van der Poel',
    nationality: 'NL',
    nationalityName: 'Netherlands',
    dateOfBirth: '1995-01-19',
    team: 'Alpecin-Deceuninck',
    pcsRank: 3,
    pcsPoints: 7640,
    wins: 56,
    podiums: 98,
    raceDays: 264,
    specialties: { oneDay: 99, gc: 41, timeTrial: 66, sprint: 84, climber: 48, hills: 92 },
    topPalmares: [
      { year: 2024, race: 'Paris-Roubaix', result: '1st', isWin: true },
      { year: 2024, race: 'Tour of Flanders', result: '1st', isWin: true },
      { year: 2023, race: 'World Championships RR', result: '1st', isWin: true },
      { year: 2023, race: 'Milan-San Remo', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Alpecin-Deceuninck',
        wins: 9,
        pcsPoints: 3100,
        results: [
          { date: '2024-04-07', race: 'Paris-Roubaix', result: '1st', pcsPoints: 350 },
          { date: '2024-03-31', race: 'Tour of Flanders', result: '1st', pcsPoints: 350 },
          { date: '2024-09-29', race: 'World Championships RR', result: '6th', pcsPoints: 120 },
        ],
      },
      {
        year: 2023,
        team: 'Alpecin-Deceuninck',
        wins: 8,
        pcsPoints: 2900,
        results: [
          { date: '2023-08-06', race: 'World Championships RR', result: '1st', pcsPoints: 500 },
          { date: '2023-03-18', race: 'Milan-San Remo', result: '1st', pcsPoints: 350 },
        ],
      },
    ],
  },
  {
    id: 'remco-evenepoel',
    name: 'Remco Evenepoel',
    nationality: 'BE',
    nationalityName: 'Belgium',
    dateOfBirth: '2000-01-25',
    team: 'Soudal Quick-Step',
    pcsRank: 4,
    pcsPoints: 7210,
    wins: 48,
    podiums: 79,
    raceDays: 241,
    specialties: { oneDay: 88, gc: 92, timeTrial: 97, sprint: 35, climber: 85, hills: 90 },
    topPalmares: [
      { year: 2024, race: 'Olympic Games TT', result: '1st', isWin: true },
      { year: 2024, race: 'Olympic Games RR', result: '1st', isWin: true },
      { year: 2022, race: 'La Vuelta ciclista a España', result: '1st', isWin: true },
      { year: 2022, race: 'World Championships RR', result: '1st', isWin: true },
      { year: 2023, race: 'Liège-Bastogne-Liège', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Soudal Quick-Step',
        wins: 7,
        pcsPoints: 2800,
        results: [
          { date: '2024-07-27', race: 'Olympic Games TT', result: '1st', pcsPoints: 250 },
          { date: '2024-08-03', race: 'Olympic Games RR', result: '1st', pcsPoints: 350 },
          { date: '2024-07-21', race: 'Tour de France', result: '3rd', pcsPoints: 500 },
        ],
      },
      {
        year: 2023,
        team: 'Soudal Quick-Step',
        wins: 13,
        pcsPoints: 3500,
        results: [
          { date: '2023-04-23', race: 'Liège-Bastogne-Liège', result: '1st', pcsPoints: 350 },
          { date: '2023-02-26', race: 'UAE Tour', result: '1st', pcsPoints: 300 },
        ],
      },
    ],
  },
  {
    id: 'primoz-roglic',
    name: 'Primož Roglič',
    nationality: 'SI',
    nationalityName: 'Slovenia',
    dateOfBirth: '1989-10-29',
    team: 'Red Bull-BORA-hansgrohe',
    pcsRank: 5,
    pcsPoints: 6480,
    wins: 78,
    podiums: 121,
    raceDays: 356,
    specialties: { oneDay: 74, gc: 95, timeTrial: 90, sprint: 38, climber: 88, hills: 82 },
    topPalmares: [
      { year: 2024, race: 'La Vuelta ciclista a España', result: '1st', isWin: true },
      { year: 2023, race: 'Giro d\'Italia', result: '1st', isWin: true },
      { year: 2020, race: 'La Vuelta ciclista a España', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Red Bull-BORA-hansgrohe',
        wins: 8,
        pcsPoints: 2600,
        results: [
          { date: '2024-09-08', race: 'La Vuelta ciclista a España', result: '1st', pcsPoints: 850 },
          { date: '2024-03-16', race: 'Volta a Catalunya', result: '1st', pcsPoints: 300 },
        ],
      },
      {
        year: 2023,
        team: 'Jumbo-Visma',
        wins: 6,
        pcsPoints: 2200,
        results: [
          { date: '2023-05-28', race: 'Giro d\'Italia', result: '1st', pcsPoints: 1100 },
        ],
      },
    ],
  },
  {
    id: 'jasper-philipsen',
    name: 'Jasper Philipsen',
    nationality: 'BE',
    nationalityName: 'Belgium',
    dateOfBirth: '1998-03-02',
    team: 'Alpecin-Deceuninck',
    pcsRank: 6,
    pcsPoints: 5120,
    wins: 54,
    podiums: 132,
    raceDays: 278,
    specialties: { oneDay: 72, gc: 18, timeTrial: 30, sprint: 99, climber: 12, hills: 44 },
    topPalmares: [
      { year: 2024, race: 'Milan-San Remo', result: '1st', isWin: true },
      { year: 2023, race: 'Tour de France — Points classification', result: '1st', isWin: true },
      { year: 2024, race: 'Tour de France — Stage 10', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Alpecin-Deceuninck',
        wins: 11,
        pcsPoints: 2350,
        results: [
          { date: '2024-03-16', race: 'Milan-San Remo', result: '1st', pcsPoints: 350 },
          { date: '2024-07-09', race: 'Tour de France — Stage 10', result: '1st', pcsPoints: 120 },
        ],
      },
      {
        year: 2023,
        team: 'Alpecin-Deceuninck',
        wins: 19,
        pcsPoints: 2900,
        results: [
          { date: '2023-07-23', race: 'Tour de France — Points classification', result: '1st', pcsPoints: 250 },
        ],
      },
    ],
  },
  {
    id: 'mads-pedersen',
    name: 'Mads Pedersen',
    nationality: 'DK',
    nationalityName: 'Denmark',
    dateOfBirth: '1995-12-18',
    team: 'Lidl-Trek',
    pcsRank: 7,
    pcsPoints: 4870,
    wins: 41,
    podiums: 96,
    raceDays: 312,
    specialties: { oneDay: 90, gc: 32, timeTrial: 58, sprint: 88, climber: 22, hills: 76 },
    topPalmares: [
      { year: 2019, race: 'World Championships RR', result: '1st', isWin: true },
      { year: 2022, race: 'Gent-Wevelgem', result: '1st', isWin: true },
      { year: 2023, race: 'Tour de France — Stage 8', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Lidl-Trek',
        wins: 8,
        pcsPoints: 1950,
        results: [
          { date: '2024-03-30', race: 'Gent-Wevelgem', result: '2nd', pcsPoints: 200 },
          { date: '2024-09-08', race: 'La Vuelta — Points classification', result: '1st', pcsPoints: 250 },
        ],
      },
      {
        year: 2023,
        team: 'Lidl-Trek',
        wins: 10,
        pcsPoints: 2300,
        results: [
          { date: '2023-07-08', race: 'Tour de France — Stage 8', result: '1st', pcsPoints: 120 },
        ],
      },
    ],
  },
  {
    id: 'wout-van-aert',
    name: 'Wout van Aert',
    nationality: 'BE',
    nationalityName: 'Belgium',
    dateOfBirth: '1994-09-15',
    team: 'Team Visma | Lease a Bike',
    pcsRank: 8,
    pcsPoints: 4530,
    wins: 47,
    podiums: 118,
    raceDays: 289,
    specialties: { oneDay: 93, gc: 44, timeTrial: 82, sprint: 80, climber: 40, hills: 86 },
    topPalmares: [
      { year: 2022, race: 'Tour de France — Points classification', result: '1st', isWin: true },
      { year: 2020, race: 'Milan-San Remo', result: '1st', isWin: true },
      { year: 2021, race: 'Gent-Wevelgem', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Team Visma | Lease a Bike',
        wins: 3,
        pcsPoints: 1450,
        results: [
          { date: '2024-03-23', race: 'E3 Saxo Classic', result: '3rd', pcsPoints: 150 },
        ],
      },
      {
        year: 2023,
        team: 'Jumbo-Visma',
        wins: 6,
        pcsPoints: 2100,
        results: [
          { date: '2023-03-24', race: 'E3 Saxo Classic', result: '1st', pcsPoints: 300 },
        ],
      },
    ],
  },
  {
    id: 'juan-ayuso',
    name: 'Juan Ayuso',
    nationality: 'ES',
    nationalityName: 'Spain',
    dateOfBirth: '2002-09-16',
    team: 'UAE Team Emirates',
    pcsRank: 9,
    pcsPoints: 3980,
    wins: 14,
    podiums: 38,
    raceDays: 187,
    specialties: { oneDay: 58, gc: 88, timeTrial: 80, sprint: 24, climber: 84, hills: 70 },
    topPalmares: [
      { year: 2024, race: 'Tirreno-Adriatico', result: '1st', isWin: true },
      { year: 2022, race: 'La Vuelta ciclista a España', result: '3rd' },
    ],
    seasons: [
      {
        year: 2024,
        team: 'UAE Team Emirates',
        wins: 5,
        pcsPoints: 1700,
        results: [
          { date: '2024-03-10', race: 'Tirreno-Adriatico', result: '1st', pcsPoints: 300 },
        ],
      },
      {
        year: 2023,
        team: 'UAE Team Emirates',
        wins: 4,
        pcsPoints: 1500,
        results: [
          { date: '2023-08-13', race: 'La Vuelta ciclista a España', result: '4th', pcsPoints: 400 },
        ],
      },
    ],
  },
  {
    id: 'biniam-girmay',
    name: 'Biniam Girmay',
    nationality: 'ER',
    nationalityName: 'Eritrea',
    dateOfBirth: '2000-04-02',
    team: 'Intermarché-Wanty',
    pcsRank: 10,
    pcsPoints: 3620,
    wins: 22,
    podiums: 54,
    raceDays: 213,
    specialties: { oneDay: 82, gc: 30, timeTrial: 40, sprint: 92, climber: 34, hills: 72 },
    topPalmares: [
      { year: 2024, race: 'Tour de France — Points classification', result: '1st', isWin: true },
      { year: 2022, race: 'Gent-Wevelgem', result: '1st', isWin: true },
    ],
    seasons: [
      {
        year: 2024,
        team: 'Intermarché-Wanty',
        wins: 7,
        pcsPoints: 1850,
        results: [
          { date: '2024-07-21', race: 'Tour de France — Points classification', result: '1st', pcsPoints: 250 },
          { date: '2024-07-01', race: 'Tour de France — Stage 3', result: '1st', pcsPoints: 120 },
        ],
      },
      {
        year: 2022,
        team: 'Intermarché-Wanty-Gobert',
        wins: 5,
        pcsPoints: 1400,
        results: [
          { date: '2022-03-27', race: 'Gent-Wevelgem', result: '1st', pcsPoints: 300 },
        ],
      },
    ],
  },
];

export const getRider = (id: string): Rider | undefined =>
  riders.find((rider) => rider.id === id);

export const searchRiders = (query: string): Rider[] => {
  const q = query.trim().toLowerCase();
  if (!q) return riders;
  return riders.filter(
    (rider) =>
      rider.name.toLowerCase().includes(q) ||
      rider.team.toLowerCase().includes(q) ||
      rider.nationalityName.toLowerCase().includes(q),
  );
};
