export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  order: number;
  createdAt: string;
}

declare global {
  var __todoStore: Map<string, Todo> | undefined;
}

if (!globalThis.__todoStore) {
  globalThis.__todoStore = new Map<string, Todo>();
  const samples = [
    { text: "Build a beautiful todo app with Remix", completed: true },
    { text: "Add drag-and-drop reordering", completed: false },
    { text: "Implement dark mode toggle", completed: false },
    { text: "Set up keyboard shortcuts", completed: false },
    { text: "Make it fully responsive", completed: false },
  ];
  samples.forEach((s, i) => {
    const id = crypto.randomUUID();
    globalThis.__todoStore!.set(id, {
      id,
      text: s.text,
      completed: s.completed,
      order: i,
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

export function addTodo(text: string): Todo {
  const id = crypto.randomUUID();
  const todos = getAllTodos();
  const maxOrder =
    todos.length > 0 ? Math.max(...todos.map((t) => t.order)) + 1 : 0;
  const todo: Todo = {
    id,
    text,
    completed: false,
    order: maxOrder,
    createdAt: new Date().toISOString(),
  };
  store.set(id, todo);
  return todo;
}

export function updateTodo(
  id: string,
  updates: Partial<Pick<Todo, "text" | "completed">>
): Todo | null {
  const todo = store.get(id);
  if (!todo) return null;
  const updated = { ...todo, ...updates };
  store.set(id, updated);
  return updated;
}

export function deleteTodo(id: string): boolean {
  return store.delete(id);
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
