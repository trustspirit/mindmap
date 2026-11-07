export type MapNode = { id: string; text: string; color: string; x: number; y: number; parent?: string; kind?: string; pinned?: boolean };
export type Workspace = { id: string; name: string; createdAt: string };
export type MapDocument = { id: string; workspaceId: string; title: string; nodes: MapNode[]; updatedAt: string };
export type Library = { version: 2; workspaces: Workspace[]; maps: MapDocument[]; activeWorkspaceId: string; activeMapId: string };

export function makeMap(workspaceId: string): MapDocument {
  return { id: crypto.randomUUID(), workspaceId, title: '새 마인드맵', updatedAt: new Date().toISOString(), nodes: [{ id: crypto.randomUUID(), text: '새 마인드맵', color: 'violet', x: 495, y: 292 }] };
}
export function createLibrary(nodes: MapNode[], legacy?: { nodes?: MapNode[]; title?: string; mapId?: string }): Library {
  const workspace = { id: crypto.randomUUID(), name: '내 워크스페이스', createdAt: new Date().toISOString() };
  const map = makeMap(workspace.id);
  map.nodes = legacy?.nodes?.length ? legacy.nodes : nodes;
  map.title = legacy?.title || '나만의 마인드맵';
  map.id = legacy?.mapId || map.id;
  return { version: 2, workspaces: [workspace], maps: [map], activeWorkspaceId: workspace.id, activeMapId: map.id };
}
export function saveMap(library: Library, map: MapDocument): Library {
  if (!library.workspaces.some(w => w.id === map.workspaceId)) throw new Error('워크스페이스를 찾을 수 없습니다.');
  return { ...library, maps: [...library.maps.filter(item => item.id !== map.id), map] };
}
export function addWorkspace(library: Library, name: string): Library {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) throw new Error('워크스페이스 이름은 1~60자로 입력해 주세요.');
  if (library.workspaces.some(w => w.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('같은 이름의 워크스페이스가 있습니다.');
  const workspace = { id: crypto.randomUUID(), name: trimmed, createdAt: new Date().toISOString() };
  const map = makeMap(workspace.id);
  return { ...library, workspaces: [...library.workspaces, workspace], maps: [...library.maps, map], activeWorkspaceId: workspace.id, activeMapId: map.id };
}
export function selectWorkspace(library: Library, workspaceId: string): Library {
  if (!library.workspaces.some(w => w.id === workspaceId)) return library;
  const map = library.maps.filter(item => item.workspaceId === workspaceId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (map) return { ...library, activeWorkspaceId: workspaceId, activeMapId: map.id };
  const blank = makeMap(workspaceId);
  return { ...library, maps: [...library.maps, blank], activeWorkspaceId: workspaceId, activeMapId: blank.id };
}
export function mergeLibraries(local: Library, remote: { workspaces: Workspace[]; maps: MapDocument[] }): Library {
  const workspaces = [...new Map([...local.workspaces, ...remote.workspaces].map(w => [w.id,w])).values()];
  const maps = new Map(local.maps.map(map => [map.id, map]));
  for (const map of remote.maps) if (!maps.has(map.id) || maps.get(map.id)!.updatedAt < map.updatedAt) maps.set(map.id, map);
  return { ...local, workspaces, maps: [...maps.values()] };
}
export function readLibrary(raw: string): Library {
  const value = JSON.parse(raw) as Library;
  if (value.version !== 2 || !Array.isArray(value.workspaces) || !value.workspaces.length || !Array.isArray(value.maps)) throw new Error('저장된 목록을 읽을 수 없습니다.');
  for (const w of value.workspaces) if (typeof w.id !== 'string' || typeof w.name !== 'string') throw new Error('잘못된 워크스페이스');
  for (const map of value.maps) {
    if (!value.workspaces.some(w => w.id === map.workspaceId) || typeof map.title !== 'string' || !map.nodes?.length || map.nodes.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))) throw new Error('잘못된 마인드맵');
  }
  if (!value.maps.some(m => m.id === value.activeMapId && m.workspaceId === value.activeWorkspaceId)) return selectWorkspace(value, value.workspaces[0].id);
  return value;
}
