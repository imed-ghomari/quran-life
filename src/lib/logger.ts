export type LogLevel = 'info' | 'success' | 'error' | 'warning';

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  level: LogLevel;
}

type LogListener = (logs: LogEntry[]) => void;

class Logger {
  private logs: LogEntry[] = [];
  private listeners: LogListener[] = [];
  private maxLogs = 100;

  addLog(message: string, level: LogLevel = 'info') {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      message,
      level,
    };

    this.logs = [newLog, ...this.logs].slice(0, this.maxLogs);
    this.notifyListeners();
    
    // Also log to console for development
    const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[${newLog.timestamp.toLocaleTimeString()}] ${message}`);
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    listener(this.logs);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.logs));
  }

  clear() {
    this.logs = [];
    this.notifyListeners();
  }
}

export const appLogger = new Logger();
