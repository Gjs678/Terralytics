"""Route-decision explanations.

Design goal (per project brief): the app must never break if Ollama is
unavailable. So we ALWAYS build a deterministic, structured explanation
first from the actual route-risk numbers. Only if Ollama responds quickly
do we use it to reword that explanation in more natural language - and if
it fails or times out for any reason, we silently keep the deterministic
text. Nothing downstream ever waits on or requires Ollama.
"""
import httpx

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5vl:7b"
OLLAMA_TIMEOUT_SECONDS = 2.5  # keep the demo snappy; never block the API on this


def build_deterministic_explanation(
    incident_type: str,
    severity: str,
    old_score,
    new_score,
    eta_delta_hours: float,
    risk_reduction_percent: float,
) -> str:
    """Build a plain-English, fact-grounded explanation from structured data.
    This is the reliable fallback and the source of truth for the numbers -
    an LLM (if used) may only rephrase this, never invent new facts.
    """
    closure_clause = " Road corridor is confirmed impassable." if severity == "severe" or incident_type == "road_blockage" else ""
    lines = [
        f"A {severity} {incident_type.replace('_', ' ')} was reported on the active corridor.{closure_clause}",
        f"Hazard risk on that corridor rose from {old_score.hazard_risk:.0f}/100 to {new_score.hazard_risk:.0f}/100, "
        f"worsening its route score from {old_score.score:.1f} to {new_score.score:.1f} (lower is better).",
    ]
    if eta_delta_hours > 0:
        lines.append(f"The recommended alternative adds about {eta_delta_hours:.1f} extra hour(s) of travel time,")
    else:
        lines.append("The recommended alternative does not add meaningful travel time,")
    if risk_reduction_percent > 0:
        lines.append(f"but reduces hazard exposure by roughly {risk_reduction_percent:.0f}%.")
    else:
        lines.append("and keeps hazard exposure within an acceptable range.")
    lines.append("Therefore the alternative route currently has the lower overall operational risk.")
    return " ".join(lines)


def enrich_with_ollama(deterministic_text: str, model: str = OLLAMA_MODEL) -> str:
    """Best-effort: ask a local Ollama model to smooth the deterministic
    explanation into more natural driver-facing language. Falls back to the
    deterministic text unchanged on any error/timeout/unavailability.
    """
    prompt = (
        "Rewrite the following route-decision explanation in 2-3 short, "
        "reassuring plain-English sentences for a delivery driver. Do not "
        "invent new facts or numbers beyond what is given. Do not use "
        "markdown formatting.\n\n" + deterministic_text
    )
    try:
        with httpx.Client(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            resp = client.post(
                OLLAMA_URL,
                json={"model": model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            text = (data.get("response") or "").strip()
            return text if text else deterministic_text
    except Exception:
        # Ollama not running / model missing / network issue / timeout -> fine.
        return deterministic_text


def explain_route_decision(
    incident_type: str,
    severity: str,
    old_score,
    new_score,
    eta_delta_hours: float,
    risk_reduction_percent: float,
    use_ollama: bool = False,
) -> str:
    deterministic = build_deterministic_explanation(
        incident_type, severity, old_score, new_score, eta_delta_hours, risk_reduction_percent
    )
    if use_ollama:
        return enrich_with_ollama(deterministic)
    return deterministic
