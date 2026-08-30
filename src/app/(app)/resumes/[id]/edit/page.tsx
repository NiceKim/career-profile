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
          objectVersionId: it.objectVersionId,
          body: it.objectVersion.body,
          fields: it.objectVersion.fields,
          tags: it.objectVersion.tags,
          rootVersionId: it.objectVersion.rootVersionId,
          versionNumber: it.objectVersion.versionNumber,
          createdAt: it.objectVersion.createdAt,
        })),
      }))}
      versionInfo={`Editing from v${resume.id.slice(0, 8)}`}
    />
  );
}
