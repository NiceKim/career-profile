import { getCurrentUserId } from '@/lib/session';
import { ResumeForm } from '../ResumeForm';

export default async function NewResumePage() {
  await getCurrentUserId();
  return <ResumeForm mode="create" />;
}
