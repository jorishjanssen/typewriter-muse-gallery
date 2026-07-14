export type Category = 'racing' | 'transfers' | 'gear' | 'offroad' | 'other';

export interface SourceDef {
  key: string;
  name: string;
  homepage: string;
  /** Tried in order until one parses; first working URL is remembered in the DB. */
  feedUrls: string[];
  lang: 'en' | 'nl';
  /** Default category when the LLM is unavailable and keywords don't decide. */
  defaultCategory: Category;
  enabled: boolean;
}

/**
 * v1 source registry — free, ad-supported sites whose full text we read
 * in-app instead. Add a source by appending an entry; the scheduler picks
 * it up on the next run. Paywalled sources (Escape Collective, Rouleur)
 * are deliberately excluded.
 */
export const SOURCES: SourceDef[] = [
  {
    key: 'cyclingnews',
    name: 'Cyclingnews',
    homepage: 'https://www.cyclingnews.com',
    feedUrls: [
      'https://www.cyclingnews.com/feeds/all/',
      'https://www.cyclingnews.com/rss/',
    ],
    lang: 'en',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'velo',
    name: 'Velo',
    homepage: 'https://velo.outsideonline.com',
    feedUrls: ['https://velo.outsideonline.com/feed/'],
    lang: 'en',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'cyclingweekly',
    name: 'Cycling Weekly',
    homepage: 'https://www.cyclingweekly.com',
    feedUrls: [
      'https://www.cyclingweekly.com/feeds/all/',
      'https://www.cyclingweekly.com/feed',
    ],
    lang: 'en',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'bikeradar',
    name: 'BikeRadar',
    homepage: 'https://www.bikeradar.com',
    feedUrls: ['https://www.bikeradar.com/feed'],
    lang: 'en',
    defaultCategory: 'gear',
    enabled: true,
  },
  {
    key: 'wielerflits',
    name: 'WielerFlits',
    homepage: 'https://www.wielerflits.nl',
    feedUrls: ['https://www.wielerflits.nl/feed/'],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'sporza',
    name: 'Sporza Wielrennen',
    homepage: 'https://sporza.be/nl/categorie/wielrennen/',
    feedUrls: [
      'https://sporza.be/nl/categorie/wielrennen.rss.xml',
      'https://www.vrt.be/vrtnws/nl.rss.sport.wielrennen.xml',
    ],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: true,
  },
];

export function getSource(key: string): SourceDef | undefined {
  return SOURCES.find((s) => s.key === key);
}
