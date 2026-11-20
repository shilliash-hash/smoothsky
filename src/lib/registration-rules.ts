export const REGISTRATION_FALLBACK = {
  prefix: 'VP-', suffix_pattern: '[A-Z]{3}', suffix_length: 3,
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', source: 'SmoothSky emergency fallback',
};

export function registrationRule<T extends { country: string; prefix: string; suffix_pattern: string; suffix_length: number; alphabet: string }>(rules: T[], country: string | undefined) {
  return rules.find(rule => rule.country === country) ?? { ...REGISTRATION_FALLBACK, country: country ?? '' };
}