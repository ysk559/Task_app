/**
 * 重要度の自動エスカレーションと「やるべき順番」提案のロジック。
 *
 * このアプリの中核となる工夫の部分。ユーザーが設定する重要度 (base_priority) は
 * 静的だが、期限が近づくにつれて「実効重要度 (effective_priority)」を動的に引き上げる。
 * これにより「登録したときは低優先度でも締切直前には自動で赤くなる」を実現する。
 */

export const PRIORITY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
} as const;

export type TaskRow = {
  id: number;
  title: string;
  description: string;
  category_id: number | null;
  base_priority: number;
  due_date: Date | null;
  estimated_minutes: number | null;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date;
};

/**
 * 期限までの残り時間に応じて重要度を底上げする。
 * ユーザー設定値より下がることはなく、上がる方向にのみ働く。
 */
export function effectivePriority(basePriority: number, dueDate: Date | null, now: Date = new Date()): number {
  if (!dueDate) return basePriority;

  const hoursLeft = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  let floor: number = PRIORITY.LOW;
  if (hoursLeft <= 0) {
    floor = PRIORITY.URGENT; // 期限切れ
  } else if (hoursLeft <= 24) {
    floor = PRIORITY.URGENT; // 24時間以内
  } else if (hoursLeft <= 72) {
    floor = PRIORITY.HIGH; // 3日以内
  } else if (hoursLeft <= 24 * 7) {
    floor = PRIORITY.MEDIUM; // 1週間以内
  }

  return Math.max(basePriority, floor);
}

/**
 * 「今どれからやるべきか」のスコア。高いほど先にやるべき。
 *   - 実効重要度が高いほど加点
 *   - 期限が近いほど加点（超過はさらに加点）
 *   - 所要時間が短いものは僅かに加点（サクッと片付けられるものを先に）
 */
export function urgencyScore(task: TaskRow, now: Date = new Date()): number {
  const eff = effectivePriority(task.base_priority, task.due_date, now);
  let score = eff * 100;

  if (task.due_date) {
    const hoursLeft = (task.due_date.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft <= 0) {
      score += 400 + Math.min(-hoursLeft, 240); // 超過分をさらに加点（上限あり）
    } else {
      // 残り時間が少ないほど 0→200 に近づく
      score += Math.max(0, 200 - hoursLeft);
    }
  }

  if (task.estimated_minutes && task.estimated_minutes > 0) {
    // 短いタスクを気持ち先に（最大 +30）
    score += Math.max(0, 30 - task.estimated_minutes / 4);
  }

  return Math.round(score);
}

/** API レスポンス用に実効重要度とスコアを付与した形へ変換する。 */
export function decorate(task: TaskRow, now: Date = new Date()) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    categoryId: task.category_id,
    basePriority: task.base_priority,
    effectivePriority: effectivePriority(task.base_priority, task.due_date, now),
    dueDate: task.due_date ? task.due_date.toISOString() : null,
    estimatedMinutes: task.estimated_minutes,
    completed: task.completed,
    completedAt: task.completed_at ? task.completed_at.toISOString() : null,
    createdAt: task.created_at.toISOString(),
    urgencyScore: urgencyScore(task, now),
  };
}
