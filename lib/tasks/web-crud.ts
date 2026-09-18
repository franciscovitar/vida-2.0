import 'server-only';

import { createNotionActionsClient } from '@/lib/actions/notion-client';
import { getNotionConfig } from '@/lib/notion/config';
import { createPlanningTaskCrudService } from '@/lib/tasks/web-crud-core';

export { createPlanningTaskCrudService } from '@/lib/tasks/web-crud-core';

export function planningTaskCrudFromEnv() {
  const config = getNotionConfig();
  if (!config.ok) return null;
  return createPlanningTaskCrudService({
    client: createNotionActionsClient(config.config.token),
    tasksDataSourceId: config.config.tasksDataSourceId,
    projectsDataSourceId: config.config.projectsDataSourceId,
    areasDataSourceId: config.config.areasDataSourceId,
  });
}
