import { useEffect, useMemo, useState, type FormEvent, type ChangeEvent } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { v4 as uuidv4 } from "uuid";

// Single-file React Task App
// - Saves data to localStorage
// - Tasks with recurrence (none, daily, weekly, monthly)
// - History log of completions with timestamp
// - Statistics: completed per day (last 14 days), completion count per task
// - Simple, clean UI built with Tailwind classes (assumes Tailwind is present)

// How to use this file:
// 1) Create a React app (Create React App, Vite or Next.js)
// 2) Install dependencies: `npm i uuid recharts`
// 3) Ensure Tailwind CSS is configured (or remove Tailwind classes / replace with your CSS)
// 4) Drop this file as `App.jsx` and import in index.jsx / pages/_app.jsx

const STORAGE_KEY = "task_app_v1";

// Define types for our data structures
type Recurrence = "none" | "daily" | "weekly" | "monthly";

interface Task {
  id: string;
  title: string;
  notes: string;
  createdAt: string; // ISO string
  due: string | null; // ISO string
  recurrence: Recurrence;
  completed: boolean;
  nextDue: string | null; // ISO string
  archived: boolean;
}

interface HistoryItem {
  id: string;
  taskId: string;
  title: string;
  at: string; // ISO string
}

interface AppState {
  tasks: Task[];
  history: HistoryItem[];
  settings: {
    timezone: string;
  };
}

function nowISO() {
  return new Date().toISOString();
}

function plusInterval(dateISO: string, recurrence: Recurrence): string {
  const d = new Date(dateISO);
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse storage", e);
    return null;
  }
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function App() {
  const [state, setState] = useState<AppState>(() => {
    const s = loadState();
    if (s) return s;
    return {
      tasks: [],
      history: [],
      settings: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
  });

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Task operations
  function addTask({
    title,
    notes,
    due,
    recurrence,
  }: { title: string; notes: string; due: string | null; recurrence: Recurrence }) {
    const task: Task = {
      id: uuidv4(),
      title: title || "Untitled",
      notes: notes || "",
      createdAt: nowISO(),
      due: due || null,
      recurrence: recurrence || "none", // none | daily | weekly | monthly
      completed: false,
      nextDue: due || null,
      archived: false,
    };
    setState((s: AppState) => ({ ...s, tasks: [task, ...s.tasks] }));
  }

  function editTask(id: string, patch: Partial<Task>) {
    setState((s: AppState) => ({
      ...s,
      tasks: s.tasks.map((t: Task) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function toggleComplete(id: string) {
    setState((s: AppState) => {
      const tasks = s.tasks.map((t: Task) => (t.id === id ? { ...t, completed: !t.completed } : t));
      return { ...s, tasks };
    });
  }

  function completeNow(id: string) {
    // Mark completion, push to history with timestamp and compute nextDue for recurring
    setState((s: AppState) => {
      const t = s.tasks.find((x: Task) => x.id === id);
      if (!t) return s;
      const timestamp = nowISO();
      const historyItem: HistoryItem = {
        id: uuidv4(),
        taskId: t.id,
        title: t.title,
        at: timestamp,
      };
      let tasks = s.tasks.map((x: Task) => (x.id === id ? { ...x, completed: true } : x));

      if (t.recurrence && t.recurrence !== "none") {
        const next = plusInterval(t.nextDue || timestamp, t.recurrence);
        tasks = tasks.map((x: Task) => (x.id === id ? { ...x, nextDue: next, completed: false } : x));
      }

      return { ...s, tasks, history: [historyItem, ...s.history] };
    });
  }

  function deleteTask(id: string) {
    setState((s: AppState) => ({ ...s, tasks: s.tasks.filter((t: Task) => t.id !== id) }));
  }

  function archiveTask(id: string) {
    editTask(id, { archived: true });
  }

  // Analytics helpers
  const lastNDays = (n: number) => {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  };

  const completedByDay = useMemo(() => {
    const days = lastNDays(14);
    const map = days.map((d) => ({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(),
      count: 0,
    }));
    for (const h of state.history) {
      const key = h.at.slice(0, 10);
      const idx = map.findIndex((m) => m.date === key);
      if (idx >= 0) map[idx].count++;
    }
    return map;
  }, [state.history]);

  const completionsPerTask = useMemo(() => {
    const counts: { [key: string]: number } = {};
    for (const h of state.history) {
      counts[h.taskId] = (counts[h.taskId] || 0) + 1;
    }
    return state.tasks.map((t: Task) => ({ title: t.title, id: t.id, count: counts[t.id] || 0 }));
  }, [state.history, state.tasks]);

  // Simple search & filter
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | completed | archived

  const visibleTasks: Task[] = state.tasks
    .filter((t: Task) => {
      if (filter === "active") return !t.completed && !t.archived;
      if (filter === "completed") return t.completed && !t.archived;
      if (filter === "archived") return t.archived;
      return !t.archived;
    })
    .filter((t: Task) => t.title.toLowerCase().includes(query.toLowerCase()));

  // Small helper to format ISO nicely
  function fmt(iso: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">টাস্ক অ্যাপ — ইতিহাস, পরিসংখ্যান ও পুনরাবৃত্তি</h1>
          <div className="text-sm text-slate-600">Timezone: {state.settings.timezone}</div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="col-span-1 lg:col-span-2">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <TaskForm onAdd={addTask} />

              <div className="mt-4 flex gap-2 items-center">
                <input
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="Search tasks..."
                  value={query}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                />
                <select value={filter} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)} className="border rounded px-2 py-1">
                  <option value="all">সকল</option>
                  <option value="active">চলমান</option>
                  <option value="completed">সম্পন্ন</option>
                  <option value="archived">আর্কাইভ</option>
                </select>
              </div>

              <div className="mt-4">
                {visibleTasks.length === 0 ? (
                  <div className="text-slate-500 py-8 text-center">কোনো টাস্ক নেই — নতুন টাস্ক যোগ করুন</div>
                ) : (
                  <ul className="space-y-2">
                    {visibleTasks.map((t: Task) => (
                      <li key={t.id} className="bg-slate-50 border rounded p-3 flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t.id)} />
                            <div>
                              <div className={`font-medium ${t.completed ? "line-through text-slate-400" : ""}`}>{t.title}</div>
                              <div className="text-xs text-slate-500">Next: {fmt(t.nextDue)} • Created: {fmt(t.createdAt)}</div>
                            </div>
                          </div>
                          {t.notes && <div className="mt-2 text-sm text-slate-700">{t.notes}</div>}
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <button className="px-2 py-1 bg-green-600 text-white rounded text-sm" onClick={() => completeNow(t.id)}>
                            সম্পন্ন এখন
                          </button>
                          <div className="flex gap-1">
                            <button className="px-2 py-1 border rounded text-sm" onClick={() => archiveTask(t.id)}>
                              আর্কাইভ
                            </button>
                            <button className="px-2 py-1 border rounded text-sm" onClick={() => deleteTask(t.id)}>
                              মুছুন
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 bg-white p-4 rounded-lg shadow-sm">
              <h2 className="font-semibold mb-2">ইতিহাস (সংক্ষিপ্ত)</h2>
              <div className="text-sm text-slate-600 mb-3">কোন কাজ কখন সম্পন্ন করা হয়েছে — সর্বশেষ ২০টি</div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {state.history.slice(0, 20).map((h: HistoryItem) => (
                  <div key={h.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <div className="font-medium">{h.title}</div>
                      <div className="text-xs text-slate-500">{new Date(h.at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-slate-400">id: {h.taskId.slice(0, 6)}</div>
                  </div>
                ))}
                {state.history.length === 0 && <div className="text-slate-500">কোনো ইতিহাস নেই</div>}
              </div>
            </div>
          </section>

          <aside>
            <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
              <h3 className="font-semibold mb-2">পরিসংখ্যান — শেষ 14 দিন</h3>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={completedByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm">
              <h3 className="font-semibold mb-2">কম্প্লিশন বাই টাস্ক</h3>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={completionsPerTask.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="title" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm mt-4">
              <h4 className="font-semibold">মোট টাস্ক</h4>
              <div className="text-2xl font-bold">{state.tasks.length}</div>
              <div className="mt-2 text-sm text-slate-500">সফলভাবে সম্পন্ন: {state.history.length}</div>
            </div>
          </aside>
        </main>

        <footer className="mt-6 text-sm text-slate-500">এই অ্যাপটি লোকালস্টোরেজ ব্যবহার করে — ডাটা ব্রাউজার লক ক্লিয়ার করলে মুছে যেতে পারে।</footer>
      </div>
    </div>
  );
}

function TaskForm({ onAdd }: { onAdd: (task: { title: string; notes: string; due: string | null; recurrence: Recurrence }) => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onAdd({ title, notes, due: due ? new Date(due).toISOString() : null, recurrence: recurrence as Recurrence });
    setTitle("");
    setNotes("");
    setDue("");
    setRecurrence("none");
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
      <div className="col-span-1 md:col-span-2">
        <label className="text-sm block mb-1">নতুন টাস্ক</label>
        <input value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} placeholder="কাজের নাম" className="w-full border rounded px-2 py-1" />
        <textarea value={notes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder="বর্ণনা (ঐচ্ছিক)" className="w-full border rounded px-2 py-1 mt-2" />
      </div>

      <div>
        <label className="text-sm block mb-1">ডিউ ও/র পুনরাবৃত্তি</label>
        <input type="datetime-local" value={due} onChange={(e: ChangeEvent<HTMLInputElement>) => setDue(e.target.value)} className="w-full border rounded px-2 py-1 mb-2" />
        <select value={recurrence} onChange={(e: ChangeEvent<HTMLSelectElement>) => setRecurrence(e.target.value as Recurrence)} className="w-full border rounded px-2 py-1 mb-2">
          <option value="none">কোনো নয়</option>
          <option value="daily">দৈনিক</option>
          <option value="weekly">সাপ্তাহিক</option>
          <option value="monthly">মাসিক</option>
        </select>
        <button type="submit" className="w-full bg-blue-600 text-white px-3 py-1 rounded">যোগ করুন</button>
      </div>
    </form>
  );
}

export default App
