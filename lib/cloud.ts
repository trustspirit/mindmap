import type { SupabaseClient } from '@supabase/supabase-js';
import type { Library } from './library';

export async function writeCloudLibrary(client: SupabaseClient, ownerId: string, library: Library) {
  const workspaces = await client.from('workspaces').upsert(library.workspaces.map(workspace => ({
    id: workspace.id, owner_id: ownerId, name: workspace.name, created_at: workspace.createdAt,
  })), { onConflict: 'id,owner_id' });
  if (workspaces.error) throw workspaces.error;
  if (!library.maps.length) return;
  const maps = await client.from('mindmaps').upsert(library.maps.map(map => ({
    id: map.id, owner_id: ownerId, workspace_id: map.workspaceId, title: map.title,
    content: { nodes: map.nodes }, updated_at: map.updatedAt,
  })), { onConflict: 'id,owner_id' });
  if (maps.error) throw maps.error;
}
