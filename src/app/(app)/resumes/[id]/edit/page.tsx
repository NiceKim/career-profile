import { getCurrentUserId } from '@/lib/session';
import { getResumeVersionWithContent } from '@/lib/resumes/queries';
import { ResumeForm } from '../../ResumeForm';

export default async function EditResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  const resume = await getResumeVersionWithContent(userId, id);

  return (
    <ResumeForm
      mode="edit"
      sourceId={resume.id}
      initialName={resume.name}
      initialSections={resume.sections.map((s) => ({
        sectionType: s.sectionType,
        items: s.items.map((it) => ({
          objectRevisionId: it.objectRevisionId,
          body: it.objectRevision.body,
          fields: it.objectRevision.fields,
          tags: it.objectRevision.tags,
          objectVariationId: it.objectRevision.objectVariationId,
          versionNumber: it.objectRevision.versionNumber,
          createdAt: it.objectRevision.createdAt,
        })),
      }))}
      versionInfo={`Editing from v${resume.id.slice(0, 8)}`}
    />
  );
}
