import type { MediaCulturalObligation, MediaKind, MediaTitleView } from '@/types/media';

export const CINEPHILE_CANON_VERSION = 'external-canon-2026.1';
export const CINEPHILE_CANON_AS_OF = '2026-09-15';

export type CinephileCanonSource = 'tspdt-2026' | 'wga-2013' | 'bbc-2021';

export interface CinephileCanonEntry {
  id: string;
  medium: MediaKind;
  title: string;
  year?: number;
  aliases: readonly string[];
  sourceRanks: Partial<Record<CinephileCanonSource, number>>;
  obligation: MediaCulturalObligation;
  weight: number;
}

export const MEDIA_OBLIGATION_OPTIONS: readonly {
  value: MediaCulturalObligation;
  label: string;
}[] = [
  { value: 'imprescindible', label: 'Imprescindible' },
  { value: 'esencial', label: 'Esencial' },
  { value: 'muy-recomendable', label: 'Muy recomendable' },
  { value: 'recomendable', label: 'Recomendable' },
  { value: 'complementaria', label: 'Complementaria' },
  { value: 'opcional', label: 'Opcional' },
];

const OBLIGATION_WEIGHT: Record<MediaCulturalObligation, number> = {
  imprescindible: 5,
  esencial: 3,
  'muy-recomendable': 2,
  recomendable: 1,
  complementaria: 0.45,
  opcional: 0.15,
};

const MOVIE_TITLES = `
Citizen Kane
Vertigo
2001: A Space Odyssey
Tokyo Story
The Rules of the Game
The Godfather
8½
Sunrise: A Song of Two Humans
The Searchers
Seven Samurai
Singin' in the Rain
Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles
Apocalypse Now
Taxi Driver
Bicycle Thieves
Persona
In the Mood for Love
Breathless
The Passion of Joan of Arc
Battleship Potemkin
L'Atalante
Man with a Movie Camera
Mirror
Psycho
Rashomon
City Lights
The 400 Blows
Andrei Rublev
Mulholland Dr.
The Godfather Part II
Some Like It Hot
Au Hasard Balthazar
La Dolce Vita
Ordet
Raging Bull
The Night of the Hunter
Casablanca
L'Avventura
Blade Runner
Rear Window
Sunset Blvd.
Touch of Evil
Barry Lyndon
Contempt
Playtime
Pather Panchali
Close-Up
Lawrence of Arabia
Stalker
The General
Modern Times
Beau Travail
M
The Third Man
Late Spring
The Apartment
North by Northwest
Ugetsu Monogatari
GoodFellas
The Battle of Algiers
La Grande Illusion
Wild Strawberries
Rio Bravo
Fanny and Alexander
Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb
Shoah
Once Upon a Time in the West
Chinatown
Journey to Italy
Pierrot le Fou
Do the Right Thing
Metropolis
A Woman Under the Influence
Les Enfants du Paradis
La Strada
The Leopard
Amarcord
It's a Wonderful Life
The Wild Bunch
Pulp Fiction
Viridiana
Jaws
The Shining
A Man Escaped
Blue Velvet
Sansho the Bailiff
The Conformist
The Seventh Seal
The Man Who Shot Liberty Valance
Nashville
The Magnificent Ambersons
Pickpocket
The Gold Rush
La Jetée
Gertrud
Sans Soleil
Cléo from 5 to 7
Jules et Jim
To Be or Not to Be
Meshes of the Afternoon
The Mother and the Whore
Sátántangó
Madame de...
Sherlock Jr.
A Clockwork Orange
Ikiru
Ali: Fear Eats the Soul
Aguirre, the Wrath of God
Come and See
Annie Hall
The Spirit of the Beehive
Last Year at Marienbad
Once Upon a Time in America
Greed
The Wizard of Oz
The Piano
A Brighter Summer Day
Yi Yi
Don't Look Now
Hiroshima Mon Amour
The Red Shoes
Alien
E.T. the Extra-Terrestrial
Bringing Up Baby
Blow-Up
A Day in the Country
Notorious
Vivre Sa Vie
Intolerance
L'Eclisse
Spirited Away
A Matter of Life and Death
Letter from an Unknown Woman
All About Eve
Los Olvidados
The Exterminating Angel
Star Wars
Imitation of Life
His Girl Friday
Histoire(s) du cinéma
Gone with the Wind
Nosferatu
There Will Be Blood
My Darling Clementine
Rome, Open City
Daisies
Wanda
Céline and Julie Go Boating
The Gospel According to St. Matthew
One Flew Over the Cuckoo's Nest
The Umbrellas of Cherbourg
The Conversation
Killer of Sheep
Un Chien Andalou
Days of Heaven
The Good, the Bad and the Ugly
Double Indemnity
Trouble in Paradise
The Deer Hunter
L'Argent
Chungking Express
My Neighbour Totoro
Cries and Whispers
Tropical Malady
Manhattan
Rosemary's Baby
The Passenger
Badlands
L'Âge d'Or
The Texas Chain Saw Massacre
Dekalog
The Discreet Charm of the Bourgeoisie
Portrait of a Lady on Fire
Raiders of the Lost Ark
Only Angels Have Wings
Stagecoach
Brief Encounter
Touki Bouki
Duck Soup
Close Encounters of the Third Kind
The Birds
Johnny Guitar
Ran
Mouchette
The Colour of Pomegranates
Earth
Vampyr
Napoléon
Out of the Past
Paris, Texas
The River
The Tree of Life
Chimes at Midnight
Black Narcissus
The Gleaners & I
La Notte
Paisan
King Kong
Nights of Cabiria
Rocco and His Brothers
Spring in a Small Town
Salò, or the 120 Days of Sodom
The Lady Eve
On the Waterfront
The Last Laugh
A City of Sadness
News from Home
The Thing
Vagabond
The Great Dictator
Magnolia
Death in Venice
Wings of Desire
The Life and Death of Colonel Blimp
Moonlight
Breaking the Waves
Solaris
The Quiet Man
Wavelength
Brazil
Le Samouraï
Kes
Zero for Conduct
Umberto D.
Where Is the Friend's House?
The Grapes of Wrath
The Big Lebowski
Eternal Sunshine of the Spotless Mind
The Best Years of Our Lives
The Life of Oharu
Parasite
Sullivan's Travels
Back to the Future
The Matrix
McCabe & Mrs. Miller
The Travelling Players
Black God, White Devil
Love Streams
The House Is Black
Germany, Year Zero
The Crowd
Ashes and Diamonds
Red Desert
Memories of Underdevelopment
Eraserhead
Ivan the Terrible, Part II
In a Lonely Place
The Band Wagon
The Graduate
Ivan the Terrible, Part I
`
  .trim()
  .split('\n');

const MOVIE_ALIASES: Record<string, readonly string[]> = {
  'Tokyo Story': ['Tokyo Monogatari', 'Cuentos de Tokio'],
  'The Rules of the Game': ['La règle du jeu', 'La regla del juego'],
  'Seven Samurai': ['Shichinin no samurai', 'Los siete samuráis', 'Los siete samurais'],
  'Bicycle Thieves': ['Ladri di biciclette', 'Ladrón de bicicletas', 'Ladrones de bicicletas'],
  Breathless: ['À bout de souffle', 'Al final de la escapada'],
  'The Passion of Joan of Arc': ["La Passion de Jeanne d'Arc", 'La pasión de Juana de Arco'],
  'Battleship Potemkin': ['Bronenosets Potyomkin', 'El acorazado Potemkin'],
  Mirror: ['Zerkalo', 'El espejo'],
  'The 400 Blows': ['Les quatre cents coups', 'Los 400 golpes', 'Los cuatrocientos golpes'],
  'Mulholland Dr.': ['Mulholland Drive'],
  'La Dolce Vita': ['La dolce vita'],
  'The Battle of Algiers': ['La battaglia di Algeri', 'La batalla de Argel'],
  'Wild Strawberries': ['Smultronstället', 'Fresas salvajes'],
  'The Seventh Seal': ['Det sjunde inseglet', 'El séptimo sello', 'El septimo sello'],
  'A Man Escaped': ["Un condamné à mort s'est échappé", 'Un condenado a muerte se ha escapado'],
  'Sansho the Bailiff': ['Sanshô dayû', 'El intendente Sansho'],
  'La Jetée': ['La jetée'],
  'Cléo from 5 to 7': ['Cléo de 5 à 7', 'Cleo de 5 a 7'],
  Ikiru: ['Vivir'],
  'Ali: Fear Eats the Soul': ['Angst essen Seele auf', 'Todos nos llamamos Alí'],
  'Aguirre, the Wrath of God': ['Aguirre, der Zorn Gottes', 'Aguirre, la cólera de Dios'],
  'The Spirit of the Beehive': ['El espíritu de la colmena', 'El espiritu de la colmena'],
  'A Brighter Summer Day': ['Guling jie shaonian sha ren shijian'],
  'Hiroshima Mon Amour': ['Hiroshima mon amour'],
  'Spirited Away': ['Sen to Chihiro no kamikakushi', 'El viaje de Chihiro'],
  'Los Olvidados': ['Los olvidados'],
  'Rome, Open City': ['Roma città aperta', 'Roma, ciudad abierta'],
  'The Good, the Bad and the Ugly': [
    'Il buono, il brutto, il cattivo',
    'El bueno, el malo y el feo',
  ],
  'Chungking Express': ['Chung Hing sam lam'],
  'My Neighbour Totoro': ['Tonari no Totoro', 'Mi vecino Totoro'],
  Ran: ['Ran'],
  'The Colour of Pomegranates': ['Sayat Nova', 'El color de la granada'],
  'Paris, Texas': ['Paris Texas'],
  'The Gleaners & I': ['Les glaneurs et la glaneuse', 'Los espigadores y la espigadora'],
  Parasite: ['Gisaengchung', 'Parásitos', 'Parasitos'],
  'The Travelling Players': ['O thiasos', 'El viaje de los comediantes'],
  'The House Is Black': ['Khaneh siah ast'],
  'Memories of Underdevelopment': ['Memorias del subdesarrollo'],
  'Ivan the Terrible, Part I': ['Ivan Groznyy', 'Iván el Terrible, Parte I'],
  'Ivan the Terrible, Part II': ['Ivan Groznyy II', 'Iván el Terrible, Parte II'],
};

const WGA_TOP_20 = [
  'The Sopranos',
  'Seinfeld',
  'The Twilight Zone',
  'All in the Family',
  'M*A*S*H',
  'The Mary Tyler Moore Show',
  'Mad Men',
  'Cheers',
  'The Wire',
  'The West Wing',
  'The Simpsons',
  'I Love Lucy',
  'Breaking Bad',
  'The Dick Van Dyke Show',
  'Hill Street Blues',
  'Arrested Development',
  'The Daily Show with Jon Stewart',
  'Six Feet Under',
  'Taxi',
  'The Larry Sanders Show',
] as const;

const WGA_21_50 = [
  '30 Rock',
  'Friday Night Lights',
  'Frasier',
  'Friends',
  'Saturday Night Live',
  'The X-Files',
  'Lost',
  'ER',
  'The Cosby Show',
  'Curb Your Enthusiasm',
  'The Honeymooners',
  'Deadwood',
  'Star Trek',
  'Modern Family',
  'Twin Peaks',
  'NYPD Blue',
  'The Carol Burnett Show',
  'Battlestar Galactica',
  'Sex and the City',
  'Game of Thrones',
  'The Bob Newhart Show',
  'Your Show of Shows',
  'Downton Abbey',
  'Thirtysomething',
  'Law & Order',
  'Homicide: Life on the Street',
  'St. Elsewhere',
  'Homeland',
  'Buffy the Vampire Slayer',
  'The Office (UK)',
  'The Good Wife',
] as const;

const WGA_51_78 = [
  'The Colbert Report',
  'Northern Exposure',
  'The Wonder Years',
  'L.A. Law',
  'Sesame Street',
  'Columbo',
  'Fawlty Towers',
  'The Rockford Files',
  'Moonlighting',
  'Freaks and Geeks',
  'Roots',
  'South Park',
  'Everybody Loves Raymond',
  'Playhouse 90',
  'Dexter',
  'The Office (U.S.)',
  'My So-Called Life',
  'The Golden Girls',
  'The Andy Griffith Show',
  '24',
  'The Shield',
  'Roseanne',
  'Murphy Brown',
  'House',
  'I, Claudius',
  'Barney Miller',
  'The Odd Couple',
] as const;

const BBC_21ST_TOP_25 = [
  'The Wire',
  'Mad Men',
  'Breaking Bad',
  'Fleabag',
  'Game of Thrones',
  'I May Destroy You',
  'The Leftovers',
  'The Americans',
  'The Office (UK)',
  'Succession',
  'BoJack Horseman',
  'Six Feet Under',
  'Twin Peaks: The Return',
  'Atlanta',
  'Chernobyl',
  'The Crown',
  '30 Rock',
  'Deadwood',
  'Lost',
  'The Thick of It',
  'Curb Your Enthusiasm',
  'Black Mirror',
  'Better Call Saul',
  'Veep',
  'Sherlock',
] as const;

const TV_YEAR_HINTS: Record<string, number> = {
  'The Twilight Zone': 1959,
  'Star Trek': 1966,
  'Battlestar Galactica': 2004,
  'The Office (UK)': 2001,
  'The Office (U.S.)': 2005,
  'Twin Peaks: The Return': 2017,
  House: 2004,
  '24': 2001,
};

const TV_ALIASES: Record<string, readonly string[]> = {
  'M*A*S*H': ['MASH'],
  'The Daily Show with Jon Stewart': ['The Daily Show'],
  'Battlestar Galactica': ['Battlestar Galactica (2004)'],
  'The Office (UK)': ['The Office UK'],
  'The Office (U.S.)': ['The Office US', 'The Office (US)'],
  'Twin Peaks: The Return': ['Twin Peaks The Return'],
  'BoJack Horseman': ['Bojack Horseman'],
  'I, Claudius': ['I Claudius'],
};

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLocaleLowerCase('en-US')
    .trim()
    .replace(/\s+/g, ' ');
}

function obligationFromMovieRank(rank: number): MediaCulturalObligation {
  if (rank <= 25) return 'imprescindible';
  if (rank <= 75) return 'esencial';
  if (rank <= 150) return 'muy-recomendable';
  return 'recomendable';
}

const MOVIE_CANON: CinephileCanonEntry[] = MOVIE_TITLES.map((title, index) => {
  const rank = index + 1;
  const obligation = obligationFromMovieRank(rank);
  return {
    id: `movie:tspdt:${rank}`,
    medium: 'movie',
    title,
    aliases: MOVIE_ALIASES[title] ?? [],
    sourceRanks: { 'tspdt-2026': rank },
    obligation,
    weight: OBLIGATION_WEIGHT[obligation],
  };
});

interface TvEvidence {
  title: string;
  wgaRank?: number;
  bbcRank?: number;
}

function buildTvEvidence(): TvEvidence[] {
  const byTitle = new Map<string, TvEvidence>();
  const add = (title: string, source: 'wga' | 'bbc', rank: number) => {
    const key = normalizeTitle(title);
    const current = byTitle.get(key) ?? { title };
    if (source === 'wga') current.wgaRank = rank;
    else current.bbcRank = rank;
    byTitle.set(key, current);
  };

  WGA_TOP_20.forEach((title, index) => add(title, 'wga', index + 1));
  WGA_21_50.forEach((title, index) => add(title, 'wga', 21 + index));
  WGA_51_78.forEach((title, index) => add(title, 'wga', 51 + index));
  BBC_21ST_TOP_25.forEach((title, index) => add(title, 'bbc', index + 1));
  return [...byTitle.values()];
}

function obligationFromTvEvidence(evidence: TvEvidence): MediaCulturalObligation {
  const { wgaRank, bbcRank } = evidence;
  if ((wgaRank ?? Infinity) <= 10 || (bbcRank ?? Infinity) <= 10) return 'imprescindible';
  if (
    ((wgaRank ?? Infinity) <= 25 && (bbcRank ?? Infinity) <= 25) ||
    (wgaRank ?? Infinity) <= 20 ||
    (bbcRank ?? Infinity) <= 15
  ) {
    return 'esencial';
  }
  if ((wgaRank ?? Infinity) <= 50 || (bbcRank ?? Infinity) <= 25) return 'muy-recomendable';
  return 'recomendable';
}

const SERIES_CANON: CinephileCanonEntry[] = buildTvEvidence().map((evidence, index) => {
  const obligation = obligationFromTvEvidence(evidence);
  return {
    id: `series:canon:${index + 1}`,
    medium: 'series',
    title: evidence.title,
    year: TV_YEAR_HINTS[evidence.title],
    aliases: TV_ALIASES[evidence.title] ?? [],
    sourceRanks: {
      ...(evidence.wgaRank === undefined ? {} : { 'wga-2013': evidence.wgaRank }),
      ...(evidence.bbcRank === undefined ? {} : { 'bbc-2021': evidence.bbcRank }),
    },
    obligation,
    weight: OBLIGATION_WEIGHT[obligation],
  };
});

const CANON_BY_MEDIUM: Record<MediaKind, readonly CinephileCanonEntry[]> = {
  movie: MOVIE_CANON,
  series: SERIES_CANON,
};

export function externalCanonEntries(medium: MediaKind): readonly CinephileCanonEntry[] {
  return CANON_BY_MEDIUM[medium];
}

export function externalCanonTotalWeight(medium: MediaKind): number {
  return CANON_BY_MEDIUM[medium].reduce((sum, entry) => sum + entry.weight, 0);
}

export function obligationLabel(value: MediaCulturalObligation): string {
  return MEDIA_OBLIGATION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function mediaCulturalImportance(item: MediaTitleView): number | null {
  const dimensions = [
    item.cinephileValue === null ? null : { value: item.cinephileValue, weight: 0.6 },
    item.culturalImpact === null ? null : { value: item.culturalImpact, weight: 0.4 },
  ].filter((entry): entry is { value: number; weight: number } => entry !== null);

  if (dimensions.length === 0) return null;
  const totalWeight = dimensions.reduce((sum, entry) => sum + entry.weight, 0);
  return dimensions.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function titleCandidates(item: MediaTitleView): Set<string> {
  return new Set(
    [item.title, item.originalTitle]
      .filter((value): value is string => Boolean(value))
      .map(normalizeTitle),
  );
}

export function canonEntryMatchesItem(entry: CinephileCanonEntry, item: MediaTitleView): boolean {
  if (entry.medium !== item.medium) return false;
  if (entry.year !== undefined && item.year !== null && entry.year !== item.year) return false;
  const candidates = titleCandidates(item);
  return [entry.title, ...entry.aliases].some((title) => candidates.has(normalizeTitle(title)));
}

export function externalCanonEntryFor(item: MediaTitleView): CinephileCanonEntry | null {
  return CANON_BY_MEDIUM[item.medium].find((entry) => canonEntryMatchesItem(entry, item)) ?? null;
}

export function cinephileObligationFor(item: MediaTitleView): MediaCulturalObligation {
  const external = externalCanonEntryFor(item);
  if (external) return external.obligation;

  const importance = mediaCulturalImportance(item);
  if (importance === null) return 'opcional';
  if (importance >= 9.25) return 'muy-recomendable';
  if (importance >= 8.5) return 'recomendable';
  if (importance >= 7.5) return 'complementaria';
  return 'opcional';
}

export function obligationRank(value: MediaCulturalObligation): number {
  return MEDIA_OBLIGATION_OPTIONS.findIndex((option) => option.value === value);
}
