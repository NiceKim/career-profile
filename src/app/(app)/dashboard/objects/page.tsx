import { getCurrentUserId } from '@/lib/session';
import { getObjectDashboard } from '@/lib/objects/dashboard';
import { listTagsForUser } from '@/lib/objects/queries';
import { ObjectDashboardClient } from './ObjectDashboardClient';

export default async function ObjectDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tags?: string }>;
}) {
  const { tags } = await searchParams;
  const userId = await getCurrentUserId();
  const [dashboard, allTags] = await Promise.all([getObjectDashboard(userId), listTagsForUser(userId)]);

  const activeTags = tags ? tags.split(',').map((t) => t.trim()) : [];
  const filtered = dashboard.filter((entry) => {
    if (activeTags.length === 0) return true;
    return entry.variations.some((v) => v.tags.some((t) => activeTags.includes(t)));
  });

  return <ObjectDashboardClient dashboard={filtered} allTags={allTags} searchTags={tags} />;
}
