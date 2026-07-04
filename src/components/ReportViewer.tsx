import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Play, Pause, AlertTriangle, CheckCircle, Volume2, ShieldAlert, Download, Calendar, ExternalLink, ChevronDown, Send, Bot, RefreshCw } from "lucide-react";
import { ReportMetadata } from "../types";

interface ReportViewerProps {
  report: ReportMetadata;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const [activeTab, setActiveTab] = useState<"analysis" | "summary" | "tutor">("analysis");
  const [markdown, setMarkdown] = useState<string>("");
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Chatbot State Variables
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const useSynthRef = useRef<boolean>(false);
  const synthTextLengthRef = useRef<number>(0);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  // Setup client-side Web Speech API fallback
  const setupSpeechSynthesisFallback = () => {
    window.speechSynthesis.cancel();
    useSynthRef.current = true;

    const textToSpeak = report.speechText || (report.briefingSummary
      ? report.briefingSummary.replace(/<br\s*\/?>/gi, " ").replace(/[*_#`~]/g, "").trim()
      : `Executive research summary for ${report.topic}.`);
    
    synthTextLengthRef.current = textToSpeak.length;
    const words = textToSpeak.split(/\s+/).length;
    const estimatedDuration = words / 2.5; 
    setDuration(estimatedDuration);
    setCurrentTime(0);

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = playbackSpeed;
    
    utterance.onboundary = (event) => {
      if (useSynthRef.current && event.name === "word") {
        const charIndex = event.charIndex;
        const progress = charIndex / synthTextLengthRef.current;
        setCurrentTime(progress * estimatedDuration);
      }
    };

    utterance.onend = () => {
      if (useSynthRef.current) {
        setIsPlaying(false);
        setCurrentTime(estimatedDuration);
      }
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
  };

  // Fetch report markdown on selection
  useEffect(() => {
    setIsLoadingMarkdown(true);
    setMarkdown("");
    setActiveTab("analysis"); // Reset to main analysis on change
    
    // Reset player states
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    useSynthRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (report.markdownContent) {
      setMarkdown(report.markdownContent);
      setIsLoadingMarkdown(false);
      return;
    }

    const token = localStorage.getItem("argus_auth_token");
    fetch(`/api/reports/${report.id}/markdown`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve report.");
        return res.text();
      })
      .then((text) => {
        setMarkdown(text);
        setIsLoadingMarkdown(false);
      })
      .catch((err) => {
        console.error(err);
        setMarkdown(`### Failed to load report body.\n\nCould not fetch technical content from server. Please trigger a new research or check configuration.`);
        setIsLoadingMarkdown(false);
      });
  }, [report]);

  // Load chat history for research report
  useEffect(() => {
    setChatMessages([]);
    setChatError(null);
    if (report && report.id && !report.type) {
      const token = localStorage.getItem("argus_auth_token");
      fetch(`/api/research/chat-history/${report.id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.messages) {
            setChatMessages(data.messages);
          }
        })
        .catch((err) => {
          console.error("Failed to load research chat history:", err);
        });
    }
  }, [report, activeTab]);

  // Scroll chat to bottom on changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  const handleSendChat = async (messageText: string) => {
    if (!report || !messageText.trim() || isSendingChat) return;

    const userMsg = messageText.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsSendingChat(true);
    setChatError(null);

    try {
      const token = localStorage.getItem("argus_auth_token");
      const res = await fetch("/api/research/tutor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reportId: report.id,
          message: userMsg
        })
      });

      let data: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (jsonErr) {
          console.error("Failed to parse JSON response:", jsonErr);
        }
      } else {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Tutor response failed.");
      }

      setChatMessages((prev) => [...prev, { role: "model", content: data.reply }]);
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || "Tutor failed to respond.");
    } finally {
      setIsSendingChat(false);
    }
  };

  const SUGGESTED_RESEARCH_QUESTIONS = [
    `Summarize the key architectural paradigms of this research.`,
    "What are the main technical conclusions of this research?",
    "Detail any limitations or gaps identified in the compiled references.",
    "Explain the takeaways for engineering applications simply."
  ];

  // Audio elements management
  useEffect(() => {
    if (report.hasAudio) {
      const token = localStorage.getItem("argus_auth_token");
      const audioUrl = `/api/reports/${report.id}/audio?token=${encodeURIComponent(token || "")}`;
      const audio = new Audio(audioUrl);
      
      const onTimeUpdate = () => {
        if (!useSynthRef.current) {
          setCurrentTime(audio.currentTime);
        }
      };
      const onLoadedMetadata = () => {
        if (!useSynthRef.current) {
          setDuration(audio.duration || 0);
        }
      };
      const onEnded = () => {
        if (!useSynthRef.current) {
          setIsPlaying(false);
        }
      };
      const onError = (e: any) => {
        console.warn("Audio element failed to load, using client speech synthesis fallback.", e);
        setupSpeechSynthesisFallback();
      };

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("loadedmetadata", onLoadedMetadata);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      // Apply initial speed
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;

      return () => {
        audio.pause();
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("loadedmetadata", onLoadedMetadata);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
    } else {
      audioRef.current = null;
      setupSpeechSynthesisFallback();
    }
  }, [report]);

  // Cleanup synthesis on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Synchronize playback rate
  useEffect(() => {
    if (useSynthRef.current) {
      if (utteranceRef.current) {
        utteranceRef.current.rate = playbackSpeed;
      }
      if (isPlaying) {
        window.speechSynthesis.cancel();
        const textToSpeak = report.speechText || (report.briefingSummary
          ? report.briefingSummary.replace(/<br\s*\/?>/gi, " ").replace(/[*_#`~]/g, "").trim()
          : `Executive research summary for ${report.topic}.`);
        
        const progressPercent = duration > 0 ? currentTime / duration : 0;
        const startIndex = Math.min(textToSpeak.length - 1, Math.max(0, Math.floor(progressPercent * textToSpeak.length)));
        const remainingText = textToSpeak.substring(startIndex);
        
        const newUtterance = new SpeechSynthesisUtterance(remainingText);
        newUtterance.rate = playbackSpeed;
        
        newUtterance.onboundary = (event) => {
          if (useSynthRef.current && event.name === "word") {
            const charIndex = event.charIndex;
            const progress = (startIndex + charIndex) / textToSpeak.length;
            const wordsCount = textToSpeak.split(/\s+/).length;
            const fullDuration = wordsCount / 2.5;
            setCurrentTime(progress * fullDuration);
          }
        };

        newUtterance.onend = () => {
          if (useSynthRef.current) {
            setIsPlaying(false);
            setCurrentTime(duration);
          }
        };

        newUtterance.onerror = () => setIsPlaying(false);

        utteranceRef.current = newUtterance;
        window.speechSynthesis.speak(newUtterance);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.playbackRate = playbackSpeed;
      }
    }
  }, [playbackSpeed]);

  const togglePlay = () => {
    if (useSynthRef.current) {
      if (isPlaying) {
        window.speechSynthesis.pause();
        setIsPlaying(false);
      } else {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        } else {
          window.speechSynthesis.cancel();
          if (utteranceRef.current) {
            utteranceRef.current.rate = playbackSpeed;
            window.speechSynthesis.speak(utteranceRef.current);
          }
        }
        setIsPlaying(true);
      }
    } else {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch((err) => {
            console.warn("Audio play failed, falling back to speech synthesis.", err);
            useSynthRef.current = true;
            setupSpeechSynthesisFallback();
            if (utteranceRef.current) {
              utteranceRef.current.rate = playbackSpeed;
              window.speechSynthesis.speak(utteranceRef.current);
            }
          });
          setIsPlaying(true);
        }
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    if (useSynthRef.current) {
      setCurrentTime(newTime);
      const textToSpeak = report.speechText || (report.briefingSummary
        ? report.briefingSummary.replace(/<br\s*\/?>/gi, " ").replace(/[*_#`~]/g, "").trim()
        : `Executive research summary for ${report.topic}.`);
      
      const startIndex = Math.min(textToSpeak.length - 1, Math.max(0, Math.floor(percentage * textToSpeak.length)));
      window.speechSynthesis.cancel();
      
      const newUtterance = new SpeechSynthesisUtterance(textToSpeak.substring(startIndex));
      newUtterance.rate = playbackSpeed;
      
      newUtterance.onboundary = (event) => {
        if (useSynthRef.current && event.name === "word") {
          const charIndex = event.charIndex;
          const progress = (startIndex + charIndex) / textToSpeak.length;
          setCurrentTime(progress * duration);
        }
      };

      newUtterance.onend = () => {
        if (useSynthRef.current) {
          setIsPlaying(false);
          setCurrentTime(duration);
        }
      };

      newUtterance.onerror = () => setIsPlaying(false);

      utteranceRef.current = newUtterance;
      if (isPlaying) {
        window.speechSynthesis.speak(newUtterance);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  };

  // Download methods for Analysis and Summaries
  const downloadAnalysisMd = () => {
    const textToDownload = markdown || ``;
    const element = document.createElement("a");
    const file = new Blob([textToDownload], { type: "text/markdown;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `${report.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_analysis.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadAnalysisTxt = () => {
    const textToDownload = markdown || ``;
    const element = document.createElement("a");
    const file = new Blob([textToDownload], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `${report.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_analysis.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadSummaryMd = () => {
    let summaryText = report.briefingSummary || `Executive Summary Brief for: ${report.topic}`;
    summaryText = summaryText.replace(/<br\s*\/?>/gi, "\n\n");
    const element = document.createElement("a");
    const file = new Blob([summaryText], { type: "text/markdown;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `${report.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_executive_summary.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadSummaryTxt = () => {
    let summaryText = report.briefingSummary || `Executive Summary Brief for: ${report.topic}`;
    summaryText = summaryText.replace(/<br\s*\/?>/gi, "\r\n\r\n");
    const element = document.createElement("a");
    const file = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `${report.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_executive_summary.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleExport = (format: "md" | "txt") => {
    setIsDropdownOpen(false);
    if (activeTab === "analysis") {
      if (format === "md") {
        downloadAnalysisMd();
      } else {
        downloadAnalysisTxt();
      }
    } else {
      if (format === "md") {
        downloadSummaryMd();
      } else {
        downloadSummaryTxt();
      }
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  return (
    <div className="flex flex-col h-full bg-bg-custom text-gray-200">
      {/* 1. Header with metadata details */}
      <div className="p-6 border-b border-border-custom bg-[#0C0F13]/80 backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#38BDF8] bg-[#38BDF8]/10 px-2.5 py-1 rounded border border-[#38BDF8]/25">
            Verified Research Node
          </span>
          <h2 className="text-3xl font-serif-editorial font-bold text-white mt-2 tracking-tight leading-snug">
            {report.topic}
          </h2>
          <div className="flex items-center gap-4 text-[11px] text-gray-400 font-mono mt-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              {new Date(report.timestamp).toLocaleString()}
            </span>
            <span className="text-gray-700">|</span>
            <span className="text-[#38BDF8]">NODE_ID: {report.id}</span>
          </div>
        </div>

        {/* Dropdown for selectable formats */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold text-white rounded-md bg-[#16181D] hover:bg-[#202328] border border-border-custom hover:border-gray-500 transition-colors cursor-pointer self-start md:self-auto"
          >
            <Download className="w-4 h-4 text-[#38BDF8]" />
            EXPORT {activeTab === "analysis" ? "ANALYSIS" : "SUMMARY"}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-48 rounded-md bg-[#16181D] border border-border-custom shadow-xl z-50 overflow-hidden font-mono text-xs">
              <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-border-custom bg-[#0C0F13]/40">
                Select Format
              </div>
              <button
                onClick={() => handleExport("md")}
                className="w-full text-left px-4 py-2.5 text-gray-200 hover:bg-[#1E293B] hover:text-white transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>Markdown File</span>
                <span className="text-[10px] text-[#38BDF8] font-bold bg-[#38BDF8]/10 px-1 py-0.5 rounded">.md</span>
              </button>
              <button
                onClick={() => handleExport("txt")}
                className="w-full text-left px-4 py-2.5 text-gray-200 hover:bg-[#1E293B] hover:text-white transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>Plain Text File</span>
                <span className="text-[10px] text-gray-400 font-bold bg-gray-400/10 px-1 py-0.5 rounded">.txt</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Media Player Console widget */}
      {(report.hasAudio || report.briefingSummary) && (
        <div className="p-5 bg-[#16181D] border-b border-border-custom flex flex-col md:flex-row items-center justify-between gap-6 px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="p-3.5 rounded-full bg-[#38BDF8] hover:bg-[#38BDF8]/90 text-black shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center justify-center animate-none"
              id="audio-play-button"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
            </button>
            <div>
              <div className="text-xs font-mono font-bold text-[#38BDF8] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                Vocal Readout briefing
              </div>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                Neural Speaker Speech Synthesis
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-lg w-full flex items-center gap-3">
            <span className="text-[10px] font-mono text-gray-400">{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              onClick={handleSeek}
              className="relative h-1 flex-1 rounded bg-[#2D3139] cursor-pointer overflow-hidden group hover:h-2 transition-all"
              id="audio-seek-progress"
            >
              <div
                className="absolute inset-y-0 left-0 bg-[#38BDF8] rounded transition-all"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-400">{formatTime(duration || 0)}</span>
            
            {/* Added: Audio remaining duration badge as requested */}
            <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30 whitespace-nowrap">
              -{formatTime(Math.max(0, duration - currentTime))} left
            </span>
          </div>

          {/* Speed variation controls as options for playback rate variations */}
          <div className="flex items-center gap-1.5 bg-[#0D0F13] px-2 py-1.5 rounded-md border border-border-custom self-stretch md:self-auto justify-center">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold mr-1">Speed:</span>
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded cursor-pointer transition-all ${
                  playbackSpeed === speed
                    ? "bg-[#38BDF8] text-black"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                id={`playback-speed-${speed}`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Equalizer graph to show synthesis */}
          <div className="flex items-center gap-0.5 h-6 hidden lg:flex">
            {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
              <div
                key={bar}
                className="w-1 bg-[#38BDF8]/60 rounded-t"
                style={{
                  height: isPlaying ? `${Math.floor(Math.random() * 20) + 6}px` : "4px",
                  transition: "height 150ms ease-in-out",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Dual-Panel Output display */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden h-full">
        {/* Left Side: Markdown Preview Canvas */}
        <div className="lg:col-span-8 flex flex-col overflow-visible lg:overflow-hidden border-r border-[#2D3139]/30 lg:border-r-[#2D3139] bg-[#0A0B0E]">
          {/* Dynamic Tabs Indicator Bar */}
          <div className="flex bg-[#0D0F13] px-6 border-b border-border-custom gap-2 select-none">
            <button
              onClick={() => setActiveTab("analysis")}
              className={`px-4 py-3.5 text-[11px] font-mono tracking-wider font-bold uppercase transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === "analysis"
                  ? "border-[#38BDF8] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "analysis" ? "bg-[#38BDF8]" : "bg-transparent border border-gray-600"}`} />
              📄 Analysis Report
            </button>
            <button
              onClick={() => setActiveTab("summary")}
              className={`px-4 py-3.5 text-[11px] font-mono tracking-wider font-bold uppercase transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === "summary"
                  ? "border-[#38BDF8] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "summary" ? "bg-[#38BDF8]" : "bg-transparent border border-gray-600"}`} />
              🔊 Executive Audio Summary
            </button>
            <button
              onClick={() => setActiveTab("tutor")}
              className={`px-4 py-3.5 text-[11px] font-mono tracking-wider font-bold uppercase transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === "tutor"
                  ? "border-[#38BDF8] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "tutor" ? "bg-[#38BDF8]" : "bg-transparent border border-gray-600"}`} />
              💬 Research Tutor
            </button>
          </div>

          <div className="flex-1 p-6 sm:p-8 md:p-10 overflow-visible lg:overflow-y-auto custom-scroll">
            {isLoadingMarkdown ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-6 w-3/4 bg-[#16181D] rounded"></div>
                <div className="h-4 w-1/2 bg-[#16181D] rounded"></div>
                <div className="space-y-2 pt-4">
                  <div className="h-4 bg-[#16181D] rounded"></div>
                  <div className="h-4 bg-[#16181D] rounded"></div>
                  <div className="h-4 bg-[#16181D] rounded w-5/6"></div>
                </div>
              </div>
            ) : activeTab === "analysis" ? (
              <div className="prose prose-invert max-w-none leading-relaxed text-gray-300 font-sans selection:bg-[#38BDF8]/20 selection:text-white markdown-body">
                {/* Ensure standard Playfair font style is applied to rendered Markdown headers */}
                <ReactMarkdown
                  components={{
                    h1: ({ node, ...props }) => <h1 className="font-serif-editorial text-3xl text-white font-bold tracking-tight mb-6 mt-4 border-b border-border-custom pb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="font-serif-editorial text-2xl text-white font-semibold tracking-tight mt-8 mb-4 border-b border-border-custom pb-1.5" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="font-sans font-semibold text-lg text-white mt-6 mb-3" {...props} />,
                    p: ({ node, ...props }) => <p className="text-gray-350 text-[15px] mb-4/5 leading-relaxed font-normal" {...props} />,
                    a: ({ node, ...props }) => <a className="text-[#38BDF8] hover:underline hover:text-[#58cbfd] transition-colors" {...props} />,
                    li: ({ node, ...props }) => <li className="text-[14.5px] text-gray-350 ml-4 list-disc mt-1" {...props} />,
                    ul: ({ node, ...props }) => <ul className="mb-4" {...props} />,
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            ) : activeTab === "summary" ? (
              <div className="prose prose-invert max-w-none leading-relaxed text-gray-300 font-sans selection:bg-[#38BDF8]/20 selection:text-white">
                <h3 className="font-serif-editorial text-3xl text-white font-bold tracking-tight mb-4 pb-2 border-b border-border-custom">
                  Vocal Briefing Script & Key Insights
                </h3>
                <div className="p-5 rounded-lg bg-[#16181D]/30 border border-border-custom/50 font-sans text-gray-300 italic leading-relaxed text-[15px] mb-6 shadow-sm">
                  "This audio summary was synthesized using high-fidelity prebuilt neural components specifically tuned for fluent speech narration."
                </div>
                
                <ReactMarkdown
                  components={{
                    h1: ({ node, ...props }) => <h1 className="font-serif-editorial text-2xl text-white font-bold tracking-tight mb-5 border-b border-border-custom pb-2" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="font-mono text-xs uppercase tracking-wider text-[#38BDF8] font-bold mt-6 mb-2 border-l-2 border-[#38BDF8] pl-2.5" {...props} />,
                    p: ({ node, ...props }) => <p className="text-gray-300 text-[14px] mb-4 leading-relaxed font-normal" {...props} />,
                  }}
                >
                  {report.briefingSummary
                    ? report.briefingSummary.replace(/<br\s*\/?>/gi, "\n\n")
                    : `Executive research summary for research study: "${report.topic}".`}
                </ReactMarkdown>

                {report.briefingSummary && (
                  <div className="mt-8 pt-6 border-t border-border-custom/40 flex flex-wrap gap-4 items-center">
                    <button
                      onClick={togglePlay}
                      className="px-4 py-2 border border-border-custom text-[11px] font-mono tracking-wider font-bold text-[#38BDF8] hover:bg-[#16181D] rounded transition-all cursor-pointer flex items-center gap-2"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isPlaying ? "PAUSE AUDIO SUMMARY" : "PLAY AUDIO SUMMARY"}
                    </button>
                    <button
                      onClick={downloadSummaryTxt}
                      className="px-4 py-2 bg-[#16181D] hover:bg-[#202328] border border-border-custom text-[11px] font-mono tracking-wider font-bold text-white rounded transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
                      DOWNLOAD EXECUTIVE SUMMARY (.TXT)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Tutor Mode Chat Interface */
              <div className="flex flex-col h-[600px] lg:h-full bg-bg-custom overflow-hidden">
                <div className="p-4 bg-[#16181D]/30 border border-border-custom/50 rounded-lg flex items-start gap-3 m-6 shadow-sm mb-2 shrink-0">
                  <Bot className="w-5 h-5 text-[#38BDF8] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">ARGUS INTELLIGENCE TUTOR ACTIVE</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                      Ask follow-up questions about this compiled research portfolio. The bot is grounded in the full report details and executive briefing summaries.
                    </p>
                  </div>
                </div>

                {/* Chat message register */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scroll bg-[#090B0F]/45 min-h-[300px]">
                  {/* Initial tutor welcome message */}
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-[#38BDF8]" />
                    </div>
                    <div className="p-3.5 rounded bg-[#16181D]/60 border border-border-custom max-w-[85%] text-xs text-gray-300 leading-relaxed font-sans shadow-sm">
                      Hello! I am your dedicated sandbox tutor for this research. Ask me follow-up questions about the methodology, key findings, architectural details, or future scopes.
                    </div>
                  </div>

                  {chatMessages.map((msg, index) => {
                    const isUser = msg.role === "user";
                    const UserIcon = () => (
                      <svg className="w-4 h-4 text-[#38BDF8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    );
                    return (
                      <div key={index} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                        <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 bg-[#38BDF8]/10 border border-[#38BDF8]/25`}>
                          {isUser ? <UserIcon /> : <Bot className="w-4 h-4 text-[#38BDF8]" />}
                        </div>
                        <div className={`p-3.5 rounded max-w-[85%] text-xs leading-relaxed font-sans shadow-sm border ${
                          isUser 
                            ? "bg-[#1E293B]/45 border-[#38BDF8]/15 text-white" 
                            : "bg-[#16181D]/60 border-border-custom text-gray-300"
                        }`}>
                          <ReactMarkdown>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                  
                  {isSendingChat && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded bg-[#38BDF8]/10 border border-[#38BDF8]/25 flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 text-[#38BDF8]" />
                      </div>
                      <div className="p-3.5 rounded bg-[#16181D]/40 border border-border-custom max-w-[85%] text-xs text-gray-500 leading-relaxed font-mono flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#38BDF8]" />
                        Tutor is reading research context...
                      </div>
                    </div>
                  )}

                  {chatError && (
                    <div className="p-3 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-300">
                      {chatError}
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Suggestion buttons */}
                {chatMessages.length === 0 && (
                  <div className="px-6 py-2.5 border-t border-border-custom/50 bg-[#0C0F13]/40 flex flex-wrap gap-2 shrink-0 select-none">
                    {SUGGESTED_RESEARCH_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(q)}
                        className="p-1.5 px-3 border border-[#2D3139] hover:border-[#38BDF8]/40 text-gray-400 hover:text-[#38BDF8] transition-all font-sans text-[10px] rounded cursor-pointer leading-tight text-left max-w-xs"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat entry bar */}
                <div className="p-4 bg-[#0C0F13] border-t border-border-custom flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    placeholder="Ask follow-up questions about this research..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendChat(chatInput);
                    }}
                    disabled={isSendingChat}
                    className="flex-1 h-11 bg-[#16181D] border border-[#2D3139] rounded px-4 text-xs text-white focus:outline-none focus:border-[#38BDF8]/50 placeholder:text-gray-600 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleSendChat(chatInput)}
                    disabled={isSendingChat || !chatInput.trim()}
                    className="h-11 w-11 bg-[#38BDF8] hover:bg-[#38BDF8]/90 disabled:opacity-40 disabled:pointer-events-none rounded text-black transition-all cursor-pointer flex items-center justify-center flex-shrink-0"
                  >
                    <Send className="w-4 h-4 fill-black" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Transparency Auditing Panel */}
        <div className="lg:col-span-4 p-6 bg-[#0D0F13] overflow-visible lg:overflow-y-auto flex flex-col gap-6 custom-scroll border-t lg:border-t-0 border-[#2D3139]">
          <div>
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-orange-500" />
              CRITICAL AUDITOR: SOURCE DISCARD LOG
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Live web intelligence nodes evaluated by semantic integrity parameters.
            </p>
          </div>

          {/* Approved Nodes */}
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-emerald-400 font-bold border-b border-[#2D3139] pb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              VETTED SOURCES ({report.filteredResearch?.length || 0})
            </div>
            {report.filteredResearch && report.filteredResearch.length > 0 ? (
              report.filteredResearch.map((src, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-lg bg-[#16181D]/40 border border-emerald-900/30 hover:border-emerald-800/40 transition-colors flex items-start justify-between gap-3 h-auto"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-emerald-450 truncate">{src.title}</div>
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{src.url}</div>
                  </div>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-emerald-900/40 text-[#38BDF8] transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 italic px-1 font-mono">Zero authenticated indexes.</div>
            )}
          </div>

          {/* Dropped Nodes */}
          <div className="space-y-3 pt-2">
            <div className="text-[10px] font-mono text-orange-400 font-bold border-b border-[#2D3139] pb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              REMOVED DISCARD NODES ({report.removedSources?.length || 0})
            </div>
            {report.removedSources && report.removedSources.length > 0 ? (
              report.removedSources.map((src, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg bg-red-950/5 border border-red-900/20 flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-red-400 line-clamp-1">{src.title}</div>
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">{src.url}</div>
                    </div>
                  </div>
                  <div className="text-xs border-l-2 border-red-500/30 pl-3 text-gray-300">
                    <span className="font-mono font-bold text-red-450 mr-1 text-[11px]">REASON:</span>
                    {src.reason}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 italic px-1 font-mono">No discarded references.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
