import { useState, useRef, useEffect, MouseEvent } from "react";
import { Mic, User, Music, Play, Pause, RotateCcw, Download, Sparkles, AlertCircle, Volume2, HelpCircle, Activity, Settings, Info, Database } from "lucide-react";
import { VOICE_OPTIONS, SAMPLE_SCRIPTS, type VoiceOption, type PodcastScript } from "./data";
import { supabase } from "@/integrations/supabase/client";
import GeneratedFilesPanel, { type GeneratedFileRow } from "@/components/GeneratedFilesPanel";

export default function App() {
  // Input states
  const [hostText, setHostText] = useState(SAMPLE_SCRIPTS[1].hostText);
  const [collectorText, setCollectorText] = useState(SAMPLE_SCRIPTS[1].collectorText);
  
  // Voice selection states (fixed defaults, no user selection)
  const [hostVoice, setHostVoice] = useState("Charon");
  const [collectorVoice, setCollectorVoice] = useState("Achird");

  // Playback and UI state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string>("حلقة_بودكاست_القطاع.wav");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>("full_episode");
  const [fullScriptText, setFullScriptText] = useState<string>(
    SAMPLE_SCRIPTS.find((s) => s.id === "full_episode")?.fullScript || ""
  );
  const [isEditingScript, setIsEditingScript] = useState(false);

  // Voice Engine State (Smart switch between Cloud Gemini & Browser Local)
  const [voiceEngine, setVoiceEngine] = useState<"cloud" | "browser">("cloud");
  const [quotaExceededNotice, setQuotaExceededNotice] = useState(false);

  // Library panel
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryRefresh, setLibraryRefresh] = useState(0);

  // HTML5 Audio tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Browser TTS tracking
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);
  const speechIntervalRef = useRef<number | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentPlaySessionRef = useRef<number | null>(null);

  // Voice preview state
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const PREVIEW_SENTENCE = "هلا والله، أنا صوتك في هذي الحلقة، جربني وشوف وش رايك.";

  const previewVoice = async (voice: string, role: "host" | "collector") => {
    try {
      // Stop any ongoing preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();

      if (voiceEngine === "browser") {
        setPreviewingVoice(voice);
        speakLocalText(PREVIEW_SENTENCE, voice, role, () => {}, () => setPreviewingVoice(null));
        return;
      }

      setPreviewingVoice(voice);
      const res = await fetch("/api/generate-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: PREVIEW_SENTENCE, voice, role }),
      });
      if (!res.ok) throw new Error("preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewingVoice(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setPreviewingVoice(null);
      await audio.play();
    } catch {
      setPreviewingVoice(null);
      setError("تعذرت معاينة الصوت، حاول مرة أخرى.");
    }
  };

  // Cancel any speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
    };
  }, []);

  // Apply script preset (المستخدم حر باختيار صوت المذيع والمحصّل في كل الأوضاع)
  const handleApplyPreset = (script: PodcastScript) => {
    if (script.fullScript) {
      setFullScriptText(script.fullScript);
      // استخرج نصوص المذيع والمحصّل من النص الكامل لعرضها في الخانتين
      const turns = parseFullScript(script.fullScript);
      const hostLines = turns.filter((t) => t.role === "host").map((t) => t.text).join("\n\n");
      const collectorLines = turns.filter((t) => t.role === "collector").map((t) => t.text).join("\n\n");
      setHostText(hostLines || script.hostText || "");
      setCollectorText(collectorLines || script.collectorText || "");
    } else {
      setHostText(script.hostText);
      setCollectorText(script.collectorText);
    }
    setActivePreset(script.id);
    setError(null);
  };

  // Browser-native Speech Synthesis helper
  const speakLocalText = (
    text: string, 
    voiceValue: string, 
    role: "host" | "collector",
    onStart: (estDuration: number) => void,
    onEnd: () => void
  ) => {
    if (!('speechSynthesis' in window)) {
      setError("متصفحك لا يدعم نظام توليد الأصوات المدمج. يرجى استخدام متصفح حديث.");
      onEnd();
      return;
    }

    window.speechSynthesis.cancel();

    // Clean up text by removing punctuation-only or decorative strings for better speech output
    const cleanText = text.replace(/[….,،?؟!]/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Attempt to set Arabic voice, preferring Saudi Arabia if available
    utterance.lang = 'ar-SA';
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(v => v.lang.toLowerCase().includes('sa')) || 
                        voices.find(v => v.lang.toLowerCase().startsWith('ar'));
    
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    // Distinguish voices using pitch and rate parameters
    if (role === "host") {
      // Host: Calm, welcoming, slightly slower pacing
      utterance.pitch = 1.05;
      utterance.rate = 0.88;
    } else {
      // Collector: Faster, direct, realistic Saudi street style
      utterance.pitch = 0.92;
      utterance.rate = 0.98;
    }

    // Estimate duration based on word count (approx 130 words per minute / ~2.2 words per second)
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const estDuration = Math.max(wordCount * 0.45 + 1.2, 3); // minimum 3 seconds

    utterance.onstart = () => {
      onStart(estDuration);
    };

    utterance.onend = () => {
      onEnd();
    };

    utterance.onerror = (e) => {
      console.warn("SpeechSynthesis error:", e);
      onEnd();
    };

    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Generate TTS for single speaker
  const generateSingleSpeaker = async (role: "host" | "collector") => {
    setError(null);
    const text = role === "host" ? hostText : collectorText;
    const voice = role === "host" ? hostVoice : collectorVoice;
    const voiceLabel = VOICE_OPTIONS.find(v => v.value === voice)?.label || voice;
    
    if (!text.trim()) {
      setError(`الرجاء إدخال نص لبطاقة ${role === "host" ? "المذيع" : "المحصل"} أولاً.`);
      return;
    }

    // If local browser voice is selected
    if (voiceEngine === "browser") {
      playLocalSingle(text, voice, role);
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage(`جاري توليد صوت ${role === "host" ? "المذيع" : "المحصل"} بنبرة ${voiceLabel}...`);
      
      const response = await fetch("/api/generate-tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, voice, role }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMessage = errorData.error || "";
        
        // Check for Quota or Rate limit error to trigger seamless auto-fallback
        if (errMessage.includes("quota") || errMessage.includes("limit") || response.status === 429) {
          triggerAutoFallback();
          // Attempt immediate playback via fallback
          playLocalSingle(text, voice, role);
          return;
        }
        throw new Error(errMessage || "فشل توليد الصوت من الخادم.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Stop local audio states
      stopLocalSpeaking();
      
      setAudioUrl(url);
      const fname = `${role === "host" ? "مذيع" : "محصل"}_بودكاست_${Date.now()}.wav`;
      setAudioName(fname);
      setIsPlaying(false);

      // Auto-save to library
      autoSaveGeneratedFile({
        name: fname,
        kind: role === "host" ? "single-host" : "single-collector",
        engine: "cloud",
        audioBlob: blob,
        hostText: role === "host" ? text : undefined,
        collectorText: role === "collector" ? text : undefined,
        hostVoice: role === "host" ? voice : undefined,
        collectorVoice: role === "collector" ? voice : undefined,
      });

      // Auto-play the newly generated audio
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }, 100);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ أثناء الاتصال بالخادم لتوليد الصوت.");
    } finally {
      setIsLoading(false);
    }
  };

  // Play single voice via browser local speech engine
  const playLocalSingle = (text: string, voice: string, role: "host" | "collector") => {
    stopLocalSpeaking();
    setIsLoading(true);
    setLoadingMessage(`جاري تشغيل الصوت محلياً عبر متصفحك...`);
    
    setAudioUrl("browser-native-tts");
    setAudioName(`${role === "host" ? "مذيع" : "محصل"}_محاكاة_المتصفح.mp3`);
    
    speakLocalText(text, voice, role, 
      (estDuration) => {
        setIsLoading(false);
        setDuration(estDuration);
        setCurrentTime(0);
        setIsPlaying(true);
        setIsBrowserSpeaking(true);

        // Start progressive mock ticker for the audio bar
        if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
        const startTime = Date.now();
        speechIntervalRef.current = window.setInterval(() => {
          const elapsed = (Date.now() - startTime) / 1000;
          if (elapsed >= estDuration) {
            clearInterval(speechIntervalRef.current!);
            setCurrentTime(estDuration);
            setIsPlaying(false);
            setIsBrowserSpeaking(false);
          } else {
            setCurrentTime(elapsed);
          }
        }, 100);
      },
      () => {
        setIsLoading(false);
        setIsPlaying(false);
        setIsBrowserSpeaking(false);
        if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      }
    );
  };

  // Trigger Automatic Web Speech API Fallback
  const triggerAutoFallback = () => {
    setVoiceEngine("browser");
    setQuotaExceededNotice(true);
    setError("⚠️ تم تفعيل نظام محاكاة الصوت المدمج في جهازك تلقائياً لتجاوز حد حصة الـ API لخدمة Gemini. يمكنك الاستماع للحوار كاملاً ومتابعة التجربة مجاناً وبلا حدود!");
  };

  // Auto-save generated file to Lovable Cloud
  const autoSaveGeneratedFile = async (params: {
    name: string;
    kind: "single-host" | "single-collector" | "dialogue" | "full-episode";
    engine: "cloud" | "browser";
    audioBlob?: Blob | null;
    hostText?: string;
    collectorText?: string;
    fullScript?: string;
    hostVoice?: string;
    collectorVoice?: string;
    presetId?: string;
  }) => {
    try {
      let audio_path: string | null = null;
      if (params.audioBlob) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
        const { error: upErr } = await supabase.storage
          .from("generated-audio")
          .upload(path, params.audioBlob, { contentType: "audio/mpeg", upsert: false });
        if (!upErr) audio_path = path;
        else console.warn("Audio upload failed:", upErr.message);
      }
      const { error: insErr } = await supabase.from("generated_files").insert({
        name: params.name,
        kind: params.kind,
        engine: params.engine,
        preset_id: params.presetId || activePreset,
        host_text: params.hostText ?? null,
        collector_text: params.collectorText ?? null,
        full_script: params.fullScript ?? null,
        host_voice: params.hostVoice ?? null,
        collector_voice: params.collectorVoice ?? null,
        audio_path,
      });
      if (insErr) console.warn("DB insert failed:", insErr.message);
      else setLibraryRefresh((t) => t + 1);
    } catch (e) {
      console.warn("autoSaveGeneratedFile failed", e);
    }
  };

  // Handler when a file is loaded from the library
  const handleLoadFromLibrary = (f: GeneratedFileRow, signedUrl: string | null) => {
    if (f.preset_id) setActivePreset(f.preset_id);
    if (f.host_voice) setHostVoice(f.host_voice);
    if (f.collector_voice) setCollectorVoice(f.collector_voice);
    if (f.host_text != null) setHostText(f.host_text);
    if (f.collector_text != null) setCollectorText(f.collector_text);
    if (f.full_script != null) setFullScriptText(f.full_script);
    setVoiceEngine((f.engine as "cloud" | "browser") || "cloud");
    stopLocalSpeaking();
    if (signedUrl) {
      setAudioUrl(signedUrl);
      setAudioName(f.name.endsWith(".mp3") ? f.name : `${f.name}.mp3`);
      setIsPlaying(false);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }, 150);
    } else {
      setAudioUrl(null);
    }
    setError(null);
  };

  // Helper to parse the full Arabic script into structured turn-by-turn speaker dialogues
  const parseFullScript = (fullScript: string) => {
    const normalizedScript = fullScript
      .replace(/المحصّل:/g, "المحصل:")
      .replace(/المحصّل :/g, "المحصل:");
      
    const paragraphs = normalizedScript.split("\n\n");
    const turns: { role: "host" | "collector"; text: string }[] = [];
    
    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const lineTrimmed = line.trim();
        if (!lineTrimmed) continue;
        
        if (lineTrimmed.startsWith("المذيع:")) {
          turns.push({
            role: "host",
            text: lineTrimmed.replace(/^المذيع:\s*/, "").trim()
          });
        } else if (lineTrimmed.startsWith("المحصل:")) {
          turns.push({
            role: "collector",
            text: lineTrimmed.replace(/^المحصل:\s*/, "").trim()
          });
        }
      }
    }
    return turns;
  };

  // Generate complete combined dialogue
  const generateCompleteDialogue = async () => {
    setError(null);

    const activeScript = SAMPLE_SCRIPTS.find(s => s.id === activePreset);
    const isFullScript = !!activeScript?.fullScript;

    if (isFullScript) {
      if (!fullScriptText.trim()) {
        setError("نص الحوار الكامل غير متوفر.");
        return;
      }
    } else {
      if (!hostText.trim() || !collectorText.trim()) {
        setError("يرجى كتابة نص المذيع ونص المحصل معاً لتوليد الحوار الكامل.");
        return;
      }
    }

    // If local browser voice is selected
    if (voiceEngine === "browser") {
      if (isFullScript) {
        const turns = parseFullScript(fullScriptText);
        playLocalDialogue(turns);
        return;
      }
      playLocalDialogue();
      return;
    }

    let shouldClearLoading = true;
    try {
      setIsLoading(true);
      setLoadingMessage("جاري دمج الحوار وتوليد حلقة البودكاست المتكاملة من Gemini...");
      
      const payload = isFullScript 
        ? {
            fullScript: fullScriptText,
            hostVoice,
            collectorVoice,
            style: activeScript?.style,
          }
        : {
            hostText,
            hostVoice,
            collectorText,
            collectorVoice,
            style: activeScript?.style,
          };


      const response = await fetch("/api/generate-dialogue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMessage = errorData.error || "";
        
        // Handle rate limit and auto-fallback
        if (errMessage.includes("quota") || errMessage.includes("limit") || response.status === 429) {
          shouldClearLoading = false;
          triggerAutoFallback();
          if (isFullScript) {
            const turns = parseFullScript(fullScriptText);
            playLocalDialogue(turns);
          } else {
            playLocalDialogue();
          }
          return;
        }
        throw new Error(errMessage || "فشل توليد الحوار المشترك.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      stopLocalSpeaking();
      
      setAudioUrl(url);
      const fname = isFullScript ? `الحلقة_الكاملة_بودكاست_القطاع_${Date.now()}.mp3` : `حلقة_بودكاست_كاملة_${Date.now()}.mp3`;
      setAudioName(fname);
      setIsPlaying(false);

      autoSaveGeneratedFile({
        name: fname,
        kind: isFullScript ? "full-episode" : "dialogue",
        engine: "cloud",
        audioBlob: blob,
        hostText: isFullScript ? undefined : hostText,
        collectorText: isFullScript ? undefined : collectorText,
        fullScript: isFullScript ? fullScriptText : undefined,
        hostVoice,
        collectorVoice,
      });

      // Auto-play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }, 100);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "حدث خطأ غير متوقع أثناء توليد الحوار المتكامل.");
    } finally {
      if (shouldClearLoading) {
        setIsLoading(false);
      }
    }
  };

  // Play connected conversation between host and collector via local browser SpeechSynthesis
  const playLocalDialogue = (customTurns?: { role: "host" | "collector"; text: string }[]) => {
    stopLocalSpeaking();
    setIsLoading(true);
    setLoadingMessage("جاري تشغيل حوار البودكاست المشترك عبر متصفحك...");

    setAudioUrl("browser-native-tts-dialogue");
    setAudioName(customTurns ? "الحلقة_الكاملة_محاكاة_المتصفح.mp3" : "حلقة_كاملة_محاكاة_المتصفح.mp3");

    // Get turns
    let turns: { role: "host" | "collector"; text: string }[] = [];
    if (customTurns && customTurns.length > 0) {
      turns = customTurns;
    } else {
      turns = [
        { role: "host", text: hostText },
        { role: "collector", text: collectorText }
      ];
    }

    if (turns.length === 0) {
      setIsLoading(false);
      setError("لا يوجد نص لتشغيله.");
      return;
    }

    // Estimate total duration
    let totalEst = 0;
    const turnEstimates = turns.map(t => {
      const words = t.text.split(/\s+/).filter(Boolean).length;
      const est = Math.max(words * 0.45 + 1.2, 3);
      totalEst += est;
      return est;
    });

    let startTime = Date.now();
    let currentTurnIdx = 0;
    const sessionId = Date.now();
    currentPlaySessionRef.current = sessionId;

    const playNextTurn = () => {
      if (currentPlaySessionRef.current !== sessionId) return;
      if (currentTurnIdx >= turns.length) {
        setIsPlaying(false);
        setIsBrowserSpeaking(false);
        if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
        return;
      }

      const turn = turns[currentTurnIdx];
      const voice = turn.role === "host" ? hostVoice : collectorVoice;
      
      speakLocalText(turn.text, voice, turn.role,
        () => {
          // On start of the very first turn
          if (currentTurnIdx === 0) {
            setIsLoading(false);
            setDuration(totalEst);
            setCurrentTime(0);
            setIsPlaying(true);
            setIsBrowserSpeaking(true);

            // Start ticking progress bar
            if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
            speechIntervalRef.current = window.setInterval(() => {
              if (currentPlaySessionRef.current !== sessionId) {
                clearInterval(speechIntervalRef.current!);
                return;
              }
              const elapsed = (Date.now() - startTime) / 1000;
              if (elapsed >= totalEst) {
                clearInterval(speechIntervalRef.current!);
                setCurrentTime(totalEst);
                setIsPlaying(false);
                setIsBrowserSpeaking(false);
              } else {
                setCurrentTime(elapsed);
              }
            }, 100);
          }
        },
        () => {
          // On end of this turn
          currentTurnIdx++;
          // Delay slightly between turns for a realistic podcast feel
          setTimeout(() => {
            playNextTurn();
          }, 500);
        }
      );
    };

    // Begin playing
    playNextTurn();
  };

  // Cancel and clean up all SpeechSynthesis
  const stopLocalSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
    }
    setIsBrowserSpeaking(false);
  };

  // Manage custom player control triggers
  const togglePlayPause = () => {
    if (audioUrl?.startsWith("browser-native")) {
      if (isPlaying) {
        if (window.speechSynthesis) window.speechSynthesis.pause();
        setIsPlaying(false);
      } else {
        if (window.speechSynthesis) window.speechSynthesis.resume();
        setIsPlaying(true);
      }
      return;
    }

    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const restartAudio = () => {
    if (audioUrl?.startsWith("browser-native")) {
      if (audioUrl.includes("dialogue")) {
        const activeScript = SAMPLE_SCRIPTS.find(s => s.id === activePreset);
        const isFullScript = !!activeScript?.fullScript;
        if (isFullScript) {
          const turns = parseFullScript(fullScriptText);
          playLocalDialogue(turns);
        } else {
          playLocalDialogue();
        }
      } else {
        const isHost = audioName.startsWith("مذيع");
        playLocalSingle(
          isHost ? hostText : collectorText,
          isHost ? hostVoice : collectorVoice,
          isHost ? "host" : "collector"
        );
      }
      return;
    }

    if (!audioRef.current || !audioUrl) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  // Audio events tracking
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleProgressClick = (e: MouseEvent<HTMLDivElement>) => {
    if (audioUrl?.startsWith("browser-native")) return; // Seek not supported for web speech mock
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const targetTime = percentage * duration;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return "00:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 flex flex-col font-sans relative overflow-x-hidden pb-44" dir="rtl">
      {/* Hidden Audio element for execution */}
      {audioUrl && !audioUrl.startsWith("browser-native") && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
        />
      )}

      {/* Header Navigation */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 md:px-12 py-3 sm:h-20 border-b border-slate-800 bg-[#0B0F19]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Mic className="w-4 h-4 sm:w-6 sm:h-6 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl md:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-l from-slate-100 to-slate-400 truncate">
                بودكاست من داخل القطاع
              </h1>
              <p className="text-[10px] md:text-xs text-slate-400 hidden sm:block">منصة الإنتاج الصوتي باللهجة السعودية العامية البسيطة</p>
            </div>
          </div>

          <button
            onClick={() => setLibraryOpen(true)}
            className="sm:hidden shrink-0 px-2.5 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-gradient-to-l from-indigo-600 to-indigo-500 text-white shadow cursor-pointer"
            title="عرض الملفات المولّدة المحفوظة"
          >
            <Database className="w-3.5 h-3.5" />
            <span>الملفات</span>
          </button>
        </div>

        {/* Active Engine Switcher (Sleek layout) */}
        <div className="flex gap-1 sm:gap-2 items-center bg-slate-900/90 border border-slate-800 rounded-full p-1 sm:p-1.5 w-full sm:w-auto">
          <button
            id="btn-engine-cloud"
            onClick={() => {
              setVoiceEngine("cloud");
              setError(null);
            }}
            className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
              voiceEngine === "cloud"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="truncate"><span className="sm:hidden">Gemini AI</span><span className="hidden sm:inline">صوت الذكاء الاصطناعي (Gemini)</span></span>
          </button>

          <button
            id="btn-engine-browser"
            onClick={() => {
              setVoiceEngine("browser");
              setError(null);
            }}
            className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
              voiceEngine === "browser"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="truncate"><span className="sm:hidden">المتصفح</span><span className="hidden sm:inline">صوت المتصفح البديل (مجاني ومفتوح)</span></span>
          </button>
        </div>

        <button
          onClick={() => setLibraryOpen(true)}
          className="hidden sm:flex mr-3 px-4 py-2 rounded-full text-xs font-bold items-center gap-2 bg-gradient-to-l from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
          title="عرض الملفات المولّدة المحفوظة"
        >
          <Database className="w-4 h-4" />
          <span>الملفات المولّدة</span>
        </button>
      </header>


      <GeneratedFilesPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onLoad={handleLoadFromLibrary}
        refreshTick={libraryRefresh}
      />

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-3 sm:px-4 md:px-10 py-4 sm:py-6 md:py-8 pb-48 sm:pb-32 flex flex-col gap-4 sm:gap-6">
        
        {/* Banner with brief info and Script presets selection */}
        <div className="bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 p-8 opacity-5">
            <Mic className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 sm:mb-4">
              <div className="flex items-center gap-2 text-indigo-400 text-xs sm:text-sm font-bold">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-bounce" />
                <span>أهلاً بك في منصة البودكاست المبتكرة</span>
              </div>

              {/* Notice badge if automatic fallback happened */}
              {quotaExceededNotice && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] sm:text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse shrink-0" />
                  <span>تم تفعيل الوضع المحلي لضمان استمرارية التشغيل</span>
                </div>
              )}
            </div>

            <h2 className="text-base sm:text-xl md:text-2xl font-bold text-slate-100 mb-1.5 sm:mb-2">
              حوار تفاعلي طبيعي بلهجة سعودية بسيطة!
            </h2>
            <p className="text-slate-400 text-[11px] sm:text-xs md:text-sm max-w-3xl leading-relaxed mb-4 sm:mb-6">
              اكتب النص لكل شخصية، واختر نبرة الصوت المفضلة، وسيقوم النظام بتوليد الكلام بلهجة عامية دقيقة ومخارج حروف واضحة. حدد أحد السيناريوهات الجاهزة بالأسفل لتجربتها مباشرة!
            </p>

            {/* Quick Presets Selector */}
            <div>
              <div className="text-[11px] sm:text-xs font-bold text-slate-400 mb-2 sm:mb-3 block">اختر سيناريو وحوار جاهز للتجربة السريعة:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                {SAMPLE_SCRIPTS.map((script) => (
                  <button
                    key={script.id}
                    id={`preset-btn-${script.id}`}
                    onClick={() => handleApplyPreset(script)}
                    className={`text-right p-2.5 sm:p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      activePreset === script.id
                        ? "bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/5 text-slate-100"
                        : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm mb-1 flex items-center justify-between gap-2">
                      <span className="truncate">{script.title}</span>
                      {activePreset === script.id && <span className="text-[9px] sm:text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-md shrink-0">محدد</span>}
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-400 line-clamp-1">{script.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Global Error/Warning Banner if any */}
        {error && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl flex items-start gap-2 sm:gap-3 text-xs sm:text-sm animate-fade-in" id="error-banner">

            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
            <button onClick={() => setError(null)} className="text-xs hover:underline text-amber-400 font-bold cursor-pointer self-center">إغلاق</button>
          </div>
        )}

        {/* Dynamic Generating State Modal overlay or visual box */}
        {isLoading && (
          <div className="bg-indigo-950/50 border border-indigo-500/30 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
                <Music className="w-4 h-4 text-white animate-spin" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-200">{loadingMessage}</p>
                <p className="text-xs text-slate-400">قد يستغرق توليد الصوت بضع ثوانٍ...</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}

        {/* Conditional Layouts based on Preset Mode */}
        {SAMPLE_SCRIPTS.find(s => s.id === activePreset)?.fullScript ? (
          <div className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl p-3 sm:p-6 flex flex-col shadow-lg relative min-h-[400px] sm:min-h-[500px]" id="full-episode-view">

            {/* Full Episode Header */}
            <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
                  <Mic className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-100 text-sm sm:text-lg truncate">النص الحواري الكامل للحلقة</h2>
                  <p className="text-[10px] sm:text-xs text-indigo-400 font-bold tracking-wider truncate">
                    حوار بين شخصيتين فقط: المذيع والمحصّل
                  </p>
                </div>
              </div>

              {/* Fixed voices info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-slate-950/50 border border-indigo-900/40 rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-indigo-300 font-black mb-1">
                    <Mic className="w-3 h-3" /> صوت المذيع
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 leading-relaxed">صوت رجالي سعودي طبيعي بنبرة مذيع واثقة.</p>
                </div>
                <div className="bg-slate-950/50 border border-amber-900/40 rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-amber-300 font-black mb-1">
                    <User className="w-3 h-3" /> صوت المحصّل
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 leading-relaxed">شاب سعودي في العشرينات بلهجة عامية سعودية بسيطة وطبيعية.</p>
                </div>
              </div>
            </div>

            {/* Edit/Preview Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="flex items-start gap-2 text-[11px] sm:text-xs text-slate-400 min-w-0">
                <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>الحوار إلزامياً بين شخصيتين فقط. ابدأ كل فقرة بـ <strong className="text-indigo-300">المذيع:</strong> أو <strong className="text-amber-300">المحصّل:</strong> وافصل بين الفقرات بسطر فارغ.</span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditingScript((v) => !v)}
                  className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
                >
                  {isEditingScript ? "معاينة" : "تعديل النص"}
                </button>
                <button
                  type="button"
                  onClick={() => setFullScriptText(SAMPLE_SCRIPTS.find(s => s.id === "full_episode")?.fullScript || "")}
                  className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer"
                  title="إعادة تعيين النص الأصلي"
                >
                  استعادة
                </button>
              </div>
            </div>

            {/* Editable Script or Scrollable Script Log */}
            {isEditingScript ? (
              <textarea
                value={fullScriptText}
                onChange={(e) => setFullScriptText(e.target.value)}
                dir="rtl"
                className="w-full bg-slate-950/60 rounded-xl border border-indigo-800/60 focus:border-indigo-500 outline-none p-3 sm:p-6 h-[320px] sm:h-[480px] text-slate-100 leading-relaxed text-xs sm:text-sm font-sans resize-none"
                placeholder="اكتب الحوار هنا..."
              />
            ) : (
              <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3 sm:p-6 max-h-[360px] sm:max-h-[480px] overflow-y-auto flex flex-col gap-3 sm:gap-4 font-sans text-sm">
                {fullScriptText.split("\n\n").map((paragraph, index) => {
                  const isHost = paragraph.startsWith("المذيع:");
                  const isCollector = paragraph.startsWith("المحصّل:") || paragraph.startsWith("المحصل:");
                  const textContent = paragraph.replace(/^(المذيع:|المحصّل:|المحصل:)\s*/, "").trim();

                  if (!textContent) return null;
                  const hostLabel = VOICE_OPTIONS.find(v => v.value === hostVoice)?.label || hostVoice;
                  const collectorLabel = VOICE_OPTIONS.find(v => v.value === collectorVoice)?.label || collectorVoice;

                  return (
                    <div
                      key={index}
                      className={`flex flex-col gap-1.5 p-2.5 sm:p-3.5 rounded-xl border transition-all break-words ${
                        isHost
                          ? "bg-indigo-950/10 border-indigo-950/30 sm:ml-8 text-right"
                          : isCollector
                          ? "bg-amber-950/5 border-amber-950/10 sm:mr-8 text-right"
                          : "bg-slate-900/10 border-slate-800/40 sm:mx-4"
                      }`}
                    >
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mb-1">
                        {isHost ? (
                          <>
                            <span className="px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black bg-indigo-600 text-white">المذيع</span>
                            <span className="text-[9px] sm:text-[10px] text-indigo-400 font-bold truncate">{hostLabel}</span>
                          </>
                        ) : isCollector ? (
                          <>
                            <span className="px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black bg-amber-600 text-slate-950">المحصّل</span>
                            <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold truncate">{collectorLabel}</span>
                          </>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold">راوي</span>
                        )}
                      </div>
                      <p className="text-slate-200 leading-relaxed text-[12px] sm:text-sm">{textContent}</p>
                    </div>
                  );
                })}
              </div>
            )}


            {/* Large generate button for the full episode */}
            <div className="mt-4 sm:mt-6">
              {voiceEngine === "browser" ? (
                <button
                  id="btn-play-full-episode"
                  disabled={isLoading}
                  onClick={generateCompleteDialogue}
                  className="w-full py-3 sm:py-4 px-3 bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-xl shadow-amber-600/20 active:scale-[0.99] cursor-pointer text-xs sm:text-base md:text-lg text-center"
                >
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse text-amber-100 shrink-0" />
                  <span>تشغيل الحلقة الكاملة عبر محاكاة المتصفح</span>
                </button>
              ) : (
                <button
                  id="btn-play-full-episode"
                  disabled={isLoading}
                  onClick={generateCompleteDialogue}
                  className="w-full py-3 sm:py-4 px-3 bg-gradient-to-l from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.99] cursor-pointer text-xs sm:text-base md:text-lg text-center"
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse shrink-0" />
                  <span>إنتاج الحلقة الكاملة بملف صوتي واحد (Gemini)</span>
                </button>
              )}
            </div>
          </div>

        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">

            {/* Section 1: The Host (المذيع) */}
            <section className="flex flex-col gap-4" id="section-host">
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3 sm:p-6 flex flex-col h-full shadow-lg relative">

                {/* Header inside host card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
                      <Mic className="w-4 h-4 sm:w-6 sm:h-6 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-slate-100 text-sm sm:text-lg">نص المذيع</h2>
                      <p className="text-[10px] sm:text-xs text-indigo-400 font-bold uppercase tracking-wider truncate">صوت هادئ ومحترف • مقدم الحلقات</p>
                    </div>
                  </div>

                  {/* Fixed voice info */}
                  <div className="text-[10px] sm:text-[11px] text-indigo-300/80 font-bold bg-indigo-950/30 border border-indigo-900/40 rounded-lg px-2.5 py-1.5">
                    صوت رجالي سعودي طبيعي • ثابت
                  </div>
                </div>

                {/* Informative description */}
                <p className="text-[11px] sm:text-xs text-slate-400 mb-2 sm:mb-3 leading-relaxed">
                  نبرة مذيع سعودي واثقة وطبيعية، بلهجة عامية بسيطة كأنها مكالمة هاتفية حقيقية.
                </p>

                {/* Text Input area */}
                <div className="flex-grow flex flex-col">
                  <textarea
                    id="host-textarea"
                    value={hostText}
                    onChange={(e) => setHostText(e.target.value)}
                    className="flex-grow w-full bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 sm:p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors min-h-[140px] sm:min-h-[160px] text-[13px] sm:text-sm leading-relaxed"
                    placeholder="اكتب هنا النص الذي تريد أن يقوله المذيع بلهجة سعودية..."
                  ></textarea>
                  <div className="flex justify-between text-[10px] sm:text-[11px] text-slate-500 mt-2 gap-2">
                    <span className="truncate">علامات الترقيم تضيف وقفات طبيعية</span>
                    <span className="shrink-0">{hostText.length} حرفاً</span>
                  </div>
                </div>

                {/* Trigger single button */}
                <button
                  id="btn-play-host"
                  disabled={isLoading}
                  onClick={() => generateSingleSpeaker("host")}
                  className="mt-3 sm:mt-4 w-full py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98] cursor-pointer text-xs sm:text-sm"
                >
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  تشغيل صوت المذيع {voiceEngine === "browser" && "(محلياً)"}
                </button>
              </div>
            </section>

            {/* Section 2: The Collector (المحصل) */}
            <section className="flex flex-col gap-4" id="section-collector">
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3 sm:p-6 flex flex-col h-full shadow-lg relative">

                {/* Header inside collector card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-12 sm:h-12 shrink-0 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                      <User className="w-4 h-4 sm:w-6 sm:h-6 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-slate-100 text-sm sm:text-lg">نص المحصل</h2>
                      <p className="text-[10px] sm:text-xs text-amber-400 font-bold uppercase tracking-wider truncate">صوت واقعي ومباشر • خبير القطاع</p>
                    </div>
                  </div>

                  {/* Fixed voice info */}
                  <div className="text-[10px] sm:text-[11px] text-amber-300/80 font-bold bg-amber-950/20 border border-amber-900/40 rounded-lg px-2.5 py-1.5">
                    شاب سعودي في العشرينات • ثابت
                  </div>
                </div>

                {/* Informative description */}
                <p className="text-[11px] sm:text-xs text-slate-400 mb-2 sm:mb-3 leading-relaxed">
                  لهجة سعودية عامية بسيطة وطبيعية جداً، بإيقاع مكالمة هاتفية حقيقية.
                </p>

                {/* Text Input area */}
                <div className="flex-grow flex flex-col">
                  <textarea
                    id="collector-textarea"
                    value={collectorText}
                    onChange={(e) => setCollectorText(e.target.value)}
                    className="flex-grow w-full bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 sm:p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 resize-none transition-colors min-h-[140px] sm:min-h-[160px] text-[13px] sm:text-sm leading-relaxed"
                    placeholder="اكتب هنا النص الذي تريد أن يقوله المحصل بأسلوب سعودي بسيط..."
                  ></textarea>
                  <div className="flex justify-between text-[10px] sm:text-[11px] text-slate-500 mt-2 gap-2">
                    <span className="truncate">لهجة شعبية تقريبية للشارع السعودي</span>
                    <span className="shrink-0">{collectorText.length} حرفاً</span>
                  </div>
                </div>

                {/* Trigger single button */}
                <button
                  id="btn-play-collector"
                  disabled={isLoading}
                  onClick={() => generateSingleSpeaker("collector")}
                  className="mt-3 sm:mt-4 w-full py-2.5 sm:py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-600/10 active:scale-[0.98] cursor-pointer text-xs sm:text-sm"
                >
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  تشغيل صوت المحصل {voiceEngine === "browser" && "(محلياً)"}
                </button>
              </div>
            </section>

          </div>
        )}


        {/* Quick Help Guide */}
        <div className="bg-slate-900/20 border border-slate-800/50 rounded-xl p-3 sm:p-4 flex gap-2 sm:gap-3 text-[11px] sm:text-xs text-slate-400 items-start leading-relaxed">
          <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="font-bold text-slate-300 block mb-1">💡 نصائح لإنتاج أفضل جودة:</span>
            {activePreset === "full_episode" ? (
              <>
                - اضغط على زر <strong className="text-slate-200">"إنتاج الحلقة الكاملة بملف صوتي واحد"</strong> بالأسفل لتوليد كامل الأجزاء معاً.
                <br />
                - يتميز توليد الحوار المتكامل بتنسيق نبرات ممتازة ومخارج حروف باللهجة السعودية العامية البسيطة جداً.
                <br />
                - الوقفات عند علامات الترقيم تساهم في إخراج العمل كالبودكاست الحقيقي.
              </>
            ) : (
              <>
                - يمكنك استخدام علامات المد والوقف لتمثيل السكتات والوقفات كالبودكاست الحقيقي.
                <br />
                - الوضع السحابي (Gemini) يمنحك أفضل أداء صوتي ومخارج سعودية طبيعية جداً.
                <br />
                - إذا نفدت الحصة اليومية، اضغط على <strong className="text-slate-200">صوت المتصفح البديل</strong> في الأعلى للاستمرار مجاناً.
              </>
            )}
          </div>
        </div>

      </main>

      {/* Footer Player & Dialogue Generation Control Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/95 border-t border-slate-800/80 px-3 sm:px-4 md:px-10 py-2.5 sm:py-4 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-stretch md:items-center gap-2 sm:gap-4 justify-between">

        {/* Left Side: Audio Player Control (Conditional view) */}
        <div className="w-full md:w-auto flex-1 flex flex-col gap-1.5 md:min-w-[280px]">
          {audioUrl ? (
            <div>
              <div className="flex justify-between items-end mb-1 gap-2">
                <span className="text-[11px] sm:text-xs text-slate-300 font-bold flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <span className="hidden sm:inline">الملف الصوتي الحالي:</span>
                  <span className="sm:hidden">الحالي:</span>
                  <span className="text-slate-400 font-normal truncate max-w-[120px] sm:max-w-[150px]">{audioName.split("_")[0]}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* custom progress bar */}
              <div
                onClick={handleProgressClick}
                className={`h-1.5 sm:h-2 w-full bg-slate-800 rounded-full overflow-hidden relative ${audioUrl.startsWith("browser-native") ? "cursor-not-allowed" : "cursor-pointer group"}`}
                title={audioUrl.startsWith("browser-native") ? "التمرير غير متاح أثناء التشغيل المحلي" : "انقر لتغيير موضع التشغيل"}
              >
                <div
                  className="absolute inset-y-0 right-0 bg-gradient-to-l from-indigo-500 to-amber-500 transition-all duration-100"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%`, right: 'auto', left: 0 }}
                ></div>
                {!audioUrl.startsWith("browser-native") && (
                  <div className="absolute top-0 bottom-0 w-1 bg-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}></div>
                )}
              </div>

              {/* Action Buttons for custom audio element */}
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-2 items-center">
                <button
                  id="btn-play-pause"
                  onClick={togglePlayPause}
                  className="text-slate-200 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer"
                  title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span>إيقاف</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span>تشغيل</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-restart"
                  onClick={restartAudio}
                  className="text-slate-400 hover:text-white text-[11px] sm:text-xs flex items-center gap-1 cursor-pointer"
                  title="إعادة من البداية"
                >
                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>إعادة</span>
                </button>

                {!audioUrl.startsWith("browser-native") ? (
                  <a
                    id="btn-download"
                    href={audioUrl}
                    download={audioName}
                    className="text-indigo-400 hover:text-indigo-300 text-[11px] sm:text-xs flex items-center gap-1 font-bold cursor-pointer"
                    title="تحميل الملف الصوتي بصيغة MP3"
                  >
                    <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>تحميل MP3</span>
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-500 cursor-not-allowed flex items-center gap-1" title="التحميل متاح في الوضع السحابي فقط">
                    <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600" />
                    <span className="hidden sm:inline">التحميل متاح في الوضع السحابي فقط</span>
                    <span className="sm:hidden">السحابي فقط</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] sm:text-xs text-center md:text-right py-2 sm:py-4">
              لم يتم توليد أي مقطع صوتي بعد. اكتب النص بالأعلى ثم اضغط تشغيل.
            </div>
          )}
        </div>

        {/* Center: Master Trigger Generate Complete Dialogue */}
        <div className="flex-shrink-0">
          <button
            id="btn-generate-dialogue"
            disabled={isLoading}
            onClick={generateCompleteDialogue}
            className="w-full md:w-auto px-4 sm:px-8 py-2.5 sm:py-4 bg-white hover:bg-slate-100 disabled:bg-slate-400 disabled:cursor-not-allowed text-slate-950 font-black text-xs sm:text-md md:text-lg rounded-xl sm:rounded-2xl shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-2 sm:gap-3 active:scale-[0.98] cursor-pointer"
          >
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-600" />
            </div>
            <span className="truncate">توليد الحوار كامل {voiceEngine === "browser" && "(محلياً)"}</span>
          </button>
        </div>

        {/* Right Side: Format info */}
        <div className="flex-1 justify-end items-center gap-4 hidden md:flex">
          <div className="flex flex-col items-end">
            <p className="text-[10px] text-slate-400">تنسيق مخرج الصوت الحالي</p>
            <p className="text-xs font-bold text-slate-200">
              {voiceEngine === "cloud" ? "WAVE @ 24kHz Mono" : "متحدث المتصفح (مباشر)"}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
            <Music className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

      </footer>

    </div>
  );
}
