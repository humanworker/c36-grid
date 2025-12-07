import React from 'react';
import { CoinData, CoinMetal, CoinCondition, CoinSize, CoinBorder, CoinPattern } from '../types';

interface ControlsProps {
  data: CoinData;
  onChange: (newData: CoinData) => void;
}

export const Controls: React.FC<ControlsProps> = ({ data, onChange }) => {
  
  const handleChange = (key: keyof CoinData, value: any) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-6 text-sm font-mono">
      
      {/* Metal */}
      <div className="space-y-2">
        <label className="block text-gray-400 uppercase tracking-wider text-xs">Metal Material</label>
        <div className="grid grid-cols-3 gap-2">
            {Object.values(CoinMetal).map((m) => (
                <button
                    key={m}
                    onClick={() => handleChange('metal', m)}
                    className={`px-3 py-2 border text-xs transition-colors ${
                        data.metal === m 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-gray-500 border-gray-800 hover:border-gray-500'
                    }`}
                >
                    {m}
                </button>
            ))}
        </div>
      </div>

      <div className="border-t border-gray-800 my-4"></div>

      {/* Age */}
      <div className="space-y-2">
        <label className="block text-gray-400 uppercase tracking-wider text-xs">
            Year Minted: <span className="text-white">{data.year > 0 ? `${data.year} AD` : `${Math.abs(data.year)} BC`}</span>
        </label>
        <input 
            type="range" 
            min="-500" 
            max="2025" 
            value={data.year} 
            onChange={(e) => handleChange('year', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
        />
        <div className="flex justify-between text-xs text-gray-600">
            <span>500 BC</span>
            <span>2025 AD</span>
        </div>
      </div>

      <div className="border-t border-gray-800 my-4"></div>

      {/* Condition & Pattern */}
      <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-gray-400 uppercase tracking-wider text-xs">Condition</label>
            <select 
                value={data.condition}
                onChange={(e) => handleChange('condition', e.target.value)}
                className="w-full bg-black border border-gray-800 text-white p-2 focus:outline-none focus:border-white"
            >
                {Object.values(CoinCondition).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-gray-400 uppercase tracking-wider text-xs">Pattern</label>
            <select 
                value={data.pattern}
                onChange={(e) => handleChange('pattern', e.target.value)}
                className="w-full bg-black border border-gray-800 text-white p-2 focus:outline-none focus:border-white"
            >
                {Object.values(CoinPattern).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
      </div>

      {/* Size & Border */}
      <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-gray-400 uppercase tracking-wider text-xs">Size</label>
            <select 
                value={data.size}
                onChange={(e) => handleChange('size', e.target.value)}
                className="w-full bg-black border border-gray-800 text-white p-2 focus:outline-none focus:border-white"
            >
                {Object.values(CoinSize).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-gray-400 uppercase tracking-wider text-xs">Border</label>
            <select 
                value={data.border}
                onChange={(e) => handleChange('border', e.target.value)}
                className="w-full bg-black border border-gray-800 text-white p-2 focus:outline-none focus:border-white"
            >
                {Object.values(CoinBorder).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
      </div>

    </div>
  );
};
