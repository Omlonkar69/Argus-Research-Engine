"""
System Architecture Blueprint: Python Multi-Agent Research Assistant (LangGraph Engine)
This file represents the official high-performance Python LangGraph orchestration code 
for the Multi-Agent Research Engine. This provides the direct blueprint schema 
for developers running Python configurations.
"""

from typing import TypedDict, List, Dict, Literal
import re
from google import genai
from google.genai import types
from langgraph.graph import StateGraph, END

# ==========================================
# 1. CENTRALIZED STATE SCHEMA
# ==========================================
class ResearchState(TypedDict):
    topic: str
    raw_research: List[Dict]
    filtered_research: List[Dict]
    removed_sources: List[Dict]  # Tracks dicts with keys: 'url', 'reason', 'title'
    final_report: str
    audio_path: str
    loop_count: int

# Initialize Gemini Client
client = genai.Client()

# ==========================================
# 2. STATE NODE WORKFLOWS
# ==========================================

def researcher_node(state: ResearchState) -> Dict:
    """
    Researcher Node: Executes parallel web lookups using Gemini's live Search tool.
    Mutates raw_research with gathered origin links.
    """
    topic = state['topic']
    loop_count = state.get('loop_count', 0) + 1
    
    # Query variation logic during retries (self-correction)
    query_syntax = topic
    if loop_count > 1:
        variations = [
            f"{topic} breakthroughs updates academic",
            f"technical specifications detailed analysis of {topic}",
            f"{topic} primary documentation research review"
        ]
        query_syntax = variations[min(loop_count - 1, len(variations) - 1)]

    print(f"[Researcher Node] Querying Google Search: {query_syntax}")
    
    # Google Search Grounding with Gemini 3.5
    response = client.models.generate_content(
        model='gemini-3.5-flash',
        contents=f"Conduct deep factual research regarding: {query_syntax}. Focus on primary documents.",
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )
    )
    
    raw_sources = []
    # Extract metadata chunks from search grounding
    if response.candidates and response.candidates[0].grounding_metadata:
        metadata = response.candidates[0].grounding_metadata
        if metadata.grounding_chunks:
            for chunk in metadata.grounding_chunks:
                if chunk.web:
                    raw_sources.append({
                        "title": chunk.web.title or "Annotated Document",
                        "url": chunk.web.uri or ""
                    })

    # Deduplicate sources
    seen = set()
    deduped = []
    for s in raw_sources:
        if s["url"] not in seen:
            seen.add(s["url"])
            deduped.append(s)

    return {
        "raw_research": deduped,
        "loop_count": loop_count
    }


def critic_node(state: ResearchState) -> Dict:
    """
    Critic Node: Audits raw_research links for professional/academic authenticity
    and trust signals. Categorizes as filtered_research or removed_sources.
    """
    topic = state['topic']
    raw_sources = state.get('raw_research', [])
    filtered = []
    removed = []

    print(f"[Critic Node] Analyzing {len(raw_sources)} gathered links...")

    for src in raw_sources:
        title = src.get('title', 'Unknown Source')
        url = src.get('url', '')

        # Audit prompt
        audit_prompt = f"""
        Analyze if the following source is reliable, academic, objective, or highly informative for research about "{topic}".
        Title: {title}
        URL: {url}

        Respond in strictly valid JSON format:
        {{"isValid": true, "reason": "Specific reasoning of relevance and trustworthiness"}}
        """
        
        try:
            res = client.models.generate_content(
                model='gemini-3.5-flash',
                contents=audit_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            import json
            parsed = json.loads(res.text)
            
            if parsed.get("isValid") is True:
                filtered.append(src)
                print(f" -> APPROVED: {url}")
            else:
                removed.append({
                    "title": title,
                    "url": url,
                    "reason": parsed.get("reason", "Incongruent or superficial domain signature.")
                })
                print(f" -> REJECTED: {url} ({parsed.get('reason')})")
        except Exception:
            # Tolerant failover
            filtered.append(src)

    return {
        "filtered_research": filtered,
        "removed_sources": removed
    }


def writer_node(state: ResearchState) -> Dict:
    """
    Writer Node: Processes audited files and synthesizes a high-density, formal Academia
    Markdown report incorporating references.
    """
    topic = state['topic']
    sources = state.get('filtered_research', [])
    
    print(f"[Writer Node] Synthesizing comprehensive portfolio report...")

    sources_str = "\n".join([f"[{i+1}] {s['title']} (URL: {s['url']})" for i, s in enumerate(sources)])
    
    prompt = f"""
    You are an Elite Research Architect compiling an industry portfolio.
    Topic: "{topic}"

    Grounded sources:
    {sources_str}

    Write a high-fidelity, comprehensive report in GitHub-Flavored Markdown. Formulate deeply academic sections.
    Integrate proper cited links reflecting the sources provided. Give complete system specifications, comparisons, and technical forecasts.
    """

    res = client.models.generate_content(
        model='gemini-3.5-flash',
        contents=prompt
    )

    # Save output report
    final_text = res.text or "An unexpected issue occurred during writer synthesis."
    return {
        "final_report": final_text
    }


def audio_synthesizer_node(state: ResearchState) -> Dict:
    """
    Vocal Synthesis Node: Clean regex processing of formatting characters and
    synthesizing voice briefings via Google gTTS or Gemini TTS.
    """
    report = state.get('final_report', '')
    topic = state['topic']
    
    # Clean Markdown Regex Sanitization Unit
    raw_text = re.sub(r'#{1,6}\s+', '', report)  # Remove headings
    raw_text = re.sub(r'[*_`~]', '', raw_text)   # Remove formatting
    raw_text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', raw_text)  # Remove links
    raw_text = re.sub(r'- ', '', raw_text)        # Remove bullets
    
    briefing_slice = raw_text[:1000] # Safe token limit
    
    print("[Audio Node] Synthesizing executive briefing via standard voice readout...")
    
    # We can invoke gTTS programmatically
    try:
        from gtts import gTTS
        tts = gTTS(text=f"Deep research brief on {topic}. Overview: {speech_slice}", lang='en')
        audio_file = f"saved_reports/audio_{topic.replace(' ', '_')}.mp3"
        tts.save(audio_file)
        print(f" -> Speech synthesized: {audio_file}")
    except Exception as e:
        print(f"gTTS not loaded or error: {e}. Outputting mock path.")
        audio_file = f"saved_reports/audio_{topic.replace(' ', '_')}.mp3"

    return {
        "audio_path": audio_file
    }

# ==========================================
# 3. CONDITIONAL ROUTING & CORE COMPILATION
# ==========================================

def should_retry_research(state: ResearchState) -> Literal["researcher", "writer"]:
    """
    Self-Correction Loop: If critic approved 0 items, retry researcher with mutated query.
    Stop looping if retry count exceeds 3.
    """
    filtered = state.get('filtered_research', [])
    loop_count = state.get('loop_count', 0)
    
    if len(filtered) == 0 and loop_count < 3:
        print(f"[Self-Correction] Zero vetted sources. Re-routing graph to Researcher (Attempt {loop_count+1}/3)")
        return "researcher"
    
    return "writer"


# ==========================================
# 4. STATE GRAPH COMPILATION
# ==========================================
workflow = StateGraph(ResearchState)

# Setup Node Matrix
workflow.add_node("researcher", researcher_node)
workflow.add_node("critic", critic_node)
workflow.add_node("writer", writer_node)
workflow.add_node("synthesizer", audio_synthesizer_node)

# Connect Edges
workflow.set_entry_point("researcher")
workflow.add_edge("researcher", "critic")

# Dynamic Route via Critic verification metrics
workflow.add_conditional_edges(
    "critic",
    should_retry_research,
    {
        "researcher": "researcher",
        "writer": "writer"
    }
)

workflow.add_edge("writer", "synthesizer")
workflow.add_edge("synthesizer", END)

# Compile LangGraph object
graph = workflow.compile()
print("[System] Multi-Agent LangGraph Research Network compiled successfully.")
