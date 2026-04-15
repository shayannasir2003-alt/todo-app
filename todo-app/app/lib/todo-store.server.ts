export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  order: number;
  dueDate: string | null;
  createdAt: string;
}

declare global {
  var __todoStore: Map<string, Todo> | undefined;
}

if (!globalThis.__todoStore) {
  globalThis.__todoStore = new Map<string, Todo>();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const toDateStr = (d: Date) => d.toISOString().split("T")[0];

  const samples = [
    { text: "Build a beautiful todo app with Remix", completed: true, dueDate: null },
    { text: "Add drag-and-drop reordering", completed: false, dueDate: toDateStr(new Date(today.getTime() - dayMs)) },
    { text: "Implement dark mode toggle", completed: false, dueDate: toDateStr(today) },
    { text: "Set up keyboard shortcuts", completed: false, dueDate: toDateStr(new Date(today.getTime() + dayMs)) },
    { text: "Make it fully responsive", completed: false, dueDate: toDateStr(new Date(today.getTime() + 5 * dayMs)) },
  ];

  samples.forEach((s, i) => {
    const id = crypto.randomUUID();
    globalThis.__todoStore!.set(id, {
      id,
      text: s.text,
      completed: s.completed,
      order: i,
      dueDate: s.dueDate,
      createdAt: new Date(
        Date.now() - (samples.length - i) * 60000
      ).toISOString(),
    });
  });
}

const store = globalThis.__todoStore;

export function getAllTodos(): Todo[] {
  return Array.from(store.values()).sort((a, b) => a.order - b.order);
}

export function addTodo(text: string, dueDate: string | null = null): Todo {
  const id = crypto.randomUUID();
  const todos = getAllTodos();
  const maxOrder =
    todos.length > 0 ? Math.max(...todos.map((t) => t.order)) + 1 : 0;
  const todo: Todo = {
    id,
    text,
    completed: false,
    order: maxOrder,
    dueDate,
    createdAt: new Date().toISOString(),
  };
  store.set(id, todo);
  return todo;
}

export function updateTodo(
  id: string,
  updates: Partial<Pick<Todo, "text" | "completed" | "dueDate">>
): Todo | null {
  const todo = store.get(id);
  if (!todo) return null;
  const updated = { ...todo, ...updates };
  store.set(id, updated);
  return updated;
}

export function deleteTodo(id: string): Todo | null {
  const todo = store.get(id) ?? null;
  store.delete(id);
  return todo;
}

export function restoreTodo(todo: Todo): void {
  store.set(todo.id, todo);
}

export function reorderTodos(orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const todo = store.get(id);
    if (todo) {
      store.set(id, { ...todo, order: index });
    }
  });
}

export function clearCompleted(): number {
  let count = 0;
  for (const [id, todo] of store) {
    if (todo.completed) {
      store.delete(id);
      count++;
    }
  }
  return count;
}
