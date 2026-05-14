import { H2, Row } from '@/canvas-ui';
import { ReviewButton } from './FloatingReview';

/**
 * H2 with an inline "Review" button that opens a section-scoped giscus thread.
 *
 * Each section gets its own `term` (kebab-case, stable across deploys). The
 * `title` is shown in the panel header so reviewers know what they're commenting on.
 */
export function SectionHeading({
  children,
  term,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  term: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <Row gap={10} align="center" wrap>
      <H2>{children}</H2>
      <ReviewButton term={term} title={title} subtitle={subtitle} />
    </Row>
  );
}
