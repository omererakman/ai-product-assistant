export type LanguageCode = 
  | 'en' 
  | 'es' 
  | 'fr' 
  | 'de' 
  | 'it' 
  | 'pt' 
  | 'ja' 
  | 'ko' 
  | 'zh' 
  | 'ar' 
  | 'hi' 
  | 'ru' 
  | 'nl' 
  | 'pl' 
  | 'tr' 
  | 'sv' 
  | 'da' 
  | 'no' 
  | 'fi' 
  | 'cs' 
  | 'ro' 
  | 'hu' 
  | 'el' 
  | 'th' 
  | 'vi' 
  | 'id' 
  | 'uk' 
  | 'he' 
  | 'bg' 
  | 'hr' 
  | 'sk' 
  | 'sl' 
  | 'et' 
  | 'lv' 
  | 'lt' 
  | 'mt' 
  | 'ga' 
  | 'cy';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'et', name: 'Estonian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'mt', name: 'Maltese' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'cy', name: 'Welsh' },
];

export const LANGUAGE_NAMES: Record<LanguageCode, string> = LANGUAGE_OPTIONS.reduce(
  (acc, lang) => {
    acc[lang.code] = lang.name;
    return acc;
  },
  {} as Record<LanguageCode, string>
);
