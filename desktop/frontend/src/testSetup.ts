import { afterAll } from 'vitest'

// Stop browser-owned timers (including Wails' drag initialization poll) before
// Vitest removes the window globals at the end of each test file.
afterAll(() => window.close())
