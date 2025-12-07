import React from 'react';

interface EventLogProps {
  logs: string[];
}

export const EventLog: React.FC<EventLogProps> = ({ logs }) => {
  const lastLog = logs[logs.length - 1];
  const count = logs.length > 0 ? logs.length - 1 : 0;

  return (
    <div className="w-full bg-black pb-2 px-4 pt-2 font-mono text-xs">
        {lastLog ? (
            <div className="text-zinc-400 truncate animate-in fade-in slide-in-from-bottom-1 duration-300">
                <span className="text-zinc-600 mr-2">[{count.toString().padStart(3, '0')}]</span>
                {lastLog}
            </div>
        ) : (
            <div className="text-zinc-800">System Ready...</div>
        )}
    </div>
  );
};