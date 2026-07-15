import { tool } from "@opencode-ai/plugin"
import path from "path"
import { execSync } from "child_process"

const SERVER = "http://127.0.0.1:8921"

function serverGet(ep: string): any {
  const r = execSync(`curl.exe -s --max-time 5 ${SERVER}${ep}`, { timeout: 10000 }).toString()
  return JSON.parse(r.trim())
}

function serverPost(ep: string, data: any): any {
  const r = execSync(`curl.exe -s --max-time 5 -X POST -H "Content-Type: application/json" -d '${JSON.stringify(data)}' ${SERVER}${ep}`, { timeout: 10000 }).toString()
  return JSON.parse(r.trim())
}

const PROJECT_ROOT = "D:\\Tampermonkey"

function runPythonCwd(args: string[]): string {
  const script = path.join(PROJECT_ROOT, "resources", "tools", "send_cmd.py")
  const cmd = `python "${script}" ${args.join(" ")}`
  const r = execSync(cmd, { timeout: 30000 }).toString()
  return r.trim()
}

export const agent_status = tool({
  description: "Check browser agent server status, sessions, and metrics",
  args: {},
  async execute() {
    const [status, metrics] = await Promise.all([
      serverGet("/status"),
      serverGet("/metrics"),
    ])
    const lines = [
      `Server: uptime ${Math.floor(metrics.uptime)}s`,
      `Sessions: ${metrics.sessions_active_60s} active / ${metrics.sessions_total} total`,
      `Queue: ${status.queue_size} pending`,
      `Reports: ${status.reports_count}`,
    ]
    if (metrics.task_active) {
      lines.push(`Task: running`)
    }
    return lines.join("\n")
  },
})

export const agent_sessions = tool({
  description: "List active browser agent sessions with last activity",
  args: {},
  async execute() {
    const data = serverGet("/status")
    const sessionsObj = data.sessions || {}
    const sessions = Object.entries(sessionsObj)
    if (sessions.length === 0) return "No active sessions"
    return sessions.map(([id, s]: [string, any]) =>
      `[${id}] state=${s.state} url=${s.url || "?"}`
    ).join("\n")
  },
})

export const agent_cmd = tool({
  description: "Send a command to a browser session (eval, find, click, type, navigate, ping). Returns the result.",
  args: {
    session: tool.schema.string().describe("Session ID (from agent_sessions or __agent_session)"),
    command: tool.schema.string().describe("Command: eval, find, find_and_click, click, type, navigate, ping, wait, raw"),
    args: tool.schema.string().optional().describe("Command arguments (JSON string or plain text)"),
    timeout: tool.schema.number().optional().describe("Seconds to wait for response (default: 8)"),
  },
  async execute(input) {
    const cmdArgs = [input.session, input.command]
    if (input.args) cmdArgs.push(input.args)
    if (input.timeout) cmdArgs.push("--timeout", String(input.timeout))
    return runPythonCwd(cmdArgs)
  },
})

export const agent_eval = tool({
  description: "Evaluate JavaScript in the browser page and return the result",
  args: {
    session: tool.schema.string().describe("Session ID"),
    code: tool.schema.string().describe("JavaScript code to evaluate"),
    timeout: tool.schema.number().optional().describe("Seconds to wait (default: 8)"),
  },
  async execute(input) {
    const cmdArgs = [input.session, "eval", input.code]
    if (input.timeout) cmdArgs.push("--timeout", String(input.timeout))
    return runPythonCwd(cmdArgs)
  },
})

export const agent_navigate = tool({
  description: "Navigate the browser to a URL",
  args: {
    session: tool.schema.string().describe("Session ID"),
    url: tool.schema.string().describe("URL to navigate to"),
  },
  async execute(input) {
    return runPythonCwd([input.session, "navigate", input.url])
  },
})

export const agent_find = tool({
  description: "Find an element on the page by CSS selector, optionally filtering by text content",
  args: {
    session: tool.schema.string().describe("Session ID"),
    selector: tool.schema.string().describe("CSS selector"),
    text: tool.schema.string().optional().describe("Filter by text content"),
  },
  async execute(input) {
    const cmdArgs = [input.session, "find", input.selector]
    if (input.text) cmdArgs.push(input.text)
    return runPythonCwd(cmdArgs)
  },
})

export const agent_click = tool({
  description: "Click an element by index (use agent_find first to discover elements)",
  args: {
    session: tool.schema.string().describe("Session ID"),
    index: tool.schema.number().describe("Element index from agent_find"),
  },
  async execute(input) {
    return runPythonCwd([input.session, "click", String(input.index)])
  },
})

export const agent_type = tool({
  description: "Type text into an element by index (use agent_find first to discover elements)",
  args: {
    session: tool.schema.string().describe("Session ID"),
    index: tool.schema.number().describe("Element index from agent_find"),
    text: tool.schema.string().describe("Text to type"),
  },
  async execute(input) {
    return runPythonCwd([input.session, "type", String(input.index), input.text])
  },
})

export const agent_ping = tool({
  description: "Ping the browser session to check if it's alive and responsive",
  args: {
    session: tool.schema.string().describe("Session ID"),
  },
  async execute(input) {
    return runPythonCwd([input.session, "ping"])
  },
})

export const agent_queue = tool({
  description: "Check the command queue and pending reports",
  args: {},
  async execute() {
    const [queue, reports] = await Promise.all([
      serverGet("/queue"),
      serverGet("/reports?limit=10"),
    ])
    const lines: string[] = []
    if (queue.queue_size > 0) {
      lines.push(`Queue: ${queue.queue_size} pending`)
    } else {
      lines.push("Queue: empty")
    }
    if (reports.length > 0) {
      lines.push(`Recent reports (${reports.length}):`)
      for (const r of reports.slice(0, 5)) {
        const extra = typeof r.extra === "object" ? JSON.stringify(r.extra) : r.extra
        lines.push(`  [${r.session}] ${r.cmd} → ${extra?.substring(0, 80)}`)
      }
    }
    return lines.join("\n")
  },
})
