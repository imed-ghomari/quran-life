"use client";

import React, { useEffect, useState, useRef } from 'react';
import { appLogger, LogEntry } from '@/lib/logger';
import { Terminal, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export const LogOverlay: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = appLogger.subscribe((newLogs) => {
      setLogs([...newLogs].reverse()); // Show newest at bottom for auto-scroll
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 z-[9999] font-mono text-[10px] sm:text-xs pointer-events-none">
      <div className="flex flex-col max-w-[90vw] sm:max-w-md pointer-events-auto">
        {/* Header/Toggle */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-white/10 cursor-pointer
            ${isOpen ? 'bg-zinc-900 shadow-xl' : 'bg-zinc-900/80 backdrop-blur-md rounded-b-lg'}
            transition-all duration-200 hover:bg-zinc-800
          `}
        >
          <Terminal size={14} className="text-zinc-400" />
          <span className="text-zinc-200 font-medium">App Logs</span>
          <div className="flex-1" />
          {isOpen ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronUp size={14} className="text-zinc-400" />}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsVisible(false);
            }}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={12} className="text-zinc-500" />
          </button>
        </div>

        {/* Log Content */}
        {isOpen && (
          <div className="bg-zinc-900 border-x border-b border-white/10 rounded-b-lg shadow-2xl flex flex-col max-h-[40vh] sm:max-h-[60vh]">
            <div 
              ref={scrollRef}
              className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
            >
              {logs.length === 0 ? (
                <div className="text-zinc-600 py-4 text-center italic">No logs yet...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2 leading-tight">
                    <span className="text-zinc-600 shrink-0">
                      [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                    </span>
                    <span className={`
                      break-words
                      ${log.level === 'error' ? 'text-red-400' : 
                        log.level === 'success' ? 'text-emerald-400' : 
                        log.level === 'warning' ? 'text-amber-400' : 
                        'text-zinc-300'}
                    `}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
            
            {/* Footer actions */}
            <div className="p-2 border-t border-white/5 flex justify-end">
              <button 
                onClick={() => appLogger.clear()}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Preview (when closed) */}
        {!isOpen && logs.length > 0 && (
          <div className="mt-1 px-2 py-0.5 bg-black/40 backdrop-blur-sm rounded text-[9px] text-zinc-400 truncate max-w-full">
            Last: {logs[logs.length - 1].message}
          </div>
        )}
      </div>
    </div>
  );
};
