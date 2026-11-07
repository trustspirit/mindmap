'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Cloud, Download, Grid2X2, LockKeyhole, Move, PanelLeftClose, Plus, Search, Sparkles, StickyNote, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react';
import { writeCloudLibrary } from '../lib/cloud';
import { AuthDialog } from '../components/AuthDialog';
import { createLibrary, saveMap, addWorkspace, selectWorkspace, makeMap, mergeLibraries, readLibrary, type Library } from '../lib/library';
import { Pencil, PanelsTopLeft, PanelLeftOpen, Trash2, GitBranch, LogOut, LogIn, X, Keyboard, UserRound } from 'lucide-react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type NodeItem = { id: string; text: string; color: string; x: number; y: number; parent?: string; kind?: string; pinned?: boolean };
const initial: NodeItem[] = [
  { id: 'center', text: '나만의\n마인드맵', color: 'violet', x: 495, y: 292 },
  { id: 'a', text: '아이디어 수집', color: 'orange', x: 210, y: 92, parent: 'center' },
  { id: 'a1', text: '브레인스토밍', color: 'orange', x: 42, y: 24, parent: 'a', kind: 'plain' },
  { id: 'a2', text: '레퍼런스 찾기', color: 'orange', x: 42, y: 86, parent: 'a', kind: 'plain' },
  { id: 'a3', text: '키워드 정리', color: 'orange', x: 42, y: 148, parent: 'a', kind: 'plain' },
  { id: 'b', text: '목표 설정', color: 'blue', x: 210, y: 258, parent: 'center' },
  { id: 'b1', text: '핵심 메시지', color: 'blue', x: 42, y: 190, parent: 'b', kind: 'plain' },
  { id: 'b2', text: '타깃 사용자', color: 'blue', x: 42, y: 252, parent: 'b', kind: 'plain' },
  { id: 'b3', text: '성공 기준', color: 'blue', x: 42, y: 314, parent: 'b', kind: 'plain' },
  { id: 'c', text: '실행 계획', color: 'green', x: 210, y: 424, parent: 'center' },
  { id: 'c1', text: '우선순위 정하기', color: 'green', x: 42, y: 378, parent: 'c', kind: 'plain' },
  { id: 'c2', text: '일정 만들기', color: 'green', x: 42, y: 440, parent: 'c', kind: 'plain' },
  { id: 'd', text: '함께 나누기', color: 'pink', x: 790, y: 152, parent: 'center' },
  { id: 'd1', text: '팀원 초대', color: 'pink', x: 948, y: 7, parent: 'd', kind: 'plain' },
  { id: 'd2', text: '의견 모으기', color: 'pink', x: 948, y: 69, parent: 'd', kind: 'plain' },
  { id: 'd3', text: '함께 완성하기', color: 'pink', x: 948, y: 131, parent: 'd', kind: 'plain' },
  { id: 'e', text: '결과 만들기', color: 'yellow', x: 790, y: 370, parent: 'center' },
  { id: 'e1', text: '아이디어 구체화', color: 'yellow', x: 948, y: 38, parent: 'e', kind: 'plain' },
  { id: 'e2', text: '첫 번째 결과물', color: 'yellow', x: 948, y: 100, parent: 'e', kind: 'plain' },
  { id: 'e3', text: '회고하고 개선', color: 'yellow', x: 948, y: 162, parent: 'e', kind: 'plain' },
];
const colors = ['orange', 'blue', 'green', 'pink', 'yellow', 'violet'];
const palettes = ['#f5a65b', '#5e9ce6', '#55b99a', '#e878aa', '#e9bd55', '#479b77'];
const NODE_GAP = 20;
const nodeSize = (node: NodeItem) => ({ width: !node.parent ? 128 : node.kind === 'plain' ? 118 : 146, height: !node.parent ? 60 : node.kind === 'plain' ? 32 : 46 });
type DragGesture = { pointerId: number; id: string; startX: number; startY: number; scale: number; original: NodeItem[]; moving: Set<string>; moved: boolean; lastDelta: { x: number; y: number } };
type PointerLike = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;

function descendantsOf(nodes: NodeItem[], id: string) {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) if (node.parent && result.has(node.parent) && !result.has(node.id)) { result.add(node.id); changed = true; }
  }
  return result;
}

function overlaps(a: NodeItem, b: NodeItem, gap = 8) {
  const as = nodeSize(a); const bs = nodeSize(b);
  return a.x < b.x + bs.width + gap && a.x + as.width + gap > b.x && a.y < b.y + bs.height + gap && a.y + as.height + gap > b.y;
}

function layoutMindmap(source: NodeItem[]) {
  const result = source.map(node => ({ ...node }));
  const root = result.find(node => !node.parent);
  if (!root) return result;
  const childMap = new Map<string, NodeItem[]>();
  for (const node of result) if (node.parent) childMap.set(node.parent, [...(childMap.get(node.parent) ?? []), node]);
  const heightMemo = new Map<string, number>();
  const subtreeHeight = (node: NodeItem): number => {
    if (heightMemo.has(node.id)) return heightMemo.get(node.id)!;
    const children = childMap.get(node.id) ?? [];
    const ownHeight = nodeSize(node).height;
    const childrenHeight = children.length ? children.reduce((sum, child) => sum + subtreeHeight(child), 0) + NODE_GAP * (children.length - 1) : 0;
    const total = Math.max(ownHeight, childrenHeight);
    heightMemo.set(node.id, total);
    return total;
  };
  const place = (node: NodeItem, top: number, parent: NodeItem, direction: number) => {
    node.x = direction < 0 ? parent.x - 90 - nodeSize(node).width : parent.x + nodeSize(parent).width + 90;
    node.pinned = false;
    const children = (childMap.get(node.id) ?? []).sort((a, b) => a.y - b.y);
    const ownHeight = nodeSize(node).height;
    const totalHeight = subtreeHeight(node);
    if (!node.parent) return;
    node.y = top + (totalHeight - ownHeight) / 2;
    const childrenHeight = children.length ? children.reduce((sum, child) => sum + subtreeHeight(child), 0) + NODE_GAP * (children.length - 1) : 0;
    let cursor = top + (totalHeight - childrenHeight) / 2;
    children.forEach(child => { const h = subtreeHeight(child); place(child, cursor, node, direction); cursor += h + NODE_GAP; });
  };
  const direct = childMap.get(root.id) ?? [];
  for (const side of ['left', 'right'] as const) {
    const group = direct.filter(node => side === 'left' ? node.x < root.x : node.x >= root.x).sort((a, b) => a.y - b.y);
    if (!group.length) continue;
    const total = group.reduce((sum, node) => sum + subtreeHeight(node), 0) + NODE_GAP * (group.length - 1);
    let cursor = root.y + nodeSize(root).height / 2 - total / 2;
    group.forEach(node => { const h = subtreeHeight(node); place(node, cursor, root, side === 'left' ? -1 : 1); cursor += h + NODE_GAP; });
  }
  return result;
}

// Append within the branch, then reserve a separate vertical band for every subtree.
// Addition and layout are committed together so one undo restores both.
function insertAndLayout(nodes: NodeItem[], node: NodeItem) {
  const siblings = nodes.filter(item => item.parent === node.parent);
  const y = siblings.length ? Math.max(...siblings.map(item => item.y + nodeSize(item).height)) + NODE_GAP : node.y;
  return layoutMindmap([...nodes, { ...node, y }]);
}

// Move the grabbed subtree exactly with the pointer. Other branches keep their
// internal geometry and find the closest free vertical slot, including cascades.
function reflowDrag(nodes: NodeItem[], moving: Set<string>, dx: number, dy: number) {
  const placed = nodes.filter(node => moving.has(node.id)).map(node => ({ ...node, x: node.x + dx, y: node.y + dy }));
  const assigned = new Set(moving);
  const groups: NodeItem[][] = [];
  const visit = (node: NodeItem) => {
    if (assigned.has(node.id)) return;
    const ids = descendantsOf(nodes, node.id);
    if ([...moving].some(id => ids.has(id))) {
      groups.push([node]); assigned.add(node.id);
      nodes.filter(child => child.parent === node.id).forEach(visit);
    } else {
      const group = nodes.filter(item => ids.has(item.id));
      group.forEach(item => assigned.add(item.id)); groups.push(group);
    }
  };
  nodes.filter(node => !node.parent).forEach(visit);
  nodes.forEach(visit);
  for (const group of groups) {
    const forbidden: Array<[number, number]> = [];
    for (const node of group) for (const obstacle of placed) {
      const size = nodeSize(node); const other = nodeSize(obstacle);
      if (node.x < obstacle.x + other.width + NODE_GAP && node.x + size.width + NODE_GAP > obstacle.x) {
        forbidden.push([obstacle.y - node.y - size.height - NODE_GAP, obstacle.y + other.height + NODE_GAP - node.y]);
      }
    }
    forbidden.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const interval of forbidden) {
      const last = merged[merged.length - 1];
      if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const blocked = merged.find(([low, high]) => low < 0 && high > 0);
    const shift = blocked ? (Math.abs(blocked[0]) < Math.abs(blocked[1]) ? blocked[0] : blocked[1]) : 0;
    placed.push(...group.map(node => ({ ...node, y: node.y + shift })));
  }
  const byId = new Map(placed.map(node => [node.id, node]));
  return nodes.map(node => byId.get(node.id)!);
}

const MIN_ZOOM = 20;
const MAX_ZOOM = 300;
function zoomAtPoint(zoom: number, nextZoom: number, offset: { x: number; y: number }, point: { x: number; y: number }) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  const ratio = clamped / zoom;
  return { zoom: clamped, offset: { x: point.x - (point.x - offset.x) * ratio, y: point.y - (point.y - offset.y) * ratio } };
}

function IconButton({ children, title, onClick, active = false }: { children: React.ReactNode; title: string; onClick?: () => void; active?: boolean }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} title={title} onClick={onClick}>{children}</button>;
}

export default function Home() {
  const [nodes, setNodes] = useState<NodeItem[]>(() => layoutMindmap(initial));
  const [history, setHistory] = useState<NodeItem[][]>(() => [layoutMindmap(initial)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selected, setSelected] = useState('center');
  const [zoom, setZoom] = useState(100);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState('');
  const [title, setTitle] = useState('나만의 마인드맵');
  const [editingTitle, setEditingTitle] = useState(false);
  const [ready, setReady] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('local');
  const [authOpen, setAuthOpen] = useState(false);
  const [library, setLibrary] = useState<Library | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [storageError, setStorageError] = useState('');
  const storageKeyRef = useRef('mimo-library-v2:guest');
  const loadedOwnerRef = useRef<string | null>(null);
  const cloudTimerRef = useRef<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const cloudQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [mapId, setMapId] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragGesture | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragViewport, setDragViewport] = useState<{ scale: number; centerX: number; centerY: number } | null>(null);
  const [viewAnchor, setViewAnchor] = useState<{ scale: number; centerX: number; centerY: number } | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1100, height: 620 });

  useEffect(() => {
    const preference = localStorage.getItem('lulpup-sidebar-collapsed');
    setSidebarCollapsed(preference === null ? window.innerWidth < 800 : preference === 'true');
  }, []);
  useEffect(() => {
    if (!workspaceOpen && !authOpen && !shortcutsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setWorkspaceOpen(false); setAuthOpen(false); setShortcutsOpen(false); }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('[role="dialog"]');
      const items = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []);
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [workspaceOpen, authOpen, shortcutsOpen]);
  const activateLibrary = (next: Library) => {
    const map = next.maps.find(item => item.id === next.activeMapId)!;
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragRef.current = null; dragFrameRef.current = null;
    setDraggingNode(null); setDragViewport(null);
    setLibrary(next); setMapId(map.id); setTitle(map.title); setNodes(map.nodes);
    setHistory([map.nodes]); setHistoryIndex(0); setSelected(map.nodes.find(n => !n.parent)?.id ?? map.nodes[0].id);
    setIsEditing(false); setEditingTitle(false); setSearch('');
    setZoom(100); setViewAnchor(null); setCanvasOffset({ x: 0, y: 0 });
  };
  const snapshotLibrary = (): Library => {
    const current = library!.maps.find(map => map.id === mapId)!;
    const snapshotNodes = isEditing ? nodes.map(node => node.id === selected ? { ...node, text: editingText.trim() || '새 아이디어' } : node) : nodes;
    return saveMap(library!, { ...current, nodes: snapshotNodes, title: editingTitle ? titleDraft.trim() || title : title, updatedAt: new Date().toISOString() });
  };
  const requireAccount = () => { if (!user) { setAuthOpen(true); return false; } return ready && !signingOut && loadedOwnerRef.current === user.id; };
  const newMap = () => {
    if (!requireAccount()) return;
    if (!library || !ready || dragRef.current) return;
    const saved = snapshotLibrary(); const map = makeMap(saved.activeWorkspaceId);
    activateLibrary({ ...saved, maps: [...saved.maps, map], activeMapId: map.id });
  };
  const openMap = (id: string) => {
    if (!requireAccount()) return;
    if (!library || dragRef.current || id === mapId) return;
    const saved = snapshotLibrary(); const map = saved.maps.find(item => item.id === id);
    if (map) activateLibrary({ ...saved, activeMapId: id, activeWorkspaceId: map.workspaceId });
  };
  const logout = async () => {
    if (!supabase || !user || signingOut) return;
    setSigningOut(true);
    if (cloudTimerRef.current !== null) window.clearTimeout(cloudTimerRef.current);
    const snapshot = snapshotLibrary();
    try {
      // Include edits still inside the debounce window before ending the session.
      localStorage.setItem(storageKeyRef.current, JSON.stringify(snapshot));
      if (cloudReady) {
        cloudQueueRef.current = cloudQueueRef.current.catch(() => {}).then(() => writeCloudLibrary(supabase, user.id, snapshot));
        await cloudQueueRef.current;
      }
    } catch { showNotice('최신 변경 사항의 클라우드 저장을 확인하지 못했습니다.'); }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) showNotice('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    } finally { setSigningOut(false); }
  };
  const beginRename = () => { if (!requireAccount()) return; setTitleDraft(title); setEditingTitle(true); };
  const finishRename = () => { if (!requireAccount()) return; setTitle(titleDraft.trim() || title); setEditingTitle(false); };
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setCloudStatus('local'); return; }
    const client = createClient(url, key);
    setSupabase(client);
    client.auth.getUser().then(({ data }) => setUser(data.user)).catch(() => setCloudStatus('error'));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); if (!session) { setWorkspaceOpen(false); setIsEditing(false); setEditingTitle(false); } });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setReady(false); setCloudReady(false); setStorageError(''); loadedOwnerRef.current = null;
    const key = `mimo-library-v2:${user?.id ?? 'guest'}`;
    const load = async () => {
      let local: Library | null = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) local = readLibrary(raw);
        else if (!user) {
          const legacy = localStorage.getItem('mimo-map-v1');
          local = createLibrary(layoutMindmap(initial), legacy ? JSON.parse(legacy) : undefined);
        }
        if (supabase && user) {
          setCloudStatus('loading');
          const [ws, maps] = await Promise.all([
            supabase.from('workspaces').select('id,name,created_at').eq('owner_id', user.id),
            supabase.from('mindmaps').select('id,workspace_id,title,content,updated_at').eq('owner_id', user.id),
          ]);
          if (cancelled) return;
          if (ws.error || maps.error) {
            setCloudStatus('error');
          } else {
            const remote = { workspaces: (ws.data ?? []).map(w => ({ id: w.id, name: w.name, createdAt: w.created_at })), maps: (maps.data ?? []).map(m => ({ id: m.id, workspaceId: m.workspace_id, title: m.title, nodes: m.content.nodes as NodeItem[], updatedAt: m.updated_at })) };
            if (!local && remote.workspaces.length) {
              local = selectWorkspace({ version: 2, ...remote, activeWorkspaceId: remote.workspaces[0].id, activeMapId: '' }, remote.workspaces[0].id);
            } else if (local) local = mergeLibraries(local, remote);
            setCloudReady(true); setCloudStatus('saved');
          }
        } else setCloudStatus(supabase ? 'login' : 'local');
        if (cancelled) return;
        storageKeyRef.current = key;
        loadedOwnerRef.current = user?.id ?? 'guest';
        activateLibrary(local ?? createLibrary(layoutMindmap(initial)));
        setReady(true);
      } catch {
        if (!cancelled) setStorageError('저장된 데이터를 읽지 못했습니다. 기존 저장 데이터는 덮어쓰지 않았습니다. 페이지를 새로고침해 주세요.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);
  useEffect(() => {
    if (!ready || draggingNode || !mapId) return;
    setLibrary(current => {
      const map = current?.maps.find(item => item.id === mapId);
      if (!current || !map || (map.nodes === nodes && map.title === title)) return current;
      return saveMap(current, { ...map, nodes, title, updatedAt: new Date().toISOString() });
    });
  }, [nodes, title, mapId, ready, draggingNode]);
  useEffect(() => {
    if (!ready || !library) return;
    try { localStorage.setItem(storageKeyRef.current, JSON.stringify(library)); setStorageError(''); }
    catch { setStorageError('브라우저 저장 공간이 부족합니다. JSON으로 내보내 백업해 주세요.'); }
  }, [library, ready]);
  useEffect(() => {
    if (!supabase || !user || signingOut || loadedOwnerRef.current !== user.id || !cloudReady || !ready || !library) return;
    let cancelled = false;
    setCloudStatus('saving');
    const timeout = window.setTimeout(() => {
      // Serialize writes so an older request cannot overwrite a newer snapshot.
      cloudQueueRef.current = cloudQueueRef.current.catch(() => {}).then(async () => {
        await writeCloudLibrary(supabase, user.id, library);
        if (!cancelled) setCloudStatus('saved');
      }).catch(() => { if (!cancelled) setCloudStatus('error'); });
    }, 700);
    cloudTimerRef.current = timeout;
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [supabase, user?.id, cloudReady, ready, library, signingOut]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ width, height });
    });
    resize.observe(canvas);
    return () => resize.disconnect();
  }, []);

  const commitNodes = (next: NodeItem[]) => {
    if (!requireAccount()) return;
    setNodes(next);
    setHistory(prev => [...prev.slice(0, historyIndex + 1), next]);
    setHistoryIndex(index => index + 1);
  };
  const undo = () => { if (!requireAccount()) return; if (historyIndex > 0) { const index = historyIndex - 1; setHistoryIndex(index); setNodes(history[index]); setViewAnchor(null); } };
  const redo = () => { if (!requireAccount()) return; if (historyIndex < history.length - 1) { const index = historyIndex + 1; setHistoryIndex(index); setNodes(history[index]); setViewAnchor(null); } };
  const updateText = (id: string, text: string) => commitNodes(nodes.map(node => node.id === id ? { ...node, text } : node));
  const finishNodeEdit = (id: string) => {
    const current = nodes.find(node => node.id === id);
    if (current && current.text !== editingText) updateText(id, editingText.trim() || '새 아이디어');
    setIsEditing(false);
  };
  const addNode = (parentId = selected, requestedKind?: string) => {
    if (!requireAccount()) return;
    const parent = nodes.find(node => node.id === parentId) ?? nodes[0];
    const parentIsRoot = !parent.parent;
    const children = nodes.filter(node => node.parent === parent.id);
    const root = nodes.find(node => !node.parent) ?? parent;
    let ancestor = parent;
    while (ancestor.parent && ancestor.parent !== root.id) {
      const next = nodes.find(node => node.id === ancestor.parent);
      if (!next) break;
      ancestor = next;
    }
    const direction = parentIsRoot
      ? (children.filter(node => node.x < root.x).length <= children.filter(node => node.x >= root.x).length ? -1 : 1)
      : (ancestor.x < root.x ? -1 : 1);
    const x = direction < 0 ? parent.x - 90 - (requestedKind === 'memo' || parentIsRoot ? 146 : 118) : parent.x + nodeSize(parent).width + 90;
    const kind = requestedKind ?? (parentIsRoot ? 'branch' : 'plain');
    const id = `node-${crypto.randomUUID()}`;
    const newNode: NodeItem = { id, text: kind === 'memo' ? '메모' : '새 아이디어', color: parentIsRoot ? colors[children.length % colors.length] : parent.color, x, y: parent.y, parent: parent.id, kind };
    const next = insertAndLayout(nodes, newNode);
    commitNodes(next); setSelected(id); setEditingText(newNode.text); setIsEditing(true); setViewAnchor(null);
  };
  const removeNode = () => {
    if (!requireAccount()) return;
    if (!nodes.find(node => node.id === selected)?.parent) return;
    const ids = descendantsOf(nodes, selected);
    commitNodes(nodes.filter(node => !ids.has(node.id))); setSelected(nodes.find(node => !node.parent)?.id ?? 'center'); setViewAnchor(null);
  };
  const startNodeDrag = (event: React.PointerEvent<HTMLDivElement>, node: NodeItem) => {
    if (!user || event.button !== 0 || (event.target as HTMLElement).closest('button,textarea')) return;
    const moving = descendantsOf(nodes, node.id);
    dragRef.current = { pointerId: event.pointerId, id: node.id, startX: event.clientX, startY: event.clientY, scale: viewScale, original: nodes, moving, moved: false, lastDelta: { x: 0, y: 0 } };
    const anchor = { scale: viewScale / (zoom / 100), centerX: contentCenterX, centerY: contentCenterY };
    setViewAnchor(anchor);
    setDragViewport({ ...anchor, scale: anchor.scale * zoom / 100 });
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(node.id);
  };
  const moveNodeDrag = (event: PointerLike) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - gesture.startX) / gesture.scale;
    const deltaY = (event.clientY - gesture.startY) / gesture.scale;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 2) return;
    gesture.moved = true;
    setDraggingNode(gesture.id);
    gesture.lastDelta = { x: deltaX, y: deltaY };
    if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (dragRef.current !== gesture) return;
      setNodes(reflowDrag(gesture.original, gesture.moving, gesture.lastDelta.x, gesture.lastDelta.y));
    });
  };
  const finishNodeDrag = (event: PointerLike) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    dragRef.current = null;
    setDraggingNode(null);
    setDragViewport(null);
    if (!gesture.moved) return;
    const wantedX = (event.clientX - gesture.startX) / gesture.scale;
    const wantedY = (event.clientY - gesture.startY) / gesture.scale;
    const next = reflowDrag(gesture.original, gesture.moving, wantedX, wantedY);
    commitNodes(next);
    showNotice('주변 가지와 함께 위치를 정리했어요');
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };
  const cancelNodeDrag = (event: PointerLike) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    dragRef.current = null; setNodes(gesture.original); setDraggingNode(null); setDragViewport(null); setViewAnchor(null);
  };
  const startCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current || (event.target as HTMLElement).closest('.map-node,button,input,textarea,.zoom-controls,.minimap')) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: canvasOffset.x, originY: canvasOffset.y, moved: false };
    setIsPanning(true);
  };
  const moveCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      if (!pan.moved && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) < 3) return;
      pan.moved = true;
      setCanvasOffset({ x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y });
    }
  };
  const finishCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    if (panRef.current.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    panRef.current = null;
    setIsPanning(false);
  };
  useEffect(() => {
    window.addEventListener('pointermove', moveNodeDrag);
    window.addEventListener('pointerup', finishNodeDrag);
    window.addEventListener('pointercancel', cancelNodeDrag);
    return () => {
      window.removeEventListener('pointermove', moveNodeDrag);
      window.removeEventListener('pointerup', finishNodeDrag);
      window.removeEventListener('pointercancel', cancelNodeDrag);
    };
  });
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200); };
  const exportMap = () => {
    const data = new Blob([JSON.stringify({ title: editingTitle ? titleDraft.trim() || title : title, nodes: isEditing ? nodes.map(node => node.id === selected ? { ...node, text: editingText.trim() || '새 아이디어' } : node) : nodes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title || 'mindmap'}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (!ready || workspaceOpen || authOpen || shortcutsOpen || dragRef.current) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); newMap(); return; }
      if (typing || editingTitle || target.closest('button,select,.sidebar')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); document.querySelector<HTMLInputElement>('.search-box input')?.focus(); return; }
      if (!user) { if (['Enter', 'Tab', 'F2', 'Delete', 'Backspace'].includes(event.key)) { if (event.key !== 'Tab') { event.preventDefault(); setAuthOpen(true); } } return; }
      if (event.key === 'Enter') { event.preventDefault(); addNode(selected); }
      if (event.key === 'Tab') { event.preventDefault(); const parent = nodes.find(node => node.id === selected)?.parent ?? 'center'; addNode(parent); }
      if (event.key === 'F2') { event.preventDefault(); setEditingText(nodes.find(node => node.id === selected)?.text ?? ''); setIsEditing(true); }
      if (event.key === 'Delete' || event.key === 'Backspace') removeNode();
      if (event.key === 'Escape') { setIsEditing(false); setSearch(''); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  });
  const highlighted = search.trim().toLowerCase();
  const visible = (node: NodeItem) => !highlighted || node.text.toLowerCase().includes(highlighted);
  const childList = (parentId: string) => nodes.filter(node => node.parent === parentId);
  const mapBounds = nodes.reduce((bounds, node) => {
    const size = nodeSize(node);
    return { minX: Math.min(bounds.minX, node.x), maxX: Math.max(bounds.maxX, node.x + size.width), minY: Math.min(bounds.minY, node.y), maxY: Math.max(bounds.maxY, node.y + size.height) };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const mapWidth = Math.max(1, mapBounds.maxX - mapBounds.minX);
  const mapHeight = Math.max(1, mapBounds.maxY - mapBounds.minY);
  const fitScale = Math.min(1, Math.max(0.05, (canvasSize.width - 80) / mapWidth), Math.max(0.05, (canvasSize.height - 64) / mapHeight));
  const viewScale = dragViewport?.scale ?? (viewAnchor?.scale ?? fitScale) * zoom / 100;
  const contentCenterX = dragViewport?.centerX ?? viewAnchor?.centerX ?? (mapBounds.minX + mapBounds.maxX) / 2;
  const contentCenterY = dragViewport?.centerY ?? viewAnchor?.centerY ?? (mapBounds.minY + mapBounds.maxY) / 2;
  const contentOffsetX = (550 - contentCenterX) * viewScale;
  const contentOffsetY = (310 - contentCenterY) * viewScale;

  const [animatedNodes, setAnimatedNodes] = useState(nodes);
  const visualNodesRef = useRef(nodes);
  const animatingRef = useRef(false);
  const movingVisualRef = useRef(new Set<string>());
  const animationTargetRef = useRef(nodes);
  animationTargetRef.current = nodes;
  if (!animatingRef.current && !draggingNode) visualNodesRef.current = nodes;
  if (dragRef.current) movingVisualRef.current = dragRef.current.moving;
  useEffect(() => {
    if (draggingNode) animatingRef.current = true;
    const nodes = animationTargetRef.current;
    if (!animatingRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      visualNodesRef.current = nodes; setAnimatedNodes(nodes); animatingRef.current = false;
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const alpha = 1 - Math.exp(-Math.min(64, now - previous) / 55);
      previous = now;
      const current = new Map(visualNodesRef.current.map(node => [node.id, node]));
      let unsettled = false;
      const next = animationTargetRef.current.map(target => {
        const from = current.get(target.id);
        if (!from || movingVisualRef.current.has(target.id)) return target;
        if (Math.hypot(target.x - from.x, target.y - from.y) < 0.25) return target;
        unsettled = true;
        return { ...target, x: from.x + (target.x - from.x) * alpha, y: from.y + (target.y - from.y) * alpha };
      });
      visualNodesRef.current = next; setAnimatedNodes(next);
      if (unsettled || draggingNode) frame = requestAnimationFrame(tick);
      else if (!draggingNode) animatingRef.current = false;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggingNode]);
  useEffect(() => () => { if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current); }, []);
  const visualById = new Map(animatedNodes.map(node => [node.id, node]));
  const displayNodes = animatingRef.current || draggingNode
    ? nodes.map(node => movingVisualRef.current.has(node.id) ? node : visualById.get(node.id) ?? node)
    : nodes;
  const wheelCamera = useRef({ zoom, offset: canvasOffset, scale: viewScale / (zoom / 100), centerX: contentCenterX, centerY: contentCenterY });
  wheelCamera.current = { zoom, offset: canvasOffset, scale: viewScale / (zoom / 100), centerX: contentCenterX, centerY: contentCenterY };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('textarea,input,button,.zoom-controls,.minimap')) return;
      event.preventDefault();
      if (dragRef.current || panRef.current) return;
      const camera = wheelCamera.current;
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const result = zoomAtPoint(camera.zoom, camera.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * (event.ctrlKey ? 0.01 : 0.002)), camera.offset, {
        x: event.clientX - rect.left - canvas.clientLeft - canvas.clientWidth / 2,
        y: event.clientY - rect.top - canvas.clientTop - canvas.clientHeight / 2,
      });
      wheelCamera.current = { ...camera, zoom: result.zoom, offset: result.offset };
      setViewAnchor({ scale: camera.scale, centerX: camera.centerX, centerY: camera.centerY });
      setZoom(result.zoom);
      setCanvasOffset(result.offset);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const currentWorkspace = library?.workspaces.find(w => w.id === library.activeWorkspaceId);
  const workspaceMaps = library?.maps.filter(map => map.workspaceId === library.activeWorkspaceId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];

  return <main className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${!user ? 'preview-mode' : ''}`}>
    <aside className="sidebar" inert={!ready || signingOut || workspaceOpen || authOpen || shortcutsOpen} aria-label="워크스페이스와 마인드맵">
      <div className="brand"><div className="brand-symbol" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path d="M7 5v9h18M7 14v9h18M16 14v9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7" cy="5" r="3" fill="currentColor"/><circle cx="25" cy="14" r="3" fill="currentColor"/><circle cx="25" cy="23" r="3" fill="currentColor"/></svg></div><div className="brand-copy"><span className="brand-name">LULPUP</span><span className="brand-caption">THOUGHTS, LAYER BY LAYER</span></div><button className="collapse" aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => { localStorage.setItem('lulpup-sidebar-collapsed', String(!value)); return !value; })}>{sidebarCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
      <button className="workspace-info" onClick={() => { if (!requireAccount()) return; setWorkspaceOpen(true); setWorkspaceError(''); }} title="워크스페이스 전환 또는 생성" aria-label="워크스페이스 전환 또는 생성"><div className="workspace-avatar"><PanelsTopLeft size={18}/></div><div className="workspace-copy"><strong>{currentWorkspace?.name ?? '워크스페이스'}</strong><small>워크스페이스 전환</small></div><ChevronDown size={15}/></button>
      <button className="new-map" onClick={newMap} title="새 마인드맵" aria-label="새 마인드맵"><Plus size={18}/><span className="new-map-label">새 마인드맵</span><span className="shortcut">⌘ N</span></button>
      <div className="sidebar-scroll"><div className="sidebar-section recent-section"><div className="section-label">마인드맵 <span className="count">{workspaceMaps.length}</span></div>
        {workspaceMaps.map(map => <button key={map.id} className={`recent-item ${map.id === mapId ? 'current' : ''}`} aria-current={map.id === mapId ? 'page' : undefined} title={map.title} onClick={() => openMap(map.id)}><span className="map-icon"><GitBranch size={16}/></span><span className="map-label">{map.id === mapId ? title : map.title}</span></button>)}
      </div></div>
      <div className="sidebar-bottom"><button className="profile" title={user ? '로그아웃' : '로그인'} onClick={async () => { if (user && supabase) await logout(); else setAuthOpen(true); }}><div className="profile-avatar"><UserRound size={18}/></div><div><strong>{user?.email ?? '로그인'}</strong><small>{user ? '계정 동기화 · 로그아웃' : '현재는 브라우저에 저장'}</small></div>{user ? <LogOut size={16}/> : <LogIn size={16}/>}</button></div>
    </aside>

    {!sidebarCollapsed && <button className="sidebar-backdrop" aria-label="사이드바 닫기" onClick={() => setSidebarCollapsed(true)}/>}
    <section className="main-area" inert={!ready || signingOut || workspaceOpen || authOpen || shortcutsOpen}>
      <header className="topbar"><div className="breadcrumbs"><span>{currentWorkspace?.name}</span><ChevronRight size={14}/><strong>{title}</strong></div><div className="top-actions"><span className={`saved ${cloudStatus}`}><Cloud size={15}/>{!user ? '로그인 후 저장 · 현재 미리보기' : cloudStatus === 'saved' ? '클라우드에 저장됨' : cloudStatus === 'saving' || cloudStatus === 'loading' ? '저장 중…' : cloudStatus === 'error' ? '저장 오류' : supabase ? '로그인하면 클라우드 저장' : '이 브라우저에 저장됨'}</span></div></header>
      <div className="editor-heading"><div><div className="eyebrow"><span className="live-dot"/>{user ? '자동 저장 사용 중' : '미리보기 · 로그인 후 편집'}</div>{editingTitle ? <form className="title-editor" onSubmit={event => { event.preventDefault(); finishRename(); }}><input aria-label="마인드맵 제목" className="title-input" autoFocus maxLength={100} value={titleDraft} onChange={event => setTitleDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditingTitle(false); }}/><button type="submit" aria-label="제목 저장" title="제목 저장"><Check size={18}/></button><button type="button" onClick={() => setEditingTitle(false)} aria-label="제목 수정 취소" title="취소"><X size={18}/></button></form> : <h1><span className="map-title-text">{title}</span> <button className="edit-title-button" aria-label="제목 수정" title="제목 수정" onClick={beginRename}><Pencil size={15}/></button></h1>}<p>한 줄의 생각이 다음 생각으로. 아이디어를 차곡차곡 연결하세요.</p></div><div className="heading-actions"><button className="outline-button" onClick={exportMap}><Download size={15}/>JSON 내보내기</button></div></div>
      <div className="canvas-frame">
        <div className="toolbar"><div className="tool-group"><IconButton title="실행 취소 (⌘Z)" onClick={undo}><Undo2 size={16}/></IconButton><IconButton title="다시 실행 (⇧⌘Z)" onClick={redo}><Redo2 size={16}/></IconButton></div><div className="tool-group"><IconButton title="하위 노드 추가 (Enter)" onClick={() => addNode()}><Plus size={16}/></IconButton><IconButton title="메모 노드 추가" onClick={() => addNode(selected, 'memo')}><StickyNote size={16}/></IconButton><IconButton title="노드 삭제 (Delete)" onClick={removeNode}><Trash2 size={16}/></IconButton><span className="divider"/><IconButton title="가지 자동 정렬" onClick={() => { commitNodes(layoutMindmap(nodes)); setViewAnchor(null); setCanvasOffset({ x: 0, y: 0 }); setZoom(100); showNotice('가지별로 겹치지 않게 정렬했어요'); }}><GitBranch size={16}/></IconButton></div><div className="tool-group search-box"><Search size={15}/><input aria-label="맵에서 검색" placeholder="맵에서 검색" value={search} onChange={event => setSearch(event.target.value)}/><kbd>⌘ F</kbd></div></div>
        <div ref={canvasRef} className={`canvas hand-mode ${isPanning ? 'panning' : ''}`} onPointerDown={startCanvasPan} onPointerMove={moveCanvasPan} onPointerUp={finishCanvasPan} onPointerCancel={finishCanvasPan} onLostPointerCapture={finishCanvasPan} onClick={event => { if (suppressClickRef.current) return; if (!(event.target as HTMLElement).closest('.map-node,.zoom-controls,.minimap')) { setSelected(nodes.find(node => !node.parent)?.id ?? 'center'); setIsEditing(false); } }}>
          <div className="canvas-grid"/>
          <div className="map-stage" style={{ transform: `translate(${canvasOffset.x + contentOffsetX}px, ${canvasOffset.y + contentOffsetY}px) scale(${viewScale})` }}>
            <svg className="connectors" width="1100" height="620" viewBox="0 0 1100 620" aria-hidden="true">
              {displayNodes.filter(n => n.parent).map(node => {
                const parent = displayNodes.find(n => n.id === node.parent); if (!parent) return null;
                const parentWidth = !parent.parent ? 128 : parent.kind === 'plain' ? 118 : 146;
                const nodeWidth = node.kind === 'plain' ? 118 : 146;
                const parentCenter = parent.x + parentWidth / 2; const nodeCenter = node.x + nodeWidth / 2;
                const forward = nodeCenter > parentCenter;
                const startX = forward ? parent.x + parentWidth : parent.x;
                const endX = forward ? node.x : node.x + nodeWidth;
                const parentHeight = !parent.parent ? 60 : parent.kind === 'plain' ? 32 : 46;
                const nodeHeight = node.kind === 'plain' ? 32 : 46;
                const siblings = displayNodes.filter(candidate => candidate.parent === parent.id).sort((a, b) => a.y - b.y);
                const siblingIndex = siblings.findIndex(candidate => candidate.id === node.id);
                if (Math.abs(parent.x - node.x) < 2) {
                  const centerX = parent.x + parentWidth / 2;
                  const downward = node.y >= parent.y;
                  const fromY = downward ? parent.y + parentHeight : parent.y;
                  const toY = downward ? node.y : node.y + nodeHeight;
                  const bend = Math.min(80, Math.max(12, Math.abs(toY - fromY) * .4));
                  return <path key={node.id} d={downward ? `M ${centerX} ${fromY} C ${centerX} ${fromY + bend}, ${centerX} ${toY - bend}, ${centerX} ${toY}` : `M ${centerX} ${fromY} C ${centerX} ${fromY - bend}, ${centerX} ${toY + bend}, ${centerX} ${toY}`} stroke={palettes[colors.indexOf(node.color)]} strokeWidth={2} fill="none" opacity={highlighted && !visible(node) ? .12 : .72}/>;
                }
                const parentPortY = parent.y + parentHeight * (siblingIndex + 1) / (siblings.length + 1);
                const nodePortY = node.y + nodeHeight / 2;
                const direction = forward ? 1 : -1;
                const curve = Math.min(100, Math.abs(endX - startX) * .42);
                const control1X = startX + direction * curve;
                const control2X = endX - direction * curve;
                return <path key={node.id} d={`M ${startX} ${parentPortY} C ${control1X} ${parentPortY}, ${control2X} ${nodePortY}, ${endX} ${nodePortY}`} stroke={palettes[colors.indexOf(node.color)]} strokeWidth={!parent.parent ? 3 : 2} fill="none" opacity={highlighted && !visible(node) ? .12 : 0.72}/>;
              })}
            </svg>
            {displayNodes.map(node => <div key={node.id} role="button" tabIndex={0} aria-pressed={selected === node.id} aria-label={node.text.replace('\n', ' ')} onPointerDown={event => startNodeDrag(event, node)} onClick={event => { event.stopPropagation(); if (suppressClickRef.current) { event.preventDefault(); return; } setSelected(node.id); }} onDoubleClick={event => { event.stopPropagation(); if (!requireAccount()) return; setSelected(node.id); setEditingText(node.text); setIsEditing(true); }} className={`map-node ${!node.parent ? 'center-node' : node.kind === 'plain' ? 'plain-node' : node.kind === 'memo' ? 'memo-node' : 'branch-node'} node-${node.color} ${selected === node.id ? 'selected' : ''} ${draggingNode === node.id ? 'dragging' : ''} ${highlighted && !visible(node) ? 'dimmed' : ''}`} style={{ left: node.x, top: node.y, '--node-color': palettes[colors.indexOf(node.color)] } as React.CSSProperties}>
              {isEditing && selected === node.id ? <textarea autoFocus value={editingText} onChange={event => setEditingText(event.target.value)} onBlur={() => finishNodeEdit(node.id)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }} /> : <span>{node.text.split('\n').map((line, index) => <span key={index}>{line}{index < node.text.split('\n').length - 1 && <br/>}</span>)}</span>}
              {!node.parent && <span className="center-sparkle"><Sparkles size={15}/></span>}
              {childList(node.id).length > 0 && node.parent && <span className="node-count">{childList(node.id).length}</span>}
              {selected === node.id && node.parent && <button className="quick-add" title="하위 아이디어 추가" onClick={event => { event.stopPropagation(); addNode(node.id); }}><Plus size={12}/></button>}
            </div>)}
          </div>
          <div className="canvas-hint"><Move size={12}/><span>빈 공간 드래그 이동 · 휠 / 핀치 확대·축소</span><span className="hint-dot">·</span><span>Enter 하위 노드</span><span className="hint-dot">·</span><span>더블클릭 편집</span></div>
          <div className="zoom-controls"><button title="축소" aria-label="축소" onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - 10))}><ZoomOut size={15}/></button><span>{Math.round(zoom)}%</span><button title="확대" aria-label="확대" onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + 10))}><ZoomIn size={15}/></button><span className="zoom-divider"/><button title="화면에 맞추기" onClick={() => { setZoom(100); setCanvasOffset({ x: 0, y: 0 }); setViewAnchor(null); }}><Grid2X2 size={15}/></button></div>

        </div>
        <footer className="canvas-footer"><div><span className="footer-status"><Check size={13}/>{storageError ? '저장 오류' : user ? '자동 저장' : '미리보기'}</span><span className="footer-sep"/><button onClick={() => showNotice(user ? '로그인한 계정에서만 접근할 수 있는 맵입니다.' : '이 브라우저에 저장되는 맵입니다.')}><LockKeyhole size={13}/> 비공개 맵 <ChevronDown size={12}/></button></div><div><span>노드 {nodes.length}개</span><span className="footer-sep"/><span>Enter 하위 추가 · Tab 형제 추가 · Delete 삭제</span><button aria-label="편집 단축키" title="편집 단축키" onClick={() => setShortcutsOpen(true)}><Keyboard size={14}/></button></div></footer>
      </div>
      <div className="bottom-tip"><span className="brand-footer-mark">L / P</span><span className="brand-motto">Line Upon Line <span>·</span> Precept Upon Precept</span><button onClick={() => setShortcutsOpen(true)}>단축키 보기 <ArrowRight size={13}/></button></div>
    </section>
    {(!ready || storageError) && <div className="storage-banner" role="alert">{storageError || '워크스페이스를 불러오는 중…'}</div>}
    {cloudStatus === 'error' && <div className="storage-banner" role="alert">클라우드에 연결하지 못했습니다. 변경 사항은 이 브라우저에 저장됩니다. Supabase 설정과 최신 DB 스키마를 확인해 주세요.</div>}
    {workspaceOpen && <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) setWorkspaceOpen(false); }}><section className="auth-modal workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-heading" onKeyDown={event => { if (event.key === 'Escape') setWorkspaceOpen(false); }}><button className="modal-close" aria-label="닫기" onClick={() => setWorkspaceOpen(false)}><X size={19}/></button><div className="auth-logo"><PanelsTopLeft size={21}/></div><h2 id="workspace-heading">워크스페이스</h2><p>프로젝트별로 마인드맵을 모아 관리하세요.</p><div className="workspace-list">{library?.workspaces.map(workspace => <button key={workspace.id} className={workspace.id === library.activeWorkspaceId ? 'selected-workspace' : ''} onClick={() => { if (!requireAccount()) return; activateLibrary(selectWorkspace(snapshotLibrary(), workspace.id)); setWorkspaceOpen(false); }}><PanelsTopLeft size={17}/><span>{workspace.name}<small>마인드맵 {library.maps.filter(map => map.workspaceId === workspace.id).length}개</small></span>{workspace.id === library.activeWorkspaceId && <Check size={17}/>}</button>)}</div><form onSubmit={event => { event.preventDefault(); if (!requireAccount() || !library) return; try { activateLibrary(addWorkspace(snapshotLibrary(), workspaceName)); setWorkspaceName(''); setWorkspaceError(''); setWorkspaceOpen(false); } catch (error) { setWorkspaceError((error as Error).message); } }}><label htmlFor="workspace-name">새 워크스페이스 이름</label><input id="workspace-name" autoFocus required maxLength={60} placeholder="예: 개인 프로젝트, 업무 아이디어" value={workspaceName} onChange={event => { setWorkspaceName(event.target.value); setWorkspaceError(''); }}/>{workspaceError && <small role="alert" className="field-error">{workspaceError}</small>}<button type="submit" className="auth-submit"><Plus size={16}/>워크스페이스 만들기</button></form></section></div>}
    {shortcutsOpen && <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-heading" onKeyDown={event => { if (event.key === 'Escape') setShortcutsOpen(false); }}><button autoFocus className="modal-close" aria-label="닫기" onClick={() => setShortcutsOpen(false)}><X size={19}/></button><div className="auth-logo"><Keyboard size={20}/></div><h2 id="shortcuts-heading">편집 단축키</h2><dl className="shortcut-list">{[['Enter','하위 노드 추가'],['Tab','형제 노드 추가'],['F2 / 더블클릭','노드 글 수정'],['Delete','선택한 가지 삭제'],['⌘ / Ctrl + Z','실행 취소'],['⌘ / Ctrl + Shift + Z','다시 실행'],['⌘ / Ctrl + N','새 마인드맵'],['마우스 휠','확대 · 축소'],['빈 공간 드래그','화면 이동']].map(([key, value]) => <div key={key}><dt>{value}</dt><dd>{key}</dd></div>)}</dl></section></div>}
    {authOpen && <AuthDialog client={supabase} onClose={() => setAuthOpen(false)}/>}
    {notice && <div className="toast"><Check size={15}/>{notice}</div>}
  </main>;
}


