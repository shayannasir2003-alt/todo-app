import { useState, useEffect, useRef } from "react";
import { useFetcher, useOutletContext } from "react-router";
import type { Route } from "./+types/home";
import {
  getAllTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
  clearCompleted,
  type Todo,
} from "~/lib/todo-store.server";
import { getTheme, themeCookie, type Theme } from "~/lib/theme.server";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Todo App — Remix" },
    {
      name: "description",
      content: "A beautiful, feature-rich todo app built with Remix",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const todos = getAllTodos();
  const theme = await getTheme(request);
  return { todos, theme };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "add": {
      const text = (formData.get("text") as string)?.trim();
      if (!text) return { ok: false, message: "Task text cannot be empty" };
      addTodo(text);
      return { ok: true, message: "Task added", intent };
    }
    case "toggle": {
      const id = formData.get("id") as string;
      const completed = formData.get("completed") === "true";
      updateTodo(id, { completed });
      return {
        ok: true,
        message: completed ? "Task completed!" : "Task marked active",
        intent,
      };
    }
    case "edit": {
      const id = formData.get("id") as string;
      const text = (formData.get("text") as string)?.trim();
      if (!text) return { ok: false, message: "Task text cannot be empty" };
      updateTodo(id, { text });
      return { ok: true, message: "Task updated", intent };
    }
    case "delete": {
      const id = formData.get("id") as string;
      deleteTodo(id);
      return { ok: true, message: "Task deleted", intent };
    }
    case "reorder": {
      const orderedIds = JSON.parse(formData.get("orderedIds") as string);
      reorderTodos(orderedIds);
      return { ok: true, intent };
    }
    case "clearCompleted": {
      const count = clearCompleted();
      return {
        ok: true,
        message: `Cleared ${count} completed task${count !== 1 ? "s" : ""}`,
        intent,
      };
    }
    case "setTheme": {
      const newTheme = formData.get("theme") as Theme;
      return Response.json(
        { ok: true, intent },
        { headers: { "Set-Cookie": await themeCookie.serialize(newTheme) } }
      );
    }
    default:
      return { ok: false, message: "Unknown action" };
  }
}

type Filter = "all" | "active" | "completed";

export default function Home({ loaderData }: Route.ComponentProps) {
  const { todos: serverTodos, theme } = loaderData;
  const [todos, setTodos] = useState(serverTodos);
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFetcher = useFetcher();
  const reorderFetcher = useFetcher();
  const themeFetcher = useFetcher();
  const clearFetcher = useFetcher();

  useEffect(() => {
    setTodos(serverTodos);
  }, [serverTodos]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        setEditingId(null);
        setShowShortcuts(false);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          inputRef.current?.focus();
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((s) => !s);
          break;
        case "1":
          setFilter("all");
          break;
        case "2":
          setFilter("active");
          break;
        case "3":
          setFilter("completed");
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredTodos = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active.id !== over.id) {
      setTodos((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        const reordered = arrayMove(prev, oldIndex, newIndex);

        reorderFetcher.submit(
          {
            intent: "reorder",
            orderedIds: JSON.stringify(reordered.map((t) => t.id)),
          },
          { method: "post" }
        );

        return reordered;
      });
    }
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = new FormData(form).get("text") as string;
    if (!text?.trim()) return;

    addFetcher.submit(
      { intent: "add", text: text.trim() },
      { method: "post" }
    );
    form.reset();
    toast.success("Task added");
  }

  function handleToggleTheme() {
    const newTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    themeFetcher.submit(
      { intent: "setTheme", theme: newTheme },
      { method: "post" }
    );
  }

  function handleClearCompleted() {
    if (completedCount === 0) return;
    clearFetcher.submit({ intent: "clearCompleted" }, { method: "post" });
    toast.success(
      `Cleared ${completedCount} completed task${completedCount !== 1 ? "s" : ""}`
    );
  }

  const draggedTodo = activeDragId
    ? todos.find((t) => t.id === activeDragId)
    : null;

  return (
    <div className="min-h-screen pb-16 selection:bg-indigo-200 dark:selection:bg-indigo-500/30">
      {/* Header */}
      <header className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-16 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Todo List
              </span>
            </h1>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              {activeCount} task{activeCount !== 1 ? "s" : ""} remaining
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-800 transition-all"
              title="Keyboard shortcuts (?)"
              aria-label="Show keyboard shortcuts"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10" />
              </svg>
            </button>
            <button
              onClick={handleToggleTheme}
              className="p-2.5 rounded-xl text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-white/80 dark:hover:bg-gray-800 transition-all"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="mb-6 flex gap-2 bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/60 dark:border-gray-700/50 p-2"
        >
          <input
            ref={inputRef}
            type="text"
            name="text"
            placeholder="What needs to be done?"
            className="flex-1 bg-transparent px-4 py-3 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl font-medium text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.97] flex items-center gap-1.5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5v14" />
            </svg>
            <span className="hidden sm:inline">Add Task</span>
          </button>
        </form>

        {/* Filters */}
        <div className="flex gap-1 mb-4 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-xl p-1 border border-gray-200/40 dark:border-gray-700/30">
          {(["all", "active", "completed"] as const).map((f) => {
            const count =
              f === "all"
                ? todos.length
                : f === "active"
                  ? activeCount
                  : completedCount;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  filter === f
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] px-1 py-0.5 text-[10px] rounded-full font-semibold ${
                    filter === f
                      ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Todo List */}
        <div className="bg-white dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50 dark:shadow-black/20 border border-gray-200/60 dark:border-gray-700/50 overflow-hidden">
          {filteredTodos.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) =>
                setActiveDragId(active.id as string)
              }
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDragId(null)}
            >
              <SortableContext
                items={filteredTodos.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul role="list" className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {filteredTodos.map((todo) => (
                    <SortableTodoItem
                      key={todo.id}
                      todo={todo}
                      isEditing={editingId === todo.id}
                      onStartEdit={() => setEditingId(todo.id)}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </ul>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {draggedTodo ? <TodoItemOverlay todo={draggedTodo} /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="px-6 py-16 text-center animate-fade-in">
              <div className="text-4xl mb-3">
                {filter === "all"
                  ? "📝"
                  : filter === "active"
                    ? "🎉"
                    : "📋"}
              </div>
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                {filter === "all"
                  ? "No tasks yet. Add one above!"
                  : filter === "active"
                    ? "All tasks completed! Great job!"
                    : "No completed tasks yet."}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {todos.length > 0 && (
          <div className="flex items-center justify-between mt-4 px-2 text-xs text-gray-400 dark:text-gray-500">
            <span>
              {activeCount} item{activeCount !== 1 ? "s" : ""} left
            </span>
            {completedCount > 0 && (
              <button
                onClick={handleClearCompleted}
                className="hover:text-red-500 dark:hover:text-red-400 transition-colors underline-offset-2 hover:underline"
              >
                Clear completed ({completedCount})
              </button>
            )}
          </div>
        )}
      </main>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

/* ─── Sortable Todo Item ─── */

function SortableTodoItem({
  todo,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  todo: Todo;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fetcher = useFetcher();
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editText, setEditText] = useState(todo.text);

  useEffect(() => {
    if (isEditing) {
      setEditText(todo.text);
      requestAnimationFrame(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      });
    }
  }, [isEditing, todo.text]);

  function handleToggle() {
    fetcher.submit(
      { intent: "toggle", id: todo.id, completed: String(!todo.completed) },
      { method: "post" }
    );
    toast.success(!todo.completed ? "Task completed!" : "Task marked active");
  }

  function handleDelete() {
    fetcher.submit({ intent: "delete", id: todo.id }, { method: "post" });
    toast.success("Task deleted");
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editText.trim() || editText.trim() === todo.text) {
      onCancelEdit();
      return;
    }
    fetcher.submit(
      { intent: "edit", id: todo.id, text: editText.trim() },
      { method: "post" }
    );
    toast.success("Task updated");
    onCancelEdit();
  }

  const isOptimisticallyDeleted = fetcher.formData?.get("intent") === "delete";
  if (isOptimisticallyDeleted) return null;

  const isOptimisticallyToggled = fetcher.formData?.get("intent") === "toggle";
  const displayCompleted = isOptimisticallyToggled
    ? fetcher.formData?.get("completed") === "true"
    : todo.completed;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 sm:px-4 py-3 group transition-colors ${
        isDragging ? "opacity-40 bg-indigo-50/50 dark:bg-indigo-900/10" : ""
      } ${displayCompleted ? "bg-gray-50/50 dark:bg-gray-900/20" : "hover:bg-gray-50/80 dark:hover:bg-gray-700/20"}`}
    >
      {/* Drag handle */}
      <button
        className="touch-none cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 flex-shrink-0"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </button>

      {/* Checkbox */}
      <button
        onClick={handleToggle}
        className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-full"
        aria-label={displayCompleted ? "Mark as active" : "Mark as completed"}
      >
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
            displayCompleted
              ? "bg-emerald-500 border-emerald-500 animate-check-pop"
              : "border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500"
          }`}
        >
          {displayCompleted && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </button>

      {/* Text / Edit */}
      {isEditing ? (
        <form onSubmit={handleEditSubmit} className="flex-1 flex gap-2">
          <input
            ref={editInputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancelEdit()}
            className="flex-1 bg-white dark:bg-gray-700 border border-indigo-300 dark:border-indigo-500/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-shadow"
          />
          <button
            type="submit"
            className="p-1.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
            aria-label="Save"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
            aria-label="Cancel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
      ) : (
        <span
          onDoubleClick={onStartEdit}
          className={`flex-1 text-sm cursor-default select-none transition-all duration-200 leading-relaxed ${
            displayCompleted
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-700 dark:text-gray-200"
          }`}
        >
          {todo.text}
        </span>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={onStartEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"
            aria-label="Edit task"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            aria-label="Delete task"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

/* ─── Drag Overlay ─── */

function TodoItemOverlay({ todo }: { todo: Todo }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl shadow-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 ring-2 ring-indigo-500/20">
      <div className="text-gray-300 dark:text-gray-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          todo.completed
            ? "bg-emerald-500 border-emerald-500"
            : "border-gray-300 dark:border-gray-600"
        }`}
      >
        {todo.completed && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        className={`text-sm font-medium ${
          todo.completed
            ? "line-through text-gray-400"
            : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {todo.text}
      </span>
    </div>
  );
}

/* ─── Keyboard Shortcuts Modal ─── */

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: "N", description: "Focus new task input" },
    { key: "1", description: "Show all tasks" },
    { key: "2", description: "Show active tasks" },
    { key: "3", description: "Show completed tasks" },
    { key: "?", description: "Toggle this help" },
    { key: "Esc", description: "Cancel editing / close" },
    { key: "Dbl-click", description: "Edit a task inline" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-1">
          {shortcuts.map(({ key, description }) => (
            <div
              key={key}
              className="flex items-center justify-between py-2 px-1"
            >
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {description}
              </span>
              <kbd className="ml-4 px-2.5 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
