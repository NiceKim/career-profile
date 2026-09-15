import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function ForkResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const source = await getResumeVersionWithContent(userId, id);

  return (
    <ResumeForm
      mode="fork"
      sourceId={source.id}
      initialName={`Fork of ${source.name}`}
      initialSections={source.sections.map((s) => ({
        sectionType: s.sectionType,
        items: s.items.map((it) => ({
          objectRevisionId: it.objectRevisionId,
          objectId: it.objectRevision.objectId,
          body: it.objectRevision.body,
          fields: it.objectRevision.fields,
          tags: it.objectRevision.tags,
          objectVariationId: it.objectRevision.objectVariationId,
          versionNumber: it.objectRevision.versionNumber,
          createdAt: it.objectRevision.createdAt,
        })),
      }))}
      versionInfo={`Forked from ${source.name}`}
    />
  );
}
