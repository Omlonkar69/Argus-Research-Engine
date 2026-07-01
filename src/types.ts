export interface ReportMetadata {
  id: string;
  topic: string;
  timestamp: string;
  filteredResearch?: { title: string; url: string }[];
  removedSources?: { title: string; url: string; reason: string }[];
  hasAudio?: boolean;
  briefingSummary?: string;
  markdownContent?: string;
  
  // PDF Analyst fields
  type?: "pdf_analysis";
  fileName?: string;
  projectTag?: string;
  year?: string;
  analysis?: string;
}

export interface ResearchStreamEvent {
  type: "log" | "state" | "raw_research" | "critic_review" | "complete" | "error";
  agent?: string;
  step?: string;
  message?: string;
  data?: any;
  error?: string;
}
