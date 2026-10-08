import type { LocaleCode } from "../i18n/types";
import type { ParseKind } from "./date_parse";

/** v1.2 phrase table rows — each row must parse in es / en / fr (see date_parse.i18n.test.ts). */
export type PhraseTestRow = {
  id: string;
  es: string;
  en: string;
  fr: string;
  kind: ParseKind;
};

export const PHRASE_TEST_ROWS: PhraseTestRow[] = [
  { id: "today", es: "hoy", en: "today", fr: "aujourd'hui", kind: "due" },
  { id: "tomorrow", es: "mañana", en: "tomorrow", fr: "demain", kind: "due" },
  {
    id: "day_after",
    es: "pasado mañana",
    en: "day after tomorrow",
    fr: "après-demain",
    kind: "due",
  },
  { id: "afternoon", es: "esta tarde", en: "this afternoon", fr: "cet après-midi", kind: "due" },
  { id: "weekend_short", es: "finde", en: "weekend", fr: "week-end", kind: "due" },
  {
    id: "weekend_long",
    es: "este fin de semana",
    en: "this weekend",
    fr: "ce week-end",
    kind: "due",
  },
  {
    id: "next_week",
    es: "próxima semana",
    en: "next week",
    fr: "semaine prochaine",
    kind: "due",
  },
  { id: "no_date", es: "sin fecha", en: "no date", fr: "sans date", kind: "due" },
  { id: "no_reminder", es: "sin aviso", en: "no reminder", fr: "sans rappel", kind: "reminder" },
  { id: "friday", es: "vie", en: "fri", fr: "ven", kind: "due" },
];

export const EMPTY_PHRASES: Record<LocaleCode, string[]> = {
  es: ["sin fecha", "sin aviso", "ninguna", "ninguno"],
  en: ["no date", "no reminder", "none"],
  fr: ["sans date", "sans rappel", "aucune", "aucun"],
};

export const ALL_EMPTY_PHRASES = [
  ...EMPTY_PHRASES.es,
  ...EMPTY_PHRASES.en,
  ...EMPTY_PHRASES.fr,
];

/** Folded tokens → weekday index (Sun=0). All v1.2 locales. */
export const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  dom: 0,
  sunday: 0,
  sun: 0,
  dimanche: 0,
  dim: 0,
  lunes: 1,
  lun: 1,
  monday: 1,
  mon: 1,
  lundi: 1,
  martes: 2,
  mar: 2,
  tuesday: 2,
  tue: 2,
  mardi: 2,
  miercoles: 3,
  mie: 3,
  wednesday: 3,
  wed: 3,
  mercredi: 3,
  mer: 3,
  jueves: 4,
  jue: 4,
  thursday: 4,
  thu: 4,
  jeudi: 4,
  jeu: 4,
  viernes: 5,
  vie: 5,
  friday: 5,
  fri: 5,
  vendredi: 5,
  ven: 5,
  sabado: 6,
  sab: 6,
  saturday: 6,
  sat: 6,
  samedi: 6,
  sam: 6,
};

export const MULTI_WORD_PHRASES = [
  "pasado manana",
  "day after tomorrow",
  "apres demain",
  "esta tarde",
  "this afternoon",
  "cet apres midi",
  "fin de semana",
  "este fin de semana",
  "this weekend",
  "ce week end",
  "proxima semana",
  "prox semana",
  "next week",
  "semaine prochaine",
] as const;

export const SINGLE_DAY_PHRASES = [
  "hoy",
  "today",
  "aujourd hui",
  "aujourdhui",
  "manana",
  "tomorrow",
  "demain",
  "pasado",
  "finde",
  "weekend",
  "week end",
] as const;
