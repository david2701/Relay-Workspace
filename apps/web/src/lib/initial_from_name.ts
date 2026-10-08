/** First grapheme of `name`, uppercased for the actor monogram (PR4). */
export function initialFromName(name: string, locale = "en"): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
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
    const first = [...seg.segment(trimmed)][0]?.segment ?? "";
    return first.toLocaleUpperCase(locale);
  }
  return trimmed.charAt(0).toLocaleUpperCase(locale);
}
