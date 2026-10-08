/** Count extended grapheme clusters (PR4 / V03-O12). */
export function graphemeCount(text: string, locale = "en"): number {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: string },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Segmenter) {
    const seg = new Segmenter(locale, { granularity: "grapheme" });
    return [...seg.segment(text)].length;
  }
  return [...text].length;
}

export const MAX_NAME_GRAPHEMES = 40;
