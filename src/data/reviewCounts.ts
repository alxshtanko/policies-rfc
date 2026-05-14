import raw from './review-counts.json';

export interface ReviewCountsManifest {
  /** Comment count per full giscus term, e.g. "policy-review:integration:simulator". */
  counts: Record<string, number>;
  /** ISO timestamp of when the manifest was generated, or null if unknown. */
  fetchedAt: string | null;
}

export const reviewCounts: ReviewCountsManifest = raw as ReviewCountsManifest;

const TERM_PREFIX =
  (import.meta.env.VITE_GISCUS_TERM as string | undefined) ?? 'policy-review';

/** Look up the comment count for a (prefix-relative) section term, e.g. "integration:simulator". */
export function reviewCountFor(sectionTerm: string): number {
  return reviewCounts.counts[`${TERM_PREFIX}:${sectionTerm}`] ?? 0;
}
