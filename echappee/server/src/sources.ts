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
  /** Some CDNs reject non-browser user agents (406/403); this sends a browser UA instead. */
  browserUa?: boolean;
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
    // Retired: TLS-level bot detection rejects every fetch (406) even with a
    // browser UA. road.cc covers the same ground. Entry kept so stored
    // articles keep their source name.
    defaultCategory: 'gear',
    enabled: false,
    browserUa: true,
  },
  {
    key: 'roadcc',
    name: 'road.cc',
    homepage: 'https://road.cc',
    feedUrls: ['https://road.cc/rss', 'https://road.cc/rss.xml', 'https://road.cc/feed'],
    lang: 'en',
    defaultCategory: 'gear',
    enabled: true,
  },
  {
    key: 'bikerumor',
    name: 'Bikerumor',
    homepage: 'https://bikerumor.com',
    feedUrls: ['https://bikerumor.com/feed/'],
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
  {
    key: 'idlprocycling',
    name: 'IDL ProCycling',
    homepage: 'https://www.idlprocycling.com',
    // Newsifier CMS: the RSS feed lives under /sitemap/news.xml (declared in
    // the page head), not the usual /feed path.
    feedUrls: [
      'https://www.idlprocycling.com/sitemap/news.xml',
      'https://www.indeleiderstrui.nl/sitemap/news.xml',
    ],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'noswielrennen',
    name: 'NOS Wielrennen',
    homepage: 'https://nos.nl/sport/wielrennen',
    feedUrls: [
      'https://feeds.nos.nl/nossportwielrennen',
      'https://nos.nl/feeds/nossportwielrennen',
    ],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'wielerrevue',
    name: 'Wieler Revue',
    homepage: 'https://wielerrevue.nl',
    feedUrls: ['https://wielerrevue.nl/feed', 'https://wielerrevue.nl/feed/'],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: true,
  },
  {
    key: 'hlnwielrennen',
    name: 'HLN Wielrennen',
    homepage: 'https://www.hln.be/sport/wielrennen',
    // Retired: the feed parses but DPG Media's WAF 403s every article fetch
    // and the feed itself ships no article bodies (paidrss) — nothing to
    // ingest. Sporza covers the Belgian angle.
    feedUrls: ['https://www.hln.be/sport/wielrennen/rss.xml'],
    lang: 'nl',
    defaultCategory: 'racing',
    enabled: false,
  },
];

export function getSource(key: string): SourceDef | undefined {
  return SOURCES.find((s) => s.key === key);
}
