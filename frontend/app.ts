/**
 * フロントエンド（プレゼンテーション層）。
 * バックエンドの REST API を叩いて画面を組み立てる。バンドラを使わず、
 * TypeScript を 1 ファイルとしてコンパイルし <script> で読み込む素朴な構成。
 */

interface Category {
  id: number;
  name: string;
  color: string;
}

interface Task {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  basePriority: number;
  effectivePriority: number;
  dueDate: string | null;
  estimatedMinutes: number | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  urgencyScore: number;
}

type Filter = 'active' | 'all' | 'completed';

const PRIORITY_LABEL: Record<number, string> = { 1: '低', 2: '中', 3: '高', 4: '最優先' };

let categories: Category[] = [];
let tasks: Task[] = [];
let currentFilter: Filter = 'active';
let editingId: number | null = null;

// ---- DOM ヘルパ ----
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`element #${id} not found`);
  return el;
}
function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---- API 呼び出し ----
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(msg.error || 'リクエストに失敗しました');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function loadAll(): Promise<void> {
  [categories, tasks] = await Promise.all([api<Category[]>('/api/categories'), api<Task[]>('/api/tasks')]);
  renderCategoryOptions();
  render();
}

// ---- 描画 ----
function renderCategoryOptions(): void {
  const select = $('category') as HTMLSelectElement;
  select.innerHTML =
    '<option value="">（なし）</option>' +
    categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function formatDue(iso: string): { text: string; overdue: boolean } {
  const d = new Date(iso);
  const now = new Date();
  const overdue = d.getTime() < now.getTime();
  const diffH = Math.abs(d.getTime() - now.getTime()) / 36e5;
  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
  let rel = '';
  if (overdue) rel = '（期限切れ）';
  else if (diffH < 24) rel = `（あと${Math.ceil(diffH)}時間）`;
  else rel = `（あと${Math.ceil(diffH / 24)}日）`;
  return { text: `📅 ${dateStr} ${rel}`, overdue };
}

function taskCard(task: Task): string {
  const cat = categories.find((c) => c.id === task.categoryId);
  const eff = task.effectivePriority;
  const escalated = eff > task.basePriority;

  const badges: string[] = [];
  if (cat) {
    badges.push(`<span class="badge cat" style="background:${esc(cat.color)}">${esc(cat.name)}</span>`);
  }
  badges.push(`<span class="badge prio p${eff}">重要度: ${PRIORITY_LABEL[eff]}</span>`);
  if (escalated) {
    badges.push(`<span class="badge escalated">⬆ 締切接近で自動格上げ</span>`);
  }
  if (task.dueDate) {
    const { text, overdue } = formatDue(task.dueDate);
    badges.push(`<span class="badge due ${overdue ? 'overdue' : ''}">${text}</span>`);
  }
  if (task.estimatedMinutes != null) {
    badges.push(`<span class="badge est">⏱ ${task.estimatedMinutes}分</span>`);
  }

  return `
    <div class="task p${eff} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <div class="check ${task.completed ? 'on' : ''}" data-action="toggle" data-id="${task.id}" title="完了/未完了">
        ${task.completed ? '✓' : ''}
      </div>
      <div class="task-body">
        <div class="task-title">${esc(task.title)}</div>
        ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
        <div class="task-meta">${badges.join('')}</div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" data-id="${task.id}" title="編集">✏️</button>
        <button class="icon-btn" data-action="delete" data-id="${task.id}" title="削除">🗑</button>
      </div>
    </div>`;
}

function render(): void {
  const list = $('task-list');
  const empty = $('empty');

  let visible = tasks;
  if (currentFilter === 'active') visible = tasks.filter((t) => !t.completed);
  else if (currentFilter === 'completed') visible = tasks.filter((t) => t.completed);

  if (visible.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.innerHTML = visible.map(taskCard).join('');
  }

  const activeCount = tasks.filter((t) => !t.completed).length;
  ($('order-hint') as HTMLElement).textContent =
    currentFilter === 'active' && activeCount > 1 ? '上から順にやるのがおすすめ ⤵' : '';
}

// ---- フォーム ----
function resetForm(): void {
  editingId = null;
  ($('task-form') as HTMLFormElement).reset();
  ($('task-id') as HTMLInputElement).value = '';
  ($('form-title') as HTMLElement).textContent = '新しいタスク';
  ($('submit-btn') as HTMLElement).textContent = '追加する';
  ($('cancel-btn') as HTMLElement).hidden = true;
}

function fillForm(task: Task): void {
  editingId = task.id;
  ($('title') as HTMLInputElement).value = task.title;
  ($('description') as HTMLTextAreaElement).value = task.description;
  ($('category') as HTMLSelectElement).value = task.categoryId ? String(task.categoryId) : '';
  ($('priority') as HTMLSelectElement).value = String(task.basePriority);
  ($('estimate') as HTMLInputElement).value = task.estimatedMinutes != null ? String(task.estimatedMinutes) : '';
  if (task.dueDate) {
    const d = new Date(task.dueDate);
    // datetime-local はローカル時刻・秒なしの形式を要求する
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    ($('due') as HTMLInputElement).value = local;
  } else {
    ($('due') as HTMLInputElement).value = '';
  }
  ($('form-title') as HTMLElement).textContent = 'タスクを編集';
  ($('submit-btn') as HTMLElement).textContent = '更新する';
  ($('cancel-btn') as HTMLElement).hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collectForm() {
  const dueRaw = ($('due') as HTMLInputElement).value;
  const estRaw = ($('estimate') as HTMLInputElement).value;
  const catRaw = ($('category') as HTMLSelectElement).value;
  return {
    title: ($('title') as HTMLInputElement).value.trim(),
    description: ($('description') as HTMLTextAreaElement).value.trim(),
    categoryId: catRaw ? Number(catRaw) : null,
    basePriority: Number(($('priority') as HTMLSelectElement).value),
    dueDate: dueRaw ? new Date(dueRaw).toISOString() : null,
    estimatedMinutes: estRaw ? Number(estRaw) : null,
  };
}

// ---- イベント ----
function bindEvents(): void {
  ($('task-form') as HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = collectForm();
    if (!payload.title) return;
    try {
      if (editingId != null) {
        await api(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      }
      resetForm();
      await loadAll();
    } catch (err) {
      alert((err as Error).message);
    }
  });

  $('cancel-btn').addEventListener('click', resetForm);

  // タスクリスト（イベント委譲）
  $('task-list').addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      if (action === 'toggle') {
        await api(`/api/tasks/${id}/complete`, {
          method: 'PATCH',
          body: JSON.stringify({ completed: !task.completed }),
        });
        await loadAll();
      } else if (action === 'edit') {
        fillForm(task);
      } else if (action === 'delete') {
        if (confirm(`「${task.title}」を削除しますか？`)) {
          await api(`/api/tasks/${id}`, { method: 'DELETE' });
          await loadAll();
        }
      }
    } catch (err) {
      alert((err as Error).message);
    }
  });

  // フィルタ
  $('filters').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
    if (!btn) return;
    currentFilter = btn.dataset.filter as Filter;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    render();
  });

  // カテゴリ追加
  $('add-cat-btn').addEventListener('click', async () => {
    const name = ($('new-cat-name') as HTMLInputElement).value.trim();
    const color = ($('new-cat-color') as HTMLInputElement).value;
    if (!name) return;
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, color }) });
      ($('new-cat-name') as HTMLInputElement).value = '';
      await loadAll();
    } catch (err) {
      alert((err as Error).message);
    }
  });
}

// ---- 起動 ----
bindEvents();
loadAll().catch((err) => {
  console.error(err);
  ($('task-list') as HTMLElement).innerHTML =
    '<p class="empty">サーバーに接続できませんでした。しばらくして再読み込みしてください。</p>';
});

// 1分ごとに再取得して、締切接近による自動格上げを画面へ反映する
setInterval(() => {
  loadAll().catch(() => {
    /* オフライン等は次回に任せる */
  });
}, 60_000);
