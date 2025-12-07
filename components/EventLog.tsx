import React, { useEffect, useRef } from 'react';

interface EventLogProps {
  logs: string[];
}

export const EventLog: React.FC<EventLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-32 w-full bg-black border-t border-b border-zinc-800 p-4 font-mono text-xs overflow-y-auto relative">
      <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-black to-transparent pointer-events-none"></div>
      <div className="space-y-2">
        {logs.map((log, i) => (
          <div key={i} className="text-zinc-400 border-l-2 border-zinc-800 pl-2">
            <span className="text-zinc-600 mr-2">[{i.toString().padStart(3, '0')}]</span>
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};