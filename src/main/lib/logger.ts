import { writeFileSync, appendFileSync, existsSync } from 'fs'
import { join } from 'path'

interface LogEntry {
  timestamp: string
  level: 'log' | 'error' | 'warn' | 'info'
  message: string
  data?: any
}

class Logger {
  private logFile: string
  private logs: LogEntry[] = []

  constructor() {
    // Always log to project root/logs folder
    const projectRoot = process.cwd()
    const logsDir = join(projectRoot, 'logs')
    this.logFile = join(logsDir, `nauticplayer-${Date.now()}.json`)
    
    // Initialize log file
    this.writeLog({ timestamp: new Date().toISOString(), level: 'info', message: 'Logger initialized', data: { logFile: this.logFile } })
  }

  private writeLog(entry: LogEntry) {
    this.logs.push(entry)
    try {
      // Write entire log array to file
      writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to write log:', err)
    }
  }

  log(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'log',
      message,
      data
    }
    console.log(`[${entry.timestamp}] ${message}`, data || '')
    this.writeLog(entry)
  }

  error(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      data
    }
    console.error(`[${entry.timestamp}] ${message}`, data || '')
    this.writeLog(entry)
  }

  warn(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      data
    }
    console.warn(`[${entry.timestamp}] ${message}`, data || '')
    this.writeLog(entry)
  }

  info(message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      data
    }
    console.info(`[${entry.timestamp}] ${message}`, data || '')
    this.writeLog(entry)
  }
}

export const logger = new Logger()
