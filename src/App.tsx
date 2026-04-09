/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Music, 
  Sparkles, 
  Copy, 
  Check, 
  Loader2, 
  Play, 
  Pause,
  Info,
  FileAudio,
  Layers,
  Layout,
  BarChart3,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini (moved inside component/function to ensure fresh key)
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface VerticalArrangement {
  arrangement_summary: string;
  elements: {
    foundation: { instruments: string[]; frequency_zone: string; role_description: string };
    pad: { instruments: string[]; frequency_zone: string; role_description: string };
    rhythm: { instruments: string[]; frequency_zone: string; role_description: string };
    lead: { instruments: string[]; frequency_zone: string; role_description: string };
    fills: { instruments: string[]; frequency_zone: string; role_description: string };
  };
  vertical_stack_health: {
    is_rule_of_four_followed: boolean;
    conflict_warnings: string[];
    transparency_score: string;
  };
}

interface SongSection {
  name: string;
  timestamp: string;
  duration_seconds: number;
}

interface HarmonicAnalysis {
  roman_numerals: string;
  standard_notation: string;
  confidence_score: string;
  frequency_offset: string;
  scale_type: string;
}

interface AnalysisResult {
  genre: string;
  mood: string;
  tempo: string;
  key: string;
  harmonicAnalysis: HarmonicAnalysis;
  instruments: string[];
  sections: SongSection[];
  arrangement: string;
  verticalArrangement: VerticalArrangement;
  description: string;
  generatedPrompt: string;
}

const DAWTimeline = ({ sections }: { sections: SongSection[] }) => {
  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return <p className="text-zinc-500 text-sm italic">No section data available.</p>;
  }
  const scale = 0.8; // characters per second
  
  return (
    <div className="w-full overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
      <div className="min-w-max font-mono text-[11px] leading-none">
        {/* Timestamps Row */}
        <div className="flex h-5">
          {sections.map((section, i) => {
            const sectionName = section?.name || "Section";
            const charWidth = Math.max(sectionName.length + 6, Math.round((section?.duration_seconds || 0) * scale));
            return (
              <div key={i} style={{ width: `${charWidth}ch` }} className="text-zinc-600 pl-1 border-l border-zinc-800/50">
                {section?.timestamp || "0:00"}
              </div>
            );
          })}
        </div>
        
        {/* Blocks Row */}
        <div className="flex h-10 items-center">
          {sections.map((section, i) => {
            const sectionName = section?.name || "Section";
            const charWidth = Math.max(sectionName.length + 6, Math.round((section?.duration_seconds || 0) * scale));
            const contentWidth = charWidth - 2; // subtract brackets
            const name = ` ${sectionName} `;
            const paddingTotal = contentWidth - name.length;
            const leftPadding = Math.max(0, Math.floor(paddingTotal / 2));
            const rightPadding = Math.max(0, paddingTotal - leftPadding);
            
            const blockContent = "=".repeat(leftPadding) + name + "=".repeat(rightPadding);
            
            return (
              <div key={i} style={{ width: `${charWidth}ch` }} className="flex group h-7">
                <span className="text-zinc-800 group-hover:text-zinc-600 transition-colors self-center">[</span>
                <div className="flex-1 bg-indigo-500/10 border-y border-indigo-500/20 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/40 transition-all flex items-center justify-center overflow-hidden">
                  <span className="text-indigo-400/70 group-hover:text-indigo-400 transition-colors truncate px-1">
                    {blockContent}
                  </span>
                </div>
                <span className="text-zinc-800 group-hover:text-zinc-600 transition-colors self-center">]</span>
              </div>
            );
          })}
        </div>
        
        {/* Duration Row */}
        <div className="flex h-4">
          {sections.map((section, i) => {
            const sectionName = section?.name || "Section";
            const charWidth = Math.max(sectionName.length + 6, Math.round((section?.duration_seconds || 0) * scale));
            return (
              <div key={i} style={{ width: `${charWidth}ch` }} className="text-[9px] text-zinc-700 text-center">
                {section?.duration_seconds || 0}s
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Track audio progress accurately
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setFile(selectedFile);
      setAudioUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setError(null);
      setNeedsKey(false);
      setCurrentTime(0);
      setDuration(0);
    } else if (selectedFile) {
      setError("Please upload a valid audio file (MP3, WAV, etc.)");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setFile(selectedFile);
      setAudioUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setError(null);
      setNeedsKey(false);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
      setError(null);
    } catch (err) {
      console.error("Failed to open key selection:", err);
    }
  };

  const renderAnalysisField = (field: any) => {
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field !== null) {
      return Object.entries(field)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join('\n');
    }
    return String(field);
  };

  const analyzeMusic = async () => {
    if (!file) return;

    // Basic size validation (Gemini inline data limit is typically ~20MB, but proxy can timeout)
    if (file.size > 10 * 1024 * 1024) {
      setError("The audio file is too large (maximum 10MB for reliable analysis). Please try a shorter or compressed track.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Ensure we have an API key selected if required
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        const envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        
        if (!hasKey && !envKey) {
          setNeedsKey(true);
          setError("An API key is required for high-precision music analysis. Please select one below.");
          setIsAnalyzing(false);
          return;
        }
      }

      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey });

      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data,
                },
              },
              {
                text: `Analyze this audio file in detail. Provide a comprehensive breakdown of its musical elements, specifically focusing on:

1. Harmonic Accuracy Analysis: Perform a high-precision Harmonic Analysis. Do not guess the key based on the genre; follow this step-by-step "Theory-First" logic:
   - Isolate the Foundation: Identify the fundamental frequency (f0) of the bass/log drum. Use the recurring lowest notes to determine the Tonic (Root note) of the song.
   - Melodic Mapping: Analyze the Lead and Pad elements. Identify the specific intervals being played (e.g., is there a Minor 3rd or a Major 3rd? Is the 7th flat?).
   - Scale Identification: Based on the intervals found in the Lead and Pads, determine the specific scale (e.g., Dorian mode, Mixolydian, Natural Minor).
   - Chord Progression: Transcribe the chords by stacking the intervals found in the Pads and Guitars on top of the Bass root notes. Represent the progression in both Roman Numerals (e.g., i - iv - v - i) and Standard Notation (e.g., Am7 - Dm7 - Em7 - Am7).
   - Confidence Score: Provide a percentage of how certain you are of the key. If the song has a "Blue Note" or is out of tune (e.g., 432Hz vs 440Hz), note the frequency offset.

2. Horizontal Arrangement: How the composition flows over time, the layering of instruments, and the overall dynamic arc.
3. Section Assembly: A detailed breakdown of the song's sections (e.g., Intro, Verse, Chorus, Bridge, Outro) and how they are transitioned and connected.
4. Vertical Arrangement (The 5 Elements Engine): 
   Perform a deep-dive analysis of the song’s density and frequency layering using Bobby Owsinski’s 5 Elements framework:
   - FOUNDATION: The rhythmic and harmonic anchor (typically Kick and Bass).
   - PAD: The background "glue" or atmosphere (sustained notes/chords).
   - RHYTHM: Rhythmic movement that counters the Foundation (percussion, syncopated instruments).
   - LEAD: The focal point of the listener's attention (Vocals, Lead melodies).
   - FILLS: Musical "answers" that occupy the gaps between Lead phrases.
   
   Analyze Frequency Slotting (Low, Mid, High), Density (active elements), and "The Rule of Four" (flagging moments where 5+ elements compete).

5. Create a highly effective prompt for a music generator (like Suno or Udio) to recreate a similar style, mood, and instrumentation.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              genre: { type: Type.STRING },
              mood: { type: Type.STRING },
              tempo: { type: Type.STRING },
              key: { type: Type.STRING },
              harmonicAnalysis: {
                type: Type.OBJECT,
                properties: {
                  roman_numerals: { type: Type.STRING },
                  standard_notation: { type: Type.STRING },
                  confidence_score: { type: Type.STRING },
                  frequency_offset: { type: Type.STRING },
                  scale_type: { type: Type.STRING }
                },
                required: ["roman_numerals", "standard_notation", "confidence_score", "frequency_offset", "scale_type"]
              },
              instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    timestamp: { type: Type.STRING },
                    duration_seconds: { type: Type.NUMBER }
                  },
                  required: ["name", "timestamp", "duration_seconds"]
                }
              },
              arrangement: { type: Type.STRING },
              verticalArrangement: {
                type: Type.OBJECT,
                properties: {
                  arrangement_summary: { type: Type.STRING },
                  elements: {
                    type: Type.OBJECT,
                    properties: {
                      foundation: {
                        type: Type.OBJECT,
                        properties: {
                          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                          frequency_zone: { type: Type.STRING },
                          role_description: { type: Type.STRING }
                        }
                      },
                      pad: {
                        type: Type.OBJECT,
                        properties: {
                          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                          frequency_zone: { type: Type.STRING },
                          role_description: { type: Type.STRING }
                        }
                      },
                      rhythm: {
                        type: Type.OBJECT,
                        properties: {
                          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                          frequency_zone: { type: Type.STRING },
                          role_description: { type: Type.STRING }
                        }
                      },
                      lead: {
                        type: Type.OBJECT,
                        properties: {
                          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                          frequency_zone: { type: Type.STRING },
                          role_description: { type: Type.STRING }
                        }
                      },
                      fills: {
                        type: Type.OBJECT,
                        properties: {
                          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                          frequency_zone: { type: Type.STRING },
                          role_description: { type: Type.STRING }
                        }
                      }
                    }
                  },
                  vertical_stack_health: {
                    type: Type.OBJECT,
                    properties: {
                      is_rule_of_four_followed: { type: Type.BOOLEAN },
                      conflict_warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                      transparency_score: { type: Type.STRING }
                    }
                  }
                }
              },
              description: { type: Type.STRING },
              generatedPrompt: { type: Type.STRING }
            },
            required: ["genre", "mood", "tempo", "key", "harmonicAnalysis", "instruments", "sections", "arrangement", "verticalArrangement", "description", "generatedPrompt"]
          }
        },
      });

      const text = response.text;
      if (text) {
        const parsedResult = JSON.parse(text) as AnalysisResult;
        setResult(parsedResult);
      }
    } catch (err: any) {
      console.error("Analysis failed:", err);
      
      // Handle specific RPC/Network errors
      if (err.message?.includes("Rpc failed") || err.message?.includes("xhr error")) {
        setError("Network error: The analysis request was interrupted. This can happen with large files or unstable connections. Please try again or use a smaller file.");
      } else if (err.message?.includes("PERMISSION_DENIED") || err.status === 403) {
        setNeedsKey(true);
        setError("API Permission Denied. Please select a valid API key to continue.");
      } else {
        setError("Failed to analyze the audio. The AI service might be busy. Please try again in a moment.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = () => {
    if (result?.generatedPrompt) {
      navigator.clipboard.writeText(result.generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative max-w-4xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <header className="text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            AI-Powered Music Analysis
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent"
          >
            Sonic Architect
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-zinc-400 max-w-xl mx-auto"
          >
            Upload any track to dissect its DNA. Get professional-grade prompts to recreate the vibe with AI music generators.
          </motion.p>
        </header>

        {/* Upload Section */}
        <section className="mb-12">
          {!file ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 bg-zinc-900/50 rounded-3xl p-12 text-center transition-all duration-300">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">
                  <Upload className="w-8 h-8 text-zinc-400 group-hover:text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Drop your song here</h3>
                <p className="text-zinc-500">MP3, WAV, or M4A (Max 10MB)</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="audio/*"
                  className="hidden"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                  <FileAudio className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{file.name}</h3>
                  <p className="text-sm text-zinc-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <button 
                  onClick={() => { setFile(null); setAudioUrl(null); setResult(null); }}
                  className="text-sm text-zinc-500 hover:text-white transition-colors"
                >
                  Remove
                </button>
              </div>

              {audioUrl && (
                <div className="flex items-center gap-4 bg-black/40 rounded-2xl p-4 mb-6">
                  <button 
                    onClick={togglePlay}
                    className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>
                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <audio 
                    ref={audioRef} 
                    src={audioUrl} 
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </div>
              )}

              <button
                onClick={analyzeMusic}
                disabled={isAnalyzing}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Sonic DNA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Prompt
                  </>
                )}
              </button>
            </motion.div>
          )}
        </section>

        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center mb-8"
          >
            <p className="text-red-400 mb-4">{error}</p>
            {needsKey && (
              <button
                onClick={handleSelectKey}
                className="px-6 py-2 bg-white text-black rounded-xl font-semibold hover:bg-zinc-200 transition-colors"
              >
                Select API Key
              </button>
            )}
          </motion.div>
        )}

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="space-y-8"
            >
              {/* Prompt Card */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                      </div>
                      <h2 className="text-xl font-bold">AI Music Prompt</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setFile(null); setAudioUrl(null); setResult(null); }}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors"
                      >
                        Reset
                      </button>
                      <button
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy Prompt'}
                      </button>
                    </div>
                  </div>
                  <div className="bg-black/40 rounded-2xl p-6 border border-zinc-800/50 font-mono text-indigo-300 leading-relaxed">
                    {result.generatedPrompt}
                  </div>
                </div>
              </div>

              {/* Analysis Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    Genre & Mood
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-zinc-600 mb-1">Primary Genre</p>
                      <p className="font-semibold text-lg">{result.genre}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600 mb-1">Atmosphere</p>
                      <p className="font-semibold text-lg">{result.mood}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      Harmonic Accuracy
                    </h3>
                    <div className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] text-indigo-400 font-bold">
                      {result.harmonicAnalysis?.confidence_score || '0%'} CONFIDENCE
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-zinc-600 mb-1">Musical Key</p>
                        <p className="font-semibold text-lg">{result.key}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-600 mb-1">Scale/Mode</p>
                        <p className="font-semibold text-lg">{result.harmonicAnalysis?.scale_type || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/50">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">Standard Notation</p>
                      <p className="text-sm font-mono text-indigo-300">{result.harmonicAnalysis?.standard_notation || 'N/A'}</p>
                    </div>

                    <div className="p-3 bg-black/40 rounded-xl border border-zinc-800/50">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">Roman Numerals</p>
                      <p className="text-sm font-mono text-zinc-400">{result.harmonicAnalysis?.roman_numerals || 'N/A'}</p>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                      Frequency Offset: <span className="text-zinc-300 font-medium">{result.harmonicAnalysis?.frequency_offset || 'Standard (440Hz)'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Technical Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-zinc-600 mb-1">Tempo</p>
                      <p className="font-semibold text-lg">{result.tempo}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600 mb-1">Instrumentation</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {result.instruments?.map((inst, i) => (
                          <span key={i} className="px-2 py-1 bg-zinc-800 rounded-md text-xs text-zinc-300">
                            {inst}
                          </span>
                        )) || <p className="text-xs text-zinc-500">None identified</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-6 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Vertical Arrangement (5 Elements Engine)
                  </h3>
                  
                  <div className="space-y-8">
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                      <p className="text-xs text-indigo-400 uppercase tracking-widest font-bold mb-2">Arrangement Summary</p>
                      <p className="text-zinc-300 italic">"{result.verticalArrangement?.arrangement_summary || 'No summary available'}"</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      {result.verticalArrangement?.elements && (Object.entries(result.verticalArrangement.elements) as [string, any][]).map(([key, data]) => (
                        <div key={key} className="p-4 bg-black/40 border border-zinc-800 rounded-2xl">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">{key}</p>
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] text-zinc-600 mb-1">Instruments</p>
                              <p className="text-xs font-medium text-zinc-300">{data?.instruments?.join(', ') || 'None'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-zinc-600 mb-1">Zone</p>
                              <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">{data?.frequency_zone || 'N/A'}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-tight">{data?.role_description}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/50">
                      <div className="p-4 bg-zinc-800/30 rounded-2xl">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">Rule of Four</p>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${result.verticalArrangement?.vertical_stack_health?.is_rule_of_four_followed ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <p className="text-sm font-medium">{result.verticalArrangement?.vertical_stack_health?.is_rule_of_four_followed ? 'Followed' : 'Violated'}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-zinc-800/30 rounded-2xl">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">Transparency</p>
                        <p className="text-xl font-bold text-indigo-400">{result.verticalArrangement?.vertical_stack_health?.transparency_score || '0'}<span className="text-xs text-zinc-600 ml-1">/10</span></p>
                      </div>
                      <div className="p-4 bg-zinc-800/30 rounded-2xl">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">Conflicts</p>
                        <div className="space-y-1">
                          {result.verticalArrangement?.vertical_stack_health?.conflict_warnings?.length > 0 ? (
                            result.verticalArrangement.vertical_stack_health.conflict_warnings.map((w, i) => (
                              <p key={i} className="text-[10px] text-amber-400/80">• {w}</p>
                            ))
                          ) : (
                            <p className="text-[10px] text-green-400/80">No major conflicts</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Vibe Summary
                  </h3>
                  <p className="text-zinc-300 leading-relaxed italic">"{result.description || 'No description available.'}"</p>
                </div>

                <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Layout className="w-4 h-4" />
                    Section Assembly (Song Map)
                  </h3>
                  <DAWTimeline sections={result.sections} />
                </div>

                <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                  <h3 className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Horizontal Arrangement
                  </h3>
                  <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{renderAnalysisField(result.arrangement)}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="mt-20 pt-12 border-t border-zinc-900 text-center">
          <p className="text-zinc-600 text-sm">
            Powered by Gemini 3.1 Pro • Optimized for Suno, Udio, and Stable Audio
          </p>
        </footer>
      </main>
    </div>
  );
}
