import type { Category } from '../sources.js';

/**
 * Keyword fallback used when no LLM key is configured (or the call fails),
 * so the category filters stay useful either way. Matches EN + NL terms.
 * Titles are checked first across all rules — a title keyword is far
 * stronger signal than one buried in body text.
 */
const RULES: { category: Category; patterns: RegExp }[] = [
  {
    category: 'transfers',
    patterns:
      /\b(transfer|contract|signs?|signing|re-signs?|extension|retire(s|ment)?|new team|overstap|contractverlenging|tekent|verlengt|transfermarkt|stopt|vertrekt)\b/i,
  },
  {
    // Before offroad: a review of a gravel bike is gear news, not race news.
    category: 'gear',
    patterns:
      /\b(review|first ride|launched?|launches|unveil(s|ed)?|groupset|wheelset|frameset|derailleur|di2|sram|shimano|campagnolo|helmet|saddle|tyre|tire|banden|fiets(en)? getest|nieuw model)\b/i,
  },
  {
    category: 'offroad',
    patterns:
      /\b(gravel|mtb|mountain ?bik(e|ing)|cyclo-?cross|veldrijd(en|er)|veldrit|baanwielrennen|unbound|cape epic)\b/i,
  },
  {
    category: 'racing',
    patterns:
      /\b(stage|etappe|wins?|wint|winst|victory|zege|solozege|sprint|peloton|breakaway|gc|general classification|klassement|favorieten?|tour de france|giro|vuelta|roubaix|sanremo|lombardia|flanders|ronde van|luik-bastenaken|worlds?|wk|classics?|klassiekers?|koers|race|rit)\b/i,
  },
];

export function categorizeByKeywords(
  title: string,
  text: string,
  fallback: Category
): Category {
  for (const rule of RULES) {
    if (rule.patterns.test(title)) return rule.category;
  }
  const body = text.slice(0, 600);
  for (const rule of RULES) {
    if (rule.patterns.test(body)) return rule.category;
  }
  return fallback;
}
