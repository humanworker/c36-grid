import React, { useState, useEffect, useCallback } from 'react';
import { 
    CoinData, CoinMetal, CoinCondition, CoinBorder, CoinSize, CoinPattern, 
    ArtifactType, DesignProject, CoinVisualOverrides, DesignProfile, Range 
} from '../types';
import { CoinRender } from './CoinRender';
import { X, Save, FolderOpen, Plus, Trash2, Copy, RefreshCw, Layers, Palette, Circle, Dices, ChevronRight, ChevronDown } from 'lucide-react';
import { getMetalPalette } from '../utils/gameLogic';

interface DesignWorkbenchProps {
  onClose: () => void;
}

const STORAGE_KEY = 'c36_design_projects_v2';

// --- UTILS ---
const randomInRange = (range: Range, step: number = 0.01) => {
    const val = Math.random() * (range.max - range.min) + range.min;
    // Snap to step
    const stepped = Math.round(val / step) * step;
    return parseFloat(stepped.toFixed(2));
};

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// --- DEFAULT PROFILE ---
const DEFAULT_PROFILE: DesignProfile = {
    allowedMetals: [CoinMetal.Gold, CoinMetal.Silver, CoinMetal.Bronze],
    yearRange: { min: 1200, max: 1800 },
    allowedPatterns: [CoinPattern.Floral, CoinPattern.Geometric, CoinPattern.Imperial],
    
    shapeJitter: { min: 0, max: 2 },
    petalCount: { min: 4, max: 8 },
    petalLength: { min: 0.4, max: 0.8 },
    petalWidth: { min: 0.2, max: 0.5 },
    petalSharpness: { min: 0.5, max: 1.5 },
    centerRadius: { min: 0.15, max: 0.3 },
};

const DEFAULT_PROJECT: DesignProject = {
    id: 'temp',
    name: 'New Generator',
    updatedAt: Date.now(),
    type: ArtifactType.COIN,
    profile: DEFAULT_PROFILE
};

// --- SUB COMPONENTS (Defined outside to prevent focus loss) ---

const RangeControl = ({ label, value, minLimit, maxLimit, step, onChange }: { 
    label: string, value: Range, minLimit: number, maxLimit: number, step: number, onChange: (v: Range) => void 
}) => {
    return (
        <div className="mb-4 bg-zinc-900/50 p-3 rounded border border-zinc-800">
            <div className="flex justify-between items-baseline mb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400">{label}</span>
                <span className="text-[10px] font-mono text-zinc-500">
                    {value.min} - {value.max}
                </span>
            </div>
            <div className="flex gap-2 items-center">
                <input 
                    type="number" step={step} min={minLimit} max={value.max}
                    value={value.min}
                    onChange={(e) => onChange({ ...value, min: parseFloat(e.target.value) })}
                    className="w-16 bg-black border border-zinc-700 text-white text-xs p-1 text-center rounded focus:border-blue-500 outline-none"
                />
                <div className="flex-1 h-1 bg-zinc-800 rounded relative">
                     {/* Visual bar representation could go here */}
                     <div 
                        className="absolute h-full bg-blue-900"
                        style={{ 
                            left: `${((value.min - minLimit) / (maxLimit - minLimit)) * 100}%`,
                            right: `${100 - ((value.max - minLimit) / (maxLimit - minLimit)) * 100}%`
                        }}
                     ></div>
                </div>
                <input 
                    type="number" step={step} min={value.min} max={maxLimit}
                    value={value.max}
                    onChange={(e) => onChange({ ...value, max: parseFloat(e.target.value) })}
                    className="w-16 bg-black border border-zinc-700 text-white text-xs p-1 text-center rounded focus:border-blue-500 outline-none"
                />
            </div>
        </div>
    );
};

const MultiSelect = <T extends string>({ label, options, selected, onChange }: {
    label: string, options: T[], selected: T[], onChange: (vals: T[]) => void
}) => {
    const toggle = (opt: T) => {
        if (selected.includes(opt)) {
            onChange(selected.filter(s => s !== opt));
        } else {
            onChange([...selected, opt]);
        }
    };

    return (
        <div className="mb-4">
             <div className="flex justify-between items-baseline mb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400">{label}</span>
                <span className="text-[10px] text-zinc-600">{selected.length} Selected</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 bg-zinc-900/30 rounded border border-zinc-800 no-scrollbar">
                {options.map(opt => (
                    <button
                        key={opt}
                        onClick={() => toggle(opt)}
                        className={`text-[9px] px-2 py-1 rounded border transition-colors ${
                            selected.includes(opt) 
                            ? 'bg-blue-900 text-blue-100 border-blue-700' 
                            : 'bg-transparent text-zinc-500 border-zinc-800 hover:border-zinc-600'
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
};

const ColorOverride = ({ label, value, onChange, placeholder }: { label: string, value?: string, onChange: (v?: string) => void, placeholder: string }) => {
    return (
        <div className="flex items-center justify-between mb-2 bg-zinc-900/50 p-2 rounded border border-zinc-800">
             <span className="text-[10px] text-zinc-400 uppercase font-bold">{label}</span>
             <div className="flex items-center gap-2">
                 <div className="relative w-6 h-6 rounded overflow-hidden border border-zinc-700">
                     <input 
                        type="color" 
                        value={value || placeholder}
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute -top-1 -left-1 w-8 h-8 p-0 border-0 cursor-pointer"
                     />
                 </div>
                 <button 
                    onClick={() => onChange(value ? undefined : '#ffffff')}
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${value ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'}`}
                 >
                     {value && <X size={10} className="text-white"/>}
                 </button>
             </div>
        </div>
    );
};


// --- MAIN COMPONENT ---

export const DesignWorkbench: React.FC<DesignWorkbenchProps> = ({ onClose }) => {
  // --- STATE ---
  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [activeProject, setActiveProject] = useState<DesignProject>(DEFAULT_PROJECT);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'DNA' | 'VISUALS'>('VISUALS');
  
  // The Simulated Instance
  const [previewData, setPreviewData] = useState<CoinData | null>(null);
  const [previewOverrides, setPreviewOverrides] = useState<CoinVisualOverrides>({});

  // --- STORAGE ---
  useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
          try {
              setProjects(JSON.parse(saved));
          } catch (e) { console.error("Failed to load projects", e); }
      }
  }, []);

  const saveProjects = (list: DesignProject[]) => {
      setProjects(list);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  // --- ACTIONS ---
  
  // Generator Logic: Converts Profile (Constraints) -> Instance (Concrete Data)
  const generatePreview = useCallback((proj: DesignProject) => {
      const p = proj.profile;
      
      const metal = p.allowedMetals.length > 0 ? pickRandom(p.allowedMetals) : CoinMetal.Gold;
      const pattern = p.allowedPatterns.length > 0 ? pickRandom(p.allowedPatterns) : CoinPattern.Floral;
      const year = Math.floor(randomInRange(p.yearRange, 1));
      
      const data: CoinData = {
          metal,
          year,
          condition: CoinCondition.Mint, // Default for preview
          border: CoinBorder.Standard,
          size: CoinSize.Large,
          pattern
      };

      const overrides: CoinVisualOverrides = {
          shapeJitter: randomInRange(p.shapeJitter, 0.1),
          petalCount: Math.round(randomInRange(p.petalCount, 1)),
          petalLength: randomInRange(p.petalLength),
          petalWidth: randomInRange(p.petalWidth),
          petalSharpness: randomInRange(p.petalSharpness),
          centerRadius: randomInRange(p.centerRadius),
          
          customBaseColor: p.customBaseColor,
          customDarkColor: p.customDarkColor,
          customShineColor: p.customShineColor
      };

      setPreviewData(data);
      setPreviewOverrides(overrides);
  }, []);

  // Update Preview when Project changes (debounced slightly via effect or just direct call)
  useEffect(() => {
      generatePreview(activeProject);
  }, [activeProject, generatePreview]);

  const createProject = () => {
      const newProj: DesignProject = {
          ...DEFAULT_PROJECT,
          id: crypto.randomUUID(),
          name: `Generator ${projects.length + 1}`,
          updatedAt: Date.now()
      };
      saveProjects([...projects, newProj]);
      setActiveProject(newProj);
  };

  const saveActiveProject = () => {
      if (activeProject.id === 'temp') {
          createProject();
      } else {
          const updated = projects.map(p => p.id === activeProject.id ? { ...activeProject, updatedAt: Date.now() } : p);
          saveProjects(updated);
      }
  };

  const deleteProject = (id: string) => {
      if (confirm('Delete this generator?')) {
          const filtered = projects.filter(p => p.id !== id);
          saveProjects(filtered);
          if (activeProject.id === id) setActiveProject(DEFAULT_PROJECT);
      }
  };

  const updateProfile = (key: keyof DesignProfile, value: any) => {
      setActiveProject(prev => ({
          ...prev,
          profile: { ...prev.profile, [key]: value }
      }));
  };

  const exportJSON = () => {
      const json = JSON.stringify(activeProject, null, 2);
      navigator.clipboard.writeText(json);
      alert('Generator Config copied to clipboard!');
  };

  return (
    <div className="absolute inset-0 z-[100] bg-black flex font-mono animate-in fade-in duration-300">
      
      {/* 1. LEFT SIDEBAR (Project Manager) */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-zinc-950 border-r border-zinc-800 flex flex-col transition-all duration-300 overflow-hidden`}>
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Generators</span>
              <button onClick={createProject} className="text-white hover:bg-zinc-800 p-1 rounded border border-zinc-800 hover:border-zinc-600"><Plus size={14}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {projects.map(p => (
                  <div key={p.id} className={`group flex items-center justify-between p-3 rounded text-xs cursor-pointer ${activeProject.id === p.id ? 'bg-zinc-800 text-white border border-zinc-700 shadow-lg' : 'text-zinc-500 hover:bg-zinc-900 border border-transparent'}`}>
                      <div className="flex items-center gap-3 truncate" onClick={() => setActiveProject(p)}>
                          <FolderOpen size={14} className={activeProject.id === p.id ? 'text-blue-400' : 'text-zinc-600'} />
                          <span className="truncate font-bold">{p.name}</span>
                      </div>
                      <button onClick={(e) => {e.stopPropagation(); deleteProject(p.id);}} className="opacity-0 group-hover:opacity-100 hover:text-red-500">
                          <Trash2 size={14} />
                      </button>
                  </div>
              ))}
              {projects.length === 0 && <div className="text-zinc-700 text-[10px] text-center mt-8 italic">No saved generators</div>}
          </div>
      </div>

      {/* 2. MAIN AREA (Simulator) */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          
          {/* Header */}
          <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center px-4 shadow-xl z-20">
               <div className="flex items-center gap-4">
                   <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-500 hover:text-white"><Layers size={18}/></button>
                   <div className="h-6 w-px bg-zinc-800 mx-2"></div>
                   <input 
                    value={activeProject.name} 
                    onChange={(e) => setActiveProject(p => ({...p, name: e.target.value}))}
                    className="bg-transparent text-sm font-bold text-white outline-none placeholder-zinc-600 w-48 hover:bg-zinc-800/50 rounded px-2 transition-colors"
                    placeholder="Generator Name"
                   />
                   <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-900/50 font-bold tracking-wider">{activeProject.type}</span>
               </div>
               <div className="flex gap-2">
                   <button onClick={exportJSON} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold uppercase rounded border border-zinc-700 tracking-wider transition-colors">
                       <Copy size={12} /> JSON
                   </button>
                   <button onClick={saveActiveProject} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-blue-900/20 tracking-wider transition-all hover:scale-105">
                       <Save size={12} /> SAVE
                   </button>
                   <button onClick={onClose} className="ml-4 text-zinc-600 hover:text-red-500"><X size={20}/></button>
               </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-dither flex flex-col items-center justify-center relative overflow-hidden">
              
              {/* Grid overlay */}
              <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
              
              {/* The Artifact */}
              <div className="w-96 h-96 relative drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300 group">
                  {previewData ? (
                      <CoinRender data={previewData} overrides={previewOverrides} />
                  ) : (
                      <div className="w-full h-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-xs">
                          INITIALIZING...
                      </div>
                  )}
                  
                  {/* Stats Overlay */}
                  {previewData && (
                      <div className="absolute -bottom-12 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="inline-block bg-black/80 text-zinc-400 text-[10px] px-3 py-1 rounded-full border border-zinc-800 backdrop-blur-sm">
                              {previewData.metal} • {previewData.year} • {previewOverrides.petalCount} Petals
                          </div>
                      </div>
                  )}
              </div>

              {/* Re-Roll Control */}
              <div className="absolute bottom-8 flex flex-col items-center gap-2">
                  <button 
                    onClick={() => generatePreview(activeProject)}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold uppercase tracking-widest rounded-full hover:scale-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  >
                      <Dices size={18} /> Re-Roll
                  </button>
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Simulate Generation</span>
              </div>
          </div>
      </div>

      {/* 3. RIGHT INSPECTOR (Parameters) */}
      <div className="w-80 bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden shadow-xl z-20">
          
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/30">
              <button 
                onClick={() => setActiveTab('VISUALS')}
                className={`flex-1 py-3 text-[10px] font-bold tracking-widest uppercase border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'VISUALS' ? 'border-blue-500 text-white bg-zinc-800' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
              >
                  <Palette size={12}/> Visuals
              </button>
              <button 
                onClick={() => setActiveTab('DNA')}
                className={`flex-1 py-3 text-[10px] font-bold tracking-widest uppercase border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'DNA' ? 'border-blue-500 text-white bg-zinc-800' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
              >
                  <Circle size={12}/> Core DNA
              </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {activeTab === 'DNA' && (
                  <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      
                      <div className="space-y-2">
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-4 border-b border-blue-900/30 pb-1">Possibilities</div>
                          
                          <MultiSelect 
                             label="Allowed Metals" 
                             options={Object.values(CoinMetal)} 
                             selected={activeProject.profile.allowedMetals}
                             onChange={(v) => updateProfile('allowedMetals', v)}
                          />

                          <MultiSelect 
                             label="Allowed Patterns" 
                             options={Object.values(CoinPattern)} 
                             selected={activeProject.profile.allowedPatterns}
                             onChange={(v) => updateProfile('allowedPatterns', v)}
                          />

                          <RangeControl 
                             label="Year Range" 
                             value={activeProject.profile.yearRange}
                             minLimit={-500} maxLimit={2025} step={1}
                             onChange={(v) => updateProfile('yearRange', v)}
                          />
                      </div>
                  </div>
              )}

              {activeTab === 'VISUALS' && (
                  <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                      
                      {/* Section: Geometry */}
                      <div>
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-4 border-b border-blue-900/30 pb-1 flex items-center gap-2">
                              <Circle size={12} /> Geometry Constraints
                          </div>
                          <RangeControl 
                             label="Shape Jitter" value={activeProject.profile.shapeJitter}
                             minLimit={0} maxLimit={10} step={0.1}
                             onChange={(v) => updateProfile('shapeJitter', v)}
                          />
                      </div>

                      {/* Section: Floral Engine */}
                      <div>
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-4 border-b border-blue-900/30 pb-1 flex items-center gap-2">
                              <RefreshCw size={12} /> Floral Engine Ranges
                          </div>
                          
                          <RangeControl 
                             label="Petal Count" value={activeProject.profile.petalCount}
                             minLimit={3} maxLimit={24} step={1}
                             onChange={(v) => updateProfile('petalCount', v)}
                          />
                          <RangeControl 
                             label="Petal Length" value={activeProject.profile.petalLength}
                             minLimit={0.1} maxLimit={1.0} step={0.01}
                             onChange={(v) => updateProfile('petalLength', v)}
                          />
                          <RangeControl 
                             label="Petal Width" value={activeProject.profile.petalWidth}
                             minLimit={0.1} maxLimit={1.0} step={0.01}
                             onChange={(v) => updateProfile('petalWidth', v)}
                          />
                          <RangeControl 
                             label="Sharpness" value={activeProject.profile.petalSharpness}
                             minLimit={0.1} maxLimit={2.0} step={0.1}
                             onChange={(v) => updateProfile('petalSharpness', v)}
                          />
                          <RangeControl 
                             label="Center Radius" value={activeProject.profile.centerRadius}
                             minLimit={0.1} maxLimit={0.6} step={0.01}
                             onChange={(v) => updateProfile('centerRadius', v)}
                          />
                      </div>

                      {/* Section: Colors */}
                      <div>
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-4 border-b border-blue-900/30 pb-1 flex items-center gap-2">
                              <Palette size={12} /> Palette Overrides
                          </div>
                          {(() => {
                              // Helper to show placeholders based on active metal
                              const sampleMetal = activeProject.profile.allowedMetals[0] || CoinMetal.Gold;
                              const std = getMetalPalette(sampleMetal);
                              return (
                                  <>
                                    <ColorOverride label="Force Base Color" value={activeProject.profile.customBaseColor} placeholder={std.base} onChange={(v) => updateProfile('customBaseColor', v)} />
                                    <ColorOverride label="Force Highlight" value={activeProject.profile.customShineColor} placeholder={std.shine} onChange={(v) => updateProfile('customShineColor', v)} />
                                    <ColorOverride label="Force Shadow" value={activeProject.profile.customDarkColor} placeholder={std.dark} onChange={(v) => updateProfile('customDarkColor', v)} />
                                  </>
                              )
                          })()}
                          <div className="text-[9px] text-zinc-600 mt-2 italic">
                              * Leave colors empty to use natural metal colors logic.
                          </div>
                      </div>

                  </div>
              )}
          </div>
      </div>

    </div>
  );
};