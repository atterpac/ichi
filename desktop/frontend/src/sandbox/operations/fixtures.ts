export type Conflict = {
  path: string;
  kind: "text" | "deleted";
  note: string;
  base: string;
  target: string;
  incoming: string;
  combined: string;
  result: string;
  choice: string;
  staged: boolean;
};
export function conflictFixtures(): Conflict[] {
  return [
    {
      path: "src/auth/session.ts",
      kind: "text",
      note: "Both commits changed session persistence.",
      base: 'export function saveSession(session: Session) {\n  localStorage.setItem("session", JSON.stringify(session));\n}',
      target:
        'export function saveSession(session: Session) {\n  if (session.expired) return;\n  localStorage.setItem("session", JSON.stringify(session));\n}',
      incoming:
        'export function saveSession(session: Session) {\n  const safeSession = omitSecrets(session);\n  localStorage.setItem("session", JSON.stringify(safeSession));\n}',
      combined:
        'export function saveSession(session: Session) {\n  if (session.expired) return;\n  const safeSession = omitSecrets(session);\n  localStorage.setItem("session", JSON.stringify(safeSession));\n}',
      result: "",
      choice: "",
      staged: false,
    },
    {
      path: "src/auth/session.test.ts",
      kind: "text",
      note: "Both branches added a test at the same location.",
      base: 'describe("session persistence", () => {\n  // Session tests\n});',
      target:
        'it("does not persist expired sessions", () => {\n  saveSession(expiredSession);\n  expect(localStorage.getItem("session")).toBeNull();\n});',
      incoming:
        'it("removes secrets before persisting", () => {\n  saveSession(sessionWithToken);\n  expect(localStorage.getItem("session")).not.toContain("token");\n});',
      combined:
        'it("does not persist expired sessions", () => {\n  saveSession(expiredSession);\n  expect(localStorage.getItem("session")).toBeNull();\n});\n\nit("removes secrets before persisting", () => {\n  saveSession(sessionWithToken);\n  expect(localStorage.getItem("session")).not.toContain("token");\n});',
      result: "",
      choice: "",
      staged: false,
    },
    {
      path: "src/auth/legacy-storage.ts",
      kind: "deleted",
      note: "Deleted on main, modified by the commit being replayed.",
      base: 'export const storageKey = "session-v1";',
      target: "",
      incoming: 'export const storageKey = "session-v2";',
      combined: "",
      result: "",
      choice: "",
      staged: false,
    },
  ];
}
export type PlanCommit = {
  id: string;
  title: string;
  action: "pick" | "reword" | "fixup" | "drop";
  files: string[];
};
export function planFixtures(): PlanCommit[] {
  return [
    {
      id: "a83e2c1",
      title: "Introduce session storage adapter",
      action: "pick",
      files: ["src/auth/storage.ts"],
    },
    {
      id: "6b9d104",
      title: "Add session expiry checks",
      action: "pick",
      files: ["src/auth/session.ts"],
    },
    {
      id: "c72f8a6",
      title: "Persist sessions without secrets",
      action: "pick",
      files: ["src/auth/session.ts", "src/auth/session.test.ts", "src/auth/legacy-storage.ts"],
    },
    {
      id: "e01b324",
      title: "Fix session test fixture",
      action: "fixup",
      files: ["src/auth/session.test.ts"],
    },
    { id: "f52cd09", title: "Document session lifecycle", action: "pick", files: ["docs/auth.md"] },
  ];
}
export const recoveryEvents = [
  {
    id: "before",
    time: "14:32",
    label: "Before rebase",
    hash: "f52cd09",
    note: "Recovery point created before rewriting feature/session.",
    title: "Document session lifecycle",
    count: 5,
    files: ["docs/auth.md", "src/auth/session.ts", "src/auth/storage.ts"],
  },
  {
    id: "commit",
    time: "14:18",
    label: "Commit",
    hash: "c72f8a6",
    note: "Session persistence before the test fixture and docs changes.",
    title: "Persist sessions without secrets",
    count: 3,
    files: ["src/auth/session.ts", "src/auth/session.test.ts"],
  },
  {
    id: "checkout",
    time: "13:54",
    label: "Branch created",
    hash: "28d430a",
    note: "feature/session started from main.",
    title: "Update auth dependencies",
    count: 0,
    files: ["package.json", "pnpm-lock.yaml"],
  },
];
