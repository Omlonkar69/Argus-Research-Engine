import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { 
  FileText, 
  UploadCloud, 
  Send, 
  Cpu, 
  BookOpen, 
  HelpCircle, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Sparkles,
  ArrowRight,
  User,
  Bot
} from "lucide-react";
import { ReportMetadata } from "../types";

interface PdfAnalystProps {
  activeAnalysis: ReportMetadata | null;
  onAnalysisSuccess: (metadata: ReportMetadata) => void;
}

export default function PdfAnalyst({ activeAnalysis, onAnalysisSuccess }: PdfAnalystProps) {
  // Upload inputs
  const [file, setFile] = useState<File | null>(null);
  const [projectTag, setProjectTag] = useState("ISL");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  
  // Status states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Awaiting file selection...");

  // Tutor Chat states
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Sync chat history when active analysis changes
  useEffect(() => {
    if (activeAnalysis && activeAnalysis.type === "pdf_analysis") {
      setChatMessages([]);
      setChatError(null);
      
      const token = localStorage.getItem("argus_auth_token");
      fetch(`/api/pdf/chat-history/${activeAnalysis.id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.messages) {
            setChatMessages(data.messages);
          }
        })
        .catch((err) => {
          console.error("Failed to load chat history:", err);
        });
    }
  }, [activeAnalysis]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setAnalysisError(null);
    }
  };

  const convertBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsDataURL(file);
      fileReader.onload = () => {
        // Strip data:application/pdf;base64, from head
        const base64Str = (fileReader.result as string).split(",")[1];
        resolve(base64Str);
      };
      fileReader.onerror = (error) => {
        reject(error);
      };
    });
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setStatusMessage("Reading file into buffer...");

    try {
      const base64Data = await convertBase64(file);
      setStatusMessage("Dispatching document to Gemini Multi-Modal Analyst...");

      const token = localStorage.getItem("argus_auth_token");
      const res = await fetch("/api/pdf/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          projectTag: projectTag.trim(),
          year: year.trim(),
          fileData: base64Data
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setStatusMessage("Extraction completed successfully!");
      setIsAnalyzing(false);
      setFile(null);
      onAnalysisSuccess(data);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || "Failed to analyze paper.");
      setIsAnalyzing(false);
    }
  };

  const handleSendChat = async (messageText: string) => {
    if (!activeAnalysis || !messageText.trim() || isSendingChat) return;

    const userMsg = messageText.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsSendingChat(true);
    setChatError(null);

    try {
      const token = localStorage.getItem("argus_auth_token");
      const res = await fetch("/api/pdf/tutor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reportId: activeAnalysis.id,
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

  // Quick suggestions
  const SUGGESTED_QUESTIONS = [
    "Summarize the key findings of this paper.",
    "Detail the specific details of solution.",
    "Explain the research methodology simply.",
    "What are the main limitations described?"
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-custom text-gray-200">
      
      {/* HEADER SECTION */}
      <div className="p-6 border-b border-border-custom bg-[#0C0F13]/80 backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#38BDF8] bg-[#38BDF8]/10 px-2.5 py-1 rounded border border-[#38BDF8]/25">
            PDF Research Paper Analyst
          </span>
          <h2 className="text-3xl font-serif-editorial font-bold text-white mt-2 tracking-tight leading-snug">
            {activeAnalysis ? activeAnalysis.topic : "Literature review sandbox"}
          </h2>
          <div className="text-[11px] text-gray-400 font-mono mt-1">
            {activeAnalysis 
              ? `FILE: ${activeAnalysis.fileName} | ID: ${activeAnalysis.id}`
              : "Upload a research paper PDF to run literature review extraction & launch tutoring sandbox."
            }
          </div>
        </div>
      </div>

      {/* VIEW A: UPLOADER INTERFACE */}
      {!activeAnalysis && !isAnalyzing && (
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
          <div className="max-w-md w-full flex flex-col gap-6 bg-[#0D0F13] border border-border-custom p-8 rounded-xl shadow-2xl relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#38BDF8]/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="text-center space-y-2">
              <div className="inline-flex p-3.5 bg-[#16181D] border border-border-custom rounded-full text-[#38BDF8] mb-2">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-serif-editorial font-bold text-white">Upload Research Paper</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Provide the PDF document. We will name the chat title according to the tag and publication year.
              </p>
            </div>

            {/* Inputs grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
                  Project Tag
                </label>
                <input
                  type="text"
                  placeholder="e.g. ISL"
                  value={projectTag}
                  onChange={(e) => setProjectTag(e.target.value)}
                  className="w-full px-3 py-2 bg-[#16181D] border border-[#2D3139] hover:border-gray-500 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-mono font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
                  Publication Year
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2024"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3 py-2 bg-[#16181D] border border-[#2D3139] hover:border-gray-500 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-mono font-bold"
                />
              </div>
            </div>

            {/* Dropzone */}
            <div className="relative border border-dashed border-[#2D3139] hover:border-[#38BDF8]/40 bg-[#16181D]/30 hover:bg-[#16181D]/50 rounded-lg p-6 text-center transition-all cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <FileText className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <span className="text-xs font-mono text-gray-300 block truncate px-4">
                {file ? file.name : "Select PDF Document (Max 25MB)"}
              </span>
              <span className="text-[10px] text-gray-500 block mt-1">
                Only PDF file formats supported
              </span>
            </div>

            {analysisError && (
              <div className="p-3 bg-red-950/20 border border-red-900/30 rounded text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            <button
              onClick={handleUploadAndAnalyze}
              disabled={!file || !projectTag.trim() || !year.trim()}
              className="w-full py-3 bg-[#38BDF8] hover:bg-[#58cbfd] disabled:opacity-40 disabled:pointer-events-none text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              RUN PAPER EXTRACTION
              <ArrowRight className="w-3.5 h-3.5 fill-black" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW B: LOADING SCREEN */}
      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0A0B0E]">
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="relative flex items-center justify-center w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-[#38BDF8]/10"></div>
              <div className="absolute inset-0 rounded-full border-2 border-t-[#38BDF8] animate-spin"></div>
              <Cpu className="w-6 h-6 text-[#38BDF8] animate-pulse" />
            </div>
            
            <div>
              <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-[#38BDF8]">
                PARSING RESEARCH PAPER
              </h4>
              <p className="text-sm text-gray-300 mt-2 font-medium leading-relaxed">
                {statusMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW C: ANALYSIS DISPLAY & INTERACTIVE TUTOR CHAT DISPLAY */}
      {activeAnalysis && activeAnalysis.type === "pdf_analysis" && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto lg:overflow-hidden h-full">
          
          {/* Left Column: Extraction Schema display */}
          <div className="lg:col-span-6 flex flex-col h-[500px] lg:h-full border-r border-[#2D3139] bg-[#0A0B0E] min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="p-4 px-6 border-b border-border-custom bg-[#0D0F13] flex items-center gap-2 shrink-0 select-none">
              <BookOpen className="w-4 h-4 text-[#38BDF8]" />
              <span className="text-[11px] font-mono tracking-wider font-bold uppercase text-white">
                EXTRACTED LITERATURE REVIEW SCHEMA
              </span>
            </div>

            <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scroll">
              <div className="prose prose-invert max-w-none leading-relaxed text-gray-300 font-sans selection:bg-[#38BDF8]/20 selection:text-white markdown-body">
                <ReactMarkdown
                  components={{
                    h1: ({ node, ...props }) => <h1 className="font-serif-editorial text-2xl text-white font-bold tracking-tight mb-5 border-b border-border-custom pb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="font-serif-editorial text-xl text-white font-semibold tracking-tight mt-6 mb-4 border-b border-[#2D3139]/40 pb-1" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="font-mono text-xs uppercase tracking-wider text-[#38BDF8] font-bold mt-6 mb-2 border-l-2 border-[#38BDF8] pl-2.5" {...props} />,
                    p: ({ node, ...props }) => <p className="text-gray-350 text-[14px] mb-4 leading-relaxed" {...props} />,
                    a: ({ node, ...props }) => <a className="text-[#38BDF8] hover:underline" {...props} />,
                    li: ({ node, ...props }) => <li className="text-[14px] text-gray-350 ml-4 list-disc mt-1" {...props} />,
                  }}
                >
                  {activeAnalysis.analysis || ""}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Right Column: Tutoring Chat Interface */}
          <div className="lg:col-span-6 flex flex-col h-[500px] lg:h-full bg-[#0D0F13] min-h-0 overflow-hidden">
            
            {/* Chat header */}
            <div className="p-4 px-6 border-b border-border-custom bg-[#0C0F13] flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#10B981]" />
                <div>
                  <span className="text-[11px] font-mono tracking-wider font-bold uppercase text-white block">
                    INTERACTIVE SANDBOX TUTOR
                  </span>
                  <span className="text-[9px] text-[#10B981] font-mono uppercase tracking-widest font-bold">
                    TUTOR_MODE: ON_DEMAND_GROUNDING
                  </span>
                </div>
              </div>
            </div>

            {/* Chat message register */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 custom-scroll bg-[#090B0F]/45">
              
              {/* Initial tutor welcome message */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded bg-[#10B981]/10 border border-[#10B981]/25 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-[#10B981]" />
                </div>
                <div className="p-3.5 rounded bg-[#16181D]/60 border border-border-custom max-w-[85%] text-xs text-gray-300 leading-relaxed font-sans shadow-sm">
                  Hello! I am your dedicated sandbox tutor for this research paper. Ask me follow-up questions about its methodology, results, equations, or architecture. I am strictly grounded in the document text.
                </div>
              </div>

              {chatMessages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div key={index} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                      isUser 
                        ? "bg-[#38BDF8]/10 border border-[#38BDF8]/25" 
                        : "bg-[#10B981]/10 border border-[#10B981]/25"
                    }`}>
                      {isUser ? <User className="w-4 h-4 text-[#38BDF8]" /> : <Bot className="w-4 h-4 text-[#10B981]" />}
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
                  <div className="w-7 h-7 rounded bg-[#10B981]/10 border border-[#10B981]/25 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-[#10B981]" />
                  </div>
                  <div className="p-3.5 rounded bg-[#16181D]/40 border border-border-custom max-w-[85%] text-xs text-gray-500 leading-relaxed font-mono flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#10B981]" />
                    Tutor is reading paper context...
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
              <div className="px-5 py-2.5 border-t border-border-custom/50 bg-[#0C0F13]/40 flex flex-wrap gap-2 shrink-0 select-none">
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendChat(q)}
                    className="p-1.5 px-3 border border-[#2D3139] hover:border-[#10B981]/40 text-gray-400 hover:text-[#10B981] transition-all font-sans text-[10px] rounded cursor-pointer leading-tight text-left max-w-xs"
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
                placeholder="Ask follow-up questions about this research paper..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChat(chatInput);
                }}
                disabled={isSendingChat}
                className="flex-1 h-11 bg-[#16181D] border border-[#2D3139] rounded px-4 text-xs text-white focus:outline-none focus:border-[#10B981]/50 placeholder:text-gray-600 disabled:opacity-50"
              />
              <button
                onClick={() => handleSendChat(chatInput)}
                disabled={isSendingChat || !chatInput.trim()}
                className="h-11 w-11 bg-[#10B981] hover:bg-[#10B981]/90 disabled:opacity-40 disabled:pointer-events-none rounded text-black transition-all cursor-pointer flex items-center justify-center flex-shrink-0"
              >
                <Send className="w-4 h-4 fill-black" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
