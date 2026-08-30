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
          objectVersionId: it.objectVersionId,
          body: it.objectVersion.body,
          fields: it.objectVersion.fields,
          tags: it.objectVersion.tags,
          rootVersionId: it.objectVersion.rootVersionId,
          versionNumber: it.objectVersion.versionNumber,
          createdAt: it.objectVersion.createdAt,
        })),
      }))}
      versionInfo={`Forked from ${source.name}`}
    />
  );
}
