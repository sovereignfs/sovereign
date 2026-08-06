import { notFound } from 'next/navigation';
import SectionContent from '../_components/SectionContent';
import { sectionBySlug } from '../_lib/sections';

export default async function ExampleMobileSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  const section = sectionBySlug(slug);
  if (!section) notFound();

  return <SectionContent section={section} />;
}
