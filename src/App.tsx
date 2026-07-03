import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { 
  Terminal, 
  Search, 
  Sparkles, 
  ShieldAlert, 
  Bot, 
  Network, 
  PenTool, 
  XOctagon, 
  FolderGit2, 
  Flame, 
  ArrowRight,
  RefreshCw,
  Clock,
  ShieldCheck,
  Smartphone,
  Lock,
  Key,
  CheckCircle2,
  X,
  AlertTriangle,
  Menu,
  FileText
} from "lucide-react";
import { ReportMetadata } from "./types";
import ReportViewer from "./components/ReportViewer";
import { 
  db, 
  auth, 
  handleFirestoreError, 
  OperationType,
  onAuthStateChanged, 
  multiFactor, 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator, 
  RecaptchaVerifier,
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc 
} from "./lib/firebase";
import AuthPage from "./components/AuthPage";
import PdfAnalyst from "./components/PdfAnalyst";


const AGENT_SEQUENCE = [
  { key: "Orchestrator", number: "01", label: "Trigger", icon: Network, desc: "Booting state orchestrator mapping." },
  { key: "Researcher", number: "02", label: "Research", icon: Search, desc: "Parallel queries with Search filters." },
  { key: "Critic", number: "03", label: "Critic", icon: ShieldAlert, desc: "Auditing credibility & authority indices." },
  { key: "Writer", number: "04", label: "Writer", icon: PenTool, desc: "Synthesizing portfolio with citations." },
  { key: "Audio Engine", number: "05", label: "Voice", icon: Sparkles, desc: "Regex speech synthesis post-processing." }
];

export default function App() {
  const [reports, setReports] = useState<ReportMetadata[]>([]);
  const [activeReport, setActiveReport] = useState<ReportMetadata | null>(null);
  const [activeView, setActiveView] = useState<"research" | "pdf">("research");
  
  // Auth state tracking
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [enrolledFactors, setEnrolledFactors] = useState<any[]>([]);

  // SMS MFA Control states
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [mfaPhoneNumber, setMfaPhoneNumber] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaStatusMsg, setMfaStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isMfaActionLoading, setIsMfaActionLoading] = useState(false);

  // Searching/Research Core States
  const [searchTopic, setSearchTopic] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Streaming Stats
  const [timelineLogs, setTimelineLogs] = useState<{ id: string; agent: string; message: string; timestamp: string }[]>([]);
  const [activeAgent, setActiveAgent] = useState("Orchestrator");
  const [activeStep, setActiveStep] = useState("Bootstrapping");
  const [progressMessage, setProgressMessage] = useState("Preparing state network interfaces...");
  const [rawVettedLinks, setRawVettedLinks] = useState<{ title: string; url: string }[]>([]);
  const [approvedLinks, setApprovedLinks] = useState<{ title: string; url: string }[]>([]);
  const [removedLinks, setRemovedLinks] = useState<{ title: string; url: string; reason: string }[]>([]);
  const [criticAuditedCounts, setCriticAuditedCounts] = useState({ approved: 0, removed: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([
    "Quantum Computing Shor Algorithm Decryption Paradigms",
    "CRISPR Prime Editing vs Base Editing Dual Comparison",
    "Next-Gen Solid-State Lithium Battery Electrolytes",
    "Llama 3 Attention Layers Keys-Values Cache Mechanics"
  ]);

  useEffect(() => {
    fetch("/api/research/suggested-topics")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const shuffled = [...data].sort(() => 0.5 - Math.random());
          setSuggestedTopics(shuffled.slice(0, 4));
        }
      })
      .catch((err) => {
        console.error("Failed to load suggested topics:", err);
      });
  }, []);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Sync Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setEnrolledFactors(multiFactor(firebaseUser).enrolledFactors || []);
      } else {
        setUser(null);
        setEnrolledFactors([]);
        setActiveView("research");
        setActiveReport(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Reports list from backend specific to this authenticated user
  useEffect(() => {
    if (!user) {
      setReports([]);
      return;
    }
    fetchReports();
  }, [user]);

  // ==========================================
  // SMS MFA MANAGEMENT ACTIONS
  // ==========================================
  const handleMfaEnrollSend = async () => {
    if (!auth.currentUser) return;
    if (!mfaPhoneNumber) {
      setMfaStatusMsg({ type: "error", text: "Please enter a valid phone number with country code (e.g. +14155552671)." });
      return;
    }
    setMfaStatusMsg(null);
    setIsMfaActionLoading(true);
    try {
      const verifier = new RecaptchaVerifier(auth, "mfa-enroll-recaptcha-container", {
        size: "invisible",
      });
      const mUser = multiFactor(auth.currentUser);
      const session = await mUser.getSession();
      
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber({
        phoneNumber: mfaPhoneNumber,
        session
      }, verifier);
      setMfaVerificationId(verificationId);
      setMfaStatusMsg({ type: "success", text: "Verification code sent to " + mfaPhoneNumber });
    } catch (err: any) {
      console.error("SMS dispatch error:", err);
      setMfaStatusMsg({ type: "error", text: "Failed to dispatch SMS: " + err.message });
    } finally {
      setIsMfaActionLoading(false);
    }
  };

  const handleMfaEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !mfaVerificationId || !mfaCode) return;
    setMfaStatusMsg(null);
    setIsMfaActionLoading(true);
    try {
      const cred = PhoneAuthProvider.credential(mfaVerificationId, mfaCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      
      const mUser = multiFactor(auth.currentUser);
      await mUser.enroll(assertion, "SMS Secure Key");
      
      // Update state
      setEnrolledFactors(multiFactor(auth.currentUser).enrolledFactors || []);
      setMfaCode("");
      setMfaVerificationId(null);
      setMfaPhoneNumber("");
      setMfaStatusMsg({ type: "success", text: "SMS Multi-Factor Authentication successfully ENABLED!" });
    } catch (err: any) {
      console.error("Enrollment error:", err);
      setMfaStatusMsg({ type: "error", text: "Verification failed: " + err.message });
    } finally {
      setIsMfaActionLoading(false);
    }
  };

  const handleMfaUnenroll = async (factorInfo: any) => {
    if (!auth.currentUser) return;
    if (!confirm("Are you sure you want to disable SMS Multi-factor authentication? This weakens your account security.")) return;
    setMfaStatusMsg(null);
    setIsMfaActionLoading(true);
    try {
      const mUser = multiFactor(auth.currentUser);
      await mUser.unenroll(factorInfo);
      
      // Update state
      setEnrolledFactors(multiFactor(auth.currentUser).enrolledFactors || []);
      setMfaStatusMsg({ type: "success", text: "SMS Multi-Factor Authentication successfully DISABLED." });
    } catch (err: any) {
      console.error("Unenrollment error:", err);
      setMfaStatusMsg({ type: "error", text: "Failed to disable MFA: " + err.message });
    } finally {
      setIsMfaActionLoading(false);
    }
  };

  // Scroll terminal logs automatically
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [timelineLogs]);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("argus_auth_token");
      const res = await fetch("/api/reports", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch reports: ${res.status}`);
      }
      const list = await res.json();
      setReports(list);
    } catch (err) {
      console.error("Could not fetch reports list:", err);
    }
  };

  const handleLaunchResearch = (topicText: string) => {
    if (!topicText.trim()) return;
    
    // Clear previous stream states
    setSearchError(null);
    setTimelineLogs([]);
    setRawVettedLinks([]);
    setApprovedLinks([]);
    setRemovedLinks([]);
    setCriticAuditedCounts({ approved: 0, removed: 0 });
    setActiveAgent("Orchestrator");
    setActiveStep("Activation");
    setProgressMessage("Spawning processes...");
    setIsSearching(true);
    setActiveReport(null);

    const token = localStorage.getItem("argus_auth_token");
    const eventSource = new EventSource(`/api/research/stream?topic=${encodeURIComponent(topicText)}&token=${encodeURIComponent(token || "")}`);

    eventSource.addEventListener("log", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setTimelineLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            agent: data.agent || "Orchestrator",
            message: data.message || "",
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
      } catch (err) {
        console.error("Could not parse stream event:", err);
      }
    });

    eventSource.addEventListener("state", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setActiveAgent(data.agent || "Orchestrator");
        setActiveStep(data.step || "");
        setProgressMessage(data.message || "");
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("raw_research", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setRawVettedLinks(data || []);
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("critic_review", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setCriticAuditedCounts({
          approved: data.filteredResearch?.length || 0,
          removed: data.removedSources?.length || 0
        });
        setApprovedLinks(data.filteredResearch || []);
        setRemovedLinks(data.removedSources || []);
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("complete", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        eventSource.close();
        setIsSearching(false);
        
        setActiveReport(data);
        fetchReports();
      } catch (err) {
        console.error(err);
      }
    });

    eventSource.addEventListener("error", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setSearchError(data.message || "An orchestration fault occurred.");
        eventSource.close();
        setIsSearching(false);
      } catch (err) {
        setSearchError("An unexpected system exception occurred.");
        eventSource.close();
        setIsSearching(false);
      }
    });

    // Error safety net (network failure)
    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      setSearchError("Lost gateway connection. Ensure the dev server is active on terminal Port 3000.");
      eventSource.close();
      setIsSearching(false);
    };
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-[#090B0F] text-gray-200">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-[#38BDF8] animate-spin" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#38BDF8] font-bold">Loading Workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={(u) => setUser(u)} />;
  }

  return (
    <div className="flex h-screen w-screen bg-bg-custom text-gray-200 overflow-hidden font-sans select-none">
      
      {/* 1. LEFT SIDEBAR PANEL: Editorial Registry of Portfolios */}
      <div className={`fixed inset-y-0 left-0 w-80 border-r border-border-custom bg-[#090B0F] flex flex-col flex-shrink-0 h-full z-50 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        
        {/* Title / Logo Header */}
        <div className="p-6 border-b border-border-custom flex flex-col gap-3">
          <div className="font-serif-editorial font-bold text-2xl tracking-tight text-white flex items-center justify-between">
            <span>Argus <span className="font-sans font-light text-[11px] text-[#94A3B8] block opacity-60 mt-0.5">/ Research v2.4</span></span>
            {/* Close button inside sidebar on mobile */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-1 text-gray-500 hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-[#94A3B8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
            GRAPH: ENGINE_READY
          </div>
        </div>

        {/* Audit Entry Trigger CTA */}
        <div className="p-4 pb-2">
          <button
            onClick={() => {
              setActiveView("research");
              setActiveReport(null);
              setIsSearching(false);
              setSearchTopic("");
              setIsSidebarOpen(false);
            }}
            className="w-full py-2.5 px-4 rounded bg-[#16181D] hover:bg-[#202328] border border-border-custom hover:border-gray-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 tracking-wider transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#38BDF8]" />
            LAUNCH AUDIT ENGINE
          </button>
        </div>

        {/* PDF Analyst Trigger CTA */}
        <div className="p-4 pt-0">
          <button
            onClick={() => {
              setActiveView("pdf");
              setActiveReport(null);
              setIsSearching(false);
              setIsSidebarOpen(false);
            }}
            className="w-full py-2.5 px-4 rounded bg-[#16181D] hover:bg-[#202328] border border-border-custom hover:border-gray-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 tracking-wider transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#10B981]" />
            LAUNCH PDF ANALYST
          </button>
        </div>

        {/* Registry Scroll List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5 custom-scroll">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#94A3B8] mb-2 px-1">
            Recent Researches ({reports.length})
          </div>

          {reports.length > 0 ? (
            reports.map((rep) => {
              const isSelected = activeReport?.id === rep.id;
              const isPdf = rep.type === "pdf_analysis";
              return (
                <button
                  key={rep.id}
                  onClick={() => {
                    setActiveReport(rep);
                    if (isPdf) {
                      setActiveView("pdf");
                    } else {
                      setActiveView("research");
                    }
                    setIsSearching(false);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full text-left p-3.5 rounded border transition-all cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? "bg-[#16181D] border-l-2 border-l-[#38BDF8] border-y-border-custom border-r-border-custom text-white"
                      : "bg-transparent hover:bg-[#16181D]/40 border-l-2 border-l-transparent border-y-transparent border-r-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  <div className="text-xs font-semibold line-clamp-2 leading-relaxed">
                    {rep.topic}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 mt-1 pt-1.5 border-t border-border-custom/30">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-gray-600" />
                      {new Date(rep.timestamp).toLocaleDateString()}
                    </span>
                    {isPdf ? (
                      <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-wider">
                        PDF Analyst
                      </span>
                    ) : rep.hasAudio ? (
                      <span className="text-[9px] font-bold text-[#38BDF8] uppercase tracking-wider">
                        Vocal Ready
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 border border-dashed border-[#2D3139] rounded">
              <FolderGit2 className="w-8 h-8 text-gray-600 stroke-[1.5]" />
              <div className="text-xs font-mono font-bold mt-4 text-[#94A3B8]">Registry Empty</div>
              <p className="text-[10px] text-gray-500 max-w-[180px] mt-1.5 leading-relaxed">
                Provide deep queries to generate formal research briefings.
              </p>
            </div>
          )}
        </div>

        {/* User profile section at the bottom of the sidebar */}
        <div className="p-4 border-t border-[#2D3139] bg-[#090B0F]/50 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate leading-tight">
                {user.displayName || user.email?.split("@")[0] || "Scholar"}
              </span>
              <span className="text-[10px] font-mono text-gray-500 truncate mt-0.5 leading-none" title={user.email || ""}>
                {user.email || "Gmail Identity"}
              </span>
            </div>
            <button
              onClick={() => {
                auth.signOut();
                setIsSidebarOpen(false);
              }}
              className="p-1.5 px-2.5 border border-[#2D3139] hover:border-red-500 hover:text-red-400 text-gray-400 transition-all font-mono text-[9px] font-bold rounded cursor-pointer shrink-0 uppercase tracking-widest"
            >
              Log Out
            </button>
          </div>
          
          <button
            onClick={() => {
              setMfaStatusMsg(null);
              setMfaCode("");
              setMfaPhoneNumber("");
              setMfaVerificationId(null);
              setShowSecurityModal(true);
              setIsSidebarOpen(false);
            }}
            className="w-full mt-1.5 py-1.5 px-3 rounded bg-[#16181D]/80 hover:bg-[#202328] border border-[#2D3139] hover:border-[#38BDF8]/40 text-[#94A3B8] hover:text-[#38BDF8] font-mono font-bold text-[10px] flex items-center justify-center gap-1.5 tracking-wider transition-all cursor-pointer"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${enrolledFactors.length > 0 ? "text-[#10B981]" : "text-amber-500"}`} />
            MFA STATUS: {enrolledFactors.length > 0 ? "ENABLED" : "DISABLED"}
          </button>
        </div>
      </div>

      {/* Dimmed backdrop overlay when drawer is open */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 2. MAIN CENTER FEED AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-custom">
        
        {/* MOBILE HEADER TOP BAR */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-[#090B0F] border-b border-border-custom h-14 shrink-0 z-40 select-none">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 -ml-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-all cursor-pointer flex items-center justify-center"
            aria-label="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="font-serif-editorial font-bold text-lg text-white">
            Argus <span className="font-sans font-light text-[9px] text-[#94A3B8] opacity-60">/ Research</span>
          </div>

          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[#16181D] border border-border-custom text-xs font-mono font-bold text-[#38BDF8]">
            {user && user.email ? user.email.substring(0, 2).toUpperCase() : "US"}
          </div>
        </div>
        
        {/* VIEW A: PDF ANALYST SECTION */}
        {activeView === "pdf" && (
          <PdfAnalyst 
            activeAnalysis={activeReport}
            onAnalysisSuccess={(rep) => {
              setReports((prev) => {
                if (prev.some(r => r.id === rep.id)) return prev;
                return [rep, ...prev];
              });
              setActiveReport(rep);
            }}
          />
        )}

        {/* VIEW B: SEARCH INITIATION INTERFACE */}
        {activeView === "research" && !isSearching && !activeReport && (
          <div className="flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
            <div className="max-w-2xl w-full flex flex-col gap-8 pb-12">
              <div className="text-center">
                <div className="inline-flex p-3 bg-[#16181D] border border-border-custom rounded-full mb-5 relative">
                  <Bot className="w-8 h-8 text-[#38BDF8]" />
                </div>
                <h2 className="text-3xl md:text-4.5xl font-serif-editorial font-bold tracking-tight text-white mb-3">
                  Argus Research Engine
                </h2>
                <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
                  Argus is a decoupled multi-agent research engine utilizing LangGraph, Node.js, and React. Enter any scientific, academic or tech topic to spawn parallel search units, audit source credibility, and synthesize formal cited portfolios.
                </p>
              </div>

              {/* Glowing Query input block */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-[#38BDF8]/15 rounded-md blur opacity-75 group-focus-within:opacity-100 transition-all duration-300"></div>
                <div className="relative flex items-center bg-[#16181D] border border-border-custom rounded-md overflow-hidden focus-within:border-cyan-500/60 transition-all">
                  <div className="pl-4">
                    <Search className="w-4 h-4 text-[#94A3B8]" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter scientific/academic research topic (e.g. CRISPR base editing vs prime)..."
                    value={searchTopic}
                    onChange={(e) => setSearchTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLaunchResearch(searchTopic);
                    }}
                    className="flex-1 h-14 bg-transparent pl-3 pr-2 text-sm text-white focus:outline-none placeholder:text-gray-600"
                  />
                  <button
                    onClick={() => handleLaunchResearch(searchTopic)}
                    disabled={!searchTopic.trim()}
                    className="h-10 mx-2 bg-[#38BDF8] hover:bg-[#58cbfd] px-5 rounded text-black font-mono font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    RUN ANALYSIS
                    <ArrowRight className="w-3.5 h-3.5 fill-black" />
                  </button>
                </div>
              </div>

              {/* Suggestion list */}
              <div className="space-y-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  System suggested paradigms
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {suggestedTopics.map((topic, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearchTopic(topic);
                        handleLaunchResearch(topic);
                      }}
                      className="text-left p-4 rounded bg-[#16181D]/40 hover:bg-[#16181D] border border-border-custom hover:border-gray-500 text-xs text-gray-300 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate pr-4">{topic}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#38BDF8] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW C: PARALLEL AGENT STREAMING TIMELINE LOADER */}
        {activeView === "research" && isSearching && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto lg:overflow-hidden bg-[#0A0B0E]">
            
            {/* Header info bar */}
            <div className="p-6 border-b border-border-custom bg-[#16181D]/80 backdrop-blur flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38BDF8] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#38BDF8]"></span>
                  </span>
                  ACTIVE PROCESS WORKFLOWSTREAM
                </h3>
                <div className="text-sm font-sans font-medium text-white mt-1">
                  Research Topic: "{searchTopic}"
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="px-3 py-1 bg-emerald-950/20 border border-emerald-900/30 rounded text-[#10B981]">
                  VETTED: {criticAuditedCounts.approved}
                </div>
                <div className="px-3 py-1 bg-red-955/20 border border-red-900/30 rounded text-[#F43F5E]">
                  EXCISED: {criticAuditedCounts.removed}
                </div>
              </div>
            </div>

            {/* Event driven visualization matrix (Editorial layout) */}
            <div className="bg-[#16181D] mx-4 my-4 lg:m-6 border border-border-custom rounded-lg p-5 sm:p-6 flex flex-col gap-4 flex-shrink-0">
              <div className="flex justify-between items-baseline">
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Live Transition State Tracks</div>
                <span className="text-[11px] font-mono text-[#38BDF8]">CENTRALIZED THREAD ACTIVE</span>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-between relative mt-6 gap-6 md:gap-2">
                {/* Horizontal line */}
                <div className="absolute top-[15px] left-0 right-0 h-[1px] bg-border-custom z-0 hidden md:block" />

                {AGENT_SEQUENCE.map((agent, i) => {
                  const isCurrent = activeAgent === agent.key;
                  const isCompleted = AGENT_SEQUENCE.findIndex(x => x.key === activeAgent) > i;
                  
                  return (
                    <div key={agent.key} className="relative z-1 flex flex-col items-center gap-2.5 w-32">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all duration-300 ${
                        isCurrent 
                          ? "bg-[#38BDF8] text-black border-2 border-[#38BDF8] shadow-[0_0_15px_rgba(56,189,248,0.5)]"
                          : isCompleted 
                            ? "border-2 border-[#10B981] text-[#10B981] bg-bg-custom"
                            : "border-2 border-border-custom text-gray-500 bg-bg-custom"
                      }`}>
                        {agent.number}
                      </div>
                      <div className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
                        isCurrent ? "text-[#38BDF8]" : isCompleted ? "text-[#10B981]" : "text-gray-500"
                      }`}>
                        {agent.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Logs console grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-6 min-h-0 overflow-y-auto lg:overflow-hidden">
              
              {/* Terminal Panel */}
              <div className="lg:col-span-8 flex flex-col h-[420px] lg:h-full bg-[#0D0F13] border border-border-custom rounded-lg overflow-hidden flex-shrink-0">
                <div className="p-3 bg-[#16181D] border-b border-border-custom flex items-center justify-between font-mono text-[10px]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#38BDF8]" />
                    <span className="text-gray-300 font-bold uppercase tracking-widest">THREAD_METRICS_STREAM</span>
                  </div>
                  <span className="text-gray-400 font-bold">STATE: {activeStep}</span>
                </div>

                <div className="flex-1 p-5 font-mono text-[11px] overflow-y-auto space-y-2.5 custom-scroll select-text">
                  <div className="text-[#38BDF8]/70">{`>>> Initializing state schema network dictionary...`}</div>
                  {timelineLogs.map((log) => (
                    <div key={log.id} className="leading-relaxed flex items-start gap-4">
                      <span className="text-gray-600 flex-shrink-0 select-none">[{log.timestamp}]</span>
                      <span className="text-[#10B981] font-semibold flex-shrink-0 select-none">[{log.agent}]</span>
                      <span className="text-gray-300">{log.message}</span>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>

                {/* Progress bar message info */}
                <div className="p-4 bg-[#11161d]/80 border-t border-border-custom flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-[#38BDF8] animate-spin" />
                  <span className="text-[11px] font-mono text-gray-300 truncate">
                    {progressMessage}
                  </span>
                </div>
              </div>

              {/* Real-time Discovery Tracker Right Panel */}
              <div className="lg:col-span-4 flex flex-col h-[300px] lg:h-full bg-[#0D0F13] border border-border-custom rounded-lg overflow-hidden p-5 flex-shrink-0">
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#94A3B8] border-b border-border-custom pb-3 flex items-center justify-between mb-4">
                  <span>RESOLVED INDEX SEED</span>
                  {approvedLinks.length > 0 || removedLinks.length > 0 ? (
                    <span className="text-[9px] text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20 font-bold">
                      AUDITED
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#38BDF8] bg-[#38BDF8]/10 px-2 py-0.5 rounded border border-[#38BDF8]/20 font-bold">
                      LIVE_NODES
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 custom-scroll">
                  {approvedLinks.length > 0 || removedLinks.length > 0 ? (
                    <div className="space-y-6">
                      {/* Selected/Approved list */}
                      {approvedLinks.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1.5 sticky top-0 bg-[#0D0F13] pb-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-450" />
                            SELECTED SOURCES ({approvedLinks.length})
                          </div>
                          {approvedLinks.map((link, idx) => (
                            <div
                              key={`approved-${idx}`}
                              className="p-3 bg-emerald-950/5 border border-emerald-900/30 rounded transition-colors"
                            >
                              <div className="text-xs font-semibold text-emerald-400 truncate">{link.title}</div>
                              <div className="text-[10px] text-gray-500 font-mono mt-0.5 truncate">{link.url}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Discarded list */}
                      {removedLinks.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-mono text-amber-500 font-bold flex items-center gap-1.5 sticky top-0 bg-[#0D0F13] pb-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            DISCARDED SOURCES ({removedLinks.length})
                          </div>
                          {removedLinks.map((link, idx) => (
                            <div
                              key={`removed-${idx}`}
                              className="p-3 bg-red-955/5 border border-red-900/20 rounded transition-colors flex flex-col gap-1.5"
                            >
                              <div className="text-xs font-semibold text-red-400 truncate">{link.title}</div>
                              <div className="text-[10px] text-gray-500 font-mono truncate">{link.url}</div>
                              <div className="text-[10px] border-l border-red-500/30 pl-2 text-gray-400 italic">
                                Reason: {link.reason}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : rawVettedLinks.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono text-cyan-400 font-bold flex items-center gap-1.5 sticky top-0 bg-[#0D0F13] pb-1">
                        <Search className="w-3.5 h-3.5 text-cyan-400" />
                        GATHERED RAW SOURCES ({rawVettedLinks.length})
                      </div>
                      {rawVettedLinks.map((link, idx) => (
                        <div
                          key={`raw-${idx}`}
                          className="p-3 bg-[#16181D]/60 border border-border-custom/50 hover:border-[#38BDF8]/30 rounded transition-colors"
                        >
                          <div className="text-xs font-semibold text-white truncate">{link.title}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1 pr-1 truncate">{link.url}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-24 text-gray-700">
                      <Bot className="w-8 h-8 text-gray-600 animate-pulse stroke-[1.5]" />
                      <div className="text-[11px] font-mono mt-3 text-gray-500 tracking-wider">Evaluating search bounds...</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW D: REPORT VIEWER CONTAINER */}
        {activeView === "research" && activeReport && !isSearching && (
          <div className="flex-1 overflow-y-auto lg:overflow-hidden h-full">
            <ReportViewer
              report={activeReport}
            />
          </div>
        )}

        {/* ERROR DIALOGS OVERWRITES */}
        {searchError && (
          <div className="m-6 p-4 rounded border border-red-900/40 bg-red-950/10 text-red-100 flex items-start gap-3">
            <XOctagon className="w-5 h-5 text-[#F43F5E] flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-red-400">
                THREAD EXCEPTION DETECTED
              </div>
              <div className="text-xs text-gray-300 mt-1">{searchError}</div>
              <button
                onClick={() => setSearchError(null)}
                className="text-[10px] font-mono text-[#38BDF8] hover:underline mt-2.5 cursor-pointer block uppercase tracking-wider"
              >
                Clear exception and continue
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MFA SETTINGS CONTROL CITADEL */}
      {showSecurityModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div id="mfa-enroll-recaptcha-container" className="hidden pointer-events-none"></div>
          
          <div className="w-full max-w-md bg-[#0D0F13] border border-[#2D3139] p-6 rounded-lg text-gray-200 shadow-2xl relative flex flex-col gap-5">
            
            {/* Header section */}
            <div className="flex items-start justify-between border-b border-[#2D3139] pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-[#38BDF8]" />
                <div>
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                    WORKSPACE AUTH SECURITY
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                    Dual-Step SMS Encryption Layer
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSecurityModal(false)}
                className="text-gray-500 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notification logs inside the modal */}
            {mfaStatusMsg && (
              <div className={`p-3 rounded text-xs leading-relaxed flex items-start gap-2.5 border ${
                mfaStatusMsg.type === "success" 
                  ? "bg-emerald-950/20 border-emerald-800/20 text-emerald-300"
                  : "bg-red-950/20 border-red-800/20 text-red-300"
              }`}>
                {mfaStatusMsg.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <span>{mfaStatusMsg.text}</span>
              </div>
            )}

            {/* Main content split based on status */}
            {enrolledFactors.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-[#16181D] border border-emerald-800/10 p-3 rounded flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      MFA PROTOCOL: ACTIVATED
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Account is locked using verification challenge indices sent to registered device link.
                    </p>
                    <div className="mt-2 text-xs font-mono text-[#38BDF8] inline-block bg-[#1E293B]/40 px-2 py-0.5 rounded border border-cyan-900/30">
                      ID: {enrolledFactors[0].phoneNumber || "SMS OTP Device"}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#2D3139]/40">
                  <button
                    type="button"
                    disabled={isMfaActionLoading}
                    onClick={() => handleMfaUnenroll(enrolledFactors[0])}
                    className="w-full py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-800/40 hover:border-red-500 text-red-400 hover:text-red-300 font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer min-h-[44px]"
                  >
                    {isMfaActionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto text-red-400" />
                    ) : (
                      "DISABLE SMS PROTOCOL"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 font-sans">
                <div className="bg-[#16181D] border border-amber-900/10 p-3.5 rounded flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-white uppercase tracking-wide">
                      MFA STATUS: INACTIVE
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                      SMS-based Multi-Factor Authentication is currently not verified. Activate to enforce SMS identity confirmation on each system sign in.
                    </p>
                  </div>
                </div>

                {!mfaVerificationId ? (
                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 block font-bold">
                        Secure Phone Number (E.164 Format)
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. +14155552671"
                        value={mfaPhoneNumber}
                        onChange={(e) => setMfaPhoneNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-[#16181D] border border-[#2D3139] hover:border-gray-500 rounded text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-bold"
                      />
                      <span className="text-[9px] text-gray-500 leading-tight block">
                        Must contain + country code followed by area and local digits.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleMfaEnrollSend}
                      disabled={isMfaActionLoading || !mfaPhoneNumber}
                      className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      {isMfaActionLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-black" />
                          DISPATCHING...
                        </>
                      ) : (
                        "DISPATCH DUAL-FACTOR SMS"
                      )}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleMfaEnrollSubmit} className="space-y-4 font-sans">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-[#38BDF8] block font-bold">
                        SMS Verification Pin (6-Digits)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="•••••"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ""))}
                        className="w-full text-center py-2 bg-[#16181D] border border-[#2D3139] rounded text-lg font-mono tracking-widest text-[#38BDF8] placeholder-gray-700 focus:outline-none focus:border-cyan-500/50 transition-all font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isMfaActionLoading || mfaCode.length < 6}
                        className="w-full py-3 bg-[#38BDF8] hover:bg-[#0EA5E9] disabled:opacity-40 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                      >
                        {isMfaActionLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        ) : (
                          "VALIDATE PROTOCOL & ACTIVATE"
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMfaCode("");
                          setMfaVerificationId(null);
                        }}
                        className="text-[9px] font-mono text-gray-500 hover:text-white underline uppercase tracking-wider"
                      >
                        Change Phone Number
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
