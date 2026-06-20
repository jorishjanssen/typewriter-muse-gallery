import { differenceInYears, parseISO, format } from 'date-fns';

/** Age in whole years from an ISO date of birth. */
export const getAge = (dateOfBirth: string): number =>
  differenceInYears(new Date(), parseISO(dateOfBirth));

/** Two-letter ISO country code -> flag emoji (regional indicator symbols). */
export const flagEmoji = (countryCode: string): string => {
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2) return '🏳️';
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  );
};

/** Initials for an avatar fallback, e.g. "Tadej Pogačar" -> "TP". */
export const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat('en-US').format(value);

/** ISO date -> short label like "21 Sep". */
export const formatShortDate = (iso: string): string =>
  format(parseISO(iso), 'd MMM');
