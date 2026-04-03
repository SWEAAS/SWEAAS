"""Async multi-provider LLM layer using first-party SDKs.

Supports OpenAI, xAI (Grok), and Anthropic without LiteLLM.
xAI uses the OpenAI-compatible endpoint at https://api.x.ai/v1.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model pricing (USD per 1 M tokens) — (input, output)
# ---------------------------------------------------------------------------
MODEL_COSTS: dict[str, tuple[float, float]] = {
    "grok-4-1-fast-reasoning": (0.20, 0.50),
    "grok-4-1-fast-non-reasoning": (0.20, 0.50),
    "grok-4-0709": (3.00, 15.00),
    "grok-3": (3.00, 15.00),
    "grok-3-mini": (0.30, 0.50),
    "grok-2": (2.00, 10.00),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "o1": (15.00, 60.00),
    "o1-mini": (1.10, 4.40),
    "o3-mini": (1.10, 4.40),
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-3-5-sonnet-20241022": (3.00, 15.00),
    "claude-3-5-haiku-20241022": (0.80, 4.00),
    "claude-3-haiku-20240307": (0.25, 1.25),
}

_FALLBACK_COST = (1.00, 3.00)


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return estimated cost in USD for a single call."""
    clean = _strip_prefix(model)
    inp, out = MODEL_COSTS.get(clean, _FALLBACK_COST)
    return (prompt_tokens * inp + completion_tokens * out) / 1_000_000


# ---------------------------------------------------------------------------
# Unified response
# ---------------------------------------------------------------------------
@dataclass
class LLMResult:
    """Normalised result returned by every provider."""

    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    model: str = ""
    raw: Any = field(default=None, repr=False)


# ---------------------------------------------------------------------------
# Provider routing helpers
# ---------------------------------------------------------------------------
_clients: dict[str, Any] = {}


def _strip_prefix(model: str) -> str:
    for pfx in ("xai/", "anthropic/", "openai/"):
        if model.startswith(pfx):
            return model[len(pfx):]
    return model


def _resolve_provider(model: str) -> str:
    m = model.lower()
    if m.startswith("xai/") or m.startswith("grok"):
        return "xai"
    if m.startswith("anthropic/") or "claude" in m:
        return "anthropic"
    return "openai"


def _get_openai_client(base_url: str | None = None):
    from openai import AsyncOpenAI

    key = base_url or "__openai__"
    if key not in _clients:
        settings = get_settings()
        if base_url:
            _clients[key] = AsyncOpenAI(
                api_key=settings.xai_api_key, base_url=base_url,
            )
        else:
            _clients[key] = AsyncOpenAI(api_key=settings.openai_api_key)
    return _clients[key]


def _get_anthropic_client():
    from anthropic import AsyncAnthropic

    key = "__anthropic__"
    if key not in _clients:
        settings = get_settings()
        _clients[key] = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _clients[key]


# ---------------------------------------------------------------------------
# Core completion
# ---------------------------------------------------------------------------
async def llm_completion(
    *,
    messages: list[dict[str, str]],
    agent_id: str | None = None,
    model: str | None = None,
    **kwargs: Any,
) -> LLMResult:
    """Route a chat completion to the right provider and return a unified result.

    When *agent_id* is supplied and the budget tracker is initialised, the call
    is budget-gated and usage is recorded automatically.
    """
    from app.core.llm_budget import budget_tracker

    settings = get_settings()
    model = (model or settings.llm_default_model or "gpt-4o-mini").strip()
    provider = _resolve_provider(model)
    clean_model = _strip_prefix(model)

    if agent_id and budget_tracker.is_initialised:
        budget_tracker.check_budget(agent_id)

    t0 = time.monotonic()

    if provider == "anthropic":
        result = await _call_anthropic(clean_model, messages, **kwargs)
    elif provider == "xai":
        result = await _call_openai(
            clean_model, messages, base_url="https://api.x.ai/v1", **kwargs,
        )
    else:
        result = await _call_openai(clean_model, messages, **kwargs)

    elapsed = time.monotonic() - t0
    result.model = model
    result.cost_usd = calculate_cost(
        model, result.prompt_tokens, result.completion_tokens,
    )

    logger.info(
        "LLM %s agent=%s tokens=%d cost=$%.6f elapsed=%.2fs",
        model, agent_id or "-", result.total_tokens, result.cost_usd, elapsed,
    )

    if agent_id and budget_tracker.is_initialised:
        await budget_tracker.record_usage(agent_id, result)

    return result


# ---------------------------------------------------------------------------
# Provider-specific calls
# ---------------------------------------------------------------------------
async def _call_openai(
    model: str,
    messages: list[dict[str, str]],
    *,
    base_url: str | None = None,
    **kwargs: Any,
) -> LLMResult:
    client = _get_openai_client(base_url)
    resp = await client.chat.completions.create(
        model=model, messages=messages, **kwargs,
    )
    choice = resp.choices[0]
    usage = resp.usage
    pt = usage.prompt_tokens if usage else 0
    ct = usage.completion_tokens if usage else 0
    return LLMResult(
        content=choice.message.content or "",
        prompt_tokens=pt,
        completion_tokens=ct,
        total_tokens=pt + ct,
        raw=resp,
    )


async def _call_anthropic(
    model: str,
    messages: list[dict[str, str]],
    **kwargs: Any,
) -> LLMResult:
    client = _get_anthropic_client()
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    user_msgs = [m for m in messages if m["role"] != "system"]
    create_kw: dict[str, Any] = {
        "model": model,
        "messages": user_msgs,
        "max_tokens": kwargs.pop("max_tokens", 4096),
    }
    if system_parts:
        create_kw["system"] = "\n\n".join(system_parts)
    create_kw.update(kwargs)

    resp = await client.messages.create(**create_kw)
    text = resp.content[0].text if resp.content else ""
    return LLMResult(
        content=text,
        prompt_tokens=resp.usage.input_tokens,
        completion_tokens=resp.usage.output_tokens,
        total_tokens=resp.usage.input_tokens + resp.usage.output_tokens,
        raw=resp,
    )


# ---------------------------------------------------------------------------
# Credential check (used by agent nodes for graceful fallback)
# ---------------------------------------------------------------------------
def llm_has_credentials(settings: Settings | None = None) -> bool:
    """True when the configured default model has a matching API key."""
    s = settings or get_settings()
    model = (s.llm_default_model or "gpt-4o-mini").strip()
    provider = _resolve_provider(model)
    if provider == "xai":
        return bool(s.xai_api_key)
    if provider == "anthropic":
        return bool(s.anthropic_api_key)
    return bool(s.openai_api_key)


# ---------------------------------------------------------------------------
# LangChain ChatModel for tool-calling specialists
# ---------------------------------------------------------------------------
_lc_models: dict[str, Any] = {}


def get_tool_calling_llm():
    """Return a LangChain BaseChatModel configured for the default provider.

    Supports tool binding via .bind_tools(). Uses langchain-openai for
    OpenAI/xAI providers and langchain-anthropic for Anthropic.
    """
    s = get_settings()
    model = (s.llm_default_model or "gpt-4o-mini").strip()
    provider = _resolve_provider(model)
    clean = _strip_prefix(model)

    cache_key = f"{provider}:{clean}"
    if cache_key in _lc_models:
        return _lc_models[cache_key]

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=clean,
            api_key=s.anthropic_api_key,
            max_tokens=4096,
        )
    elif provider == "xai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model=clean,
            api_key=s.xai_api_key,
            base_url="https://api.x.ai/v1",
        )
    else:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model=clean,
            api_key=s.openai_api_key,
        )

    _lc_models[cache_key] = llm
    return llm


async def run_agent_with_tools(
    *,
    system_prompt: str,
    user_message: str,
    tools: list,
    agent_id: str | None = None,
    max_tool_rounds: int = 5,
) -> LLMResult:
    """Run a tool-calling agent loop using LangChain's ChatModel.

    1. Sends system + user messages with bound tools
    2. If the LLM returns tool calls, executes them and feeds results back
    3. Repeats until the LLM returns a text response or max rounds hit
    4. Records usage via budget tracker

    Returns a unified LLMResult with the final text response and
    aggregated token counts.
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

    llm = get_tool_calling_llm()
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    messages: list = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    total_prompt = 0
    total_completion = 0
    final_content = ""

    for _round in range(max_tool_rounds):
        response: AIMessage = await llm_with_tools.ainvoke(messages)

        usage = getattr(response, "usage_metadata", None) or {}
        total_prompt += usage.get("input_tokens", 0)
        total_completion += usage.get("output_tokens", 0)

        if not response.tool_calls:
            final_content = response.content or ""
            break

        messages.append(response)
        for tc in response.tool_calls:
            tool_fn = next((t for t in tools if t.name == tc["name"]), None)
            if tool_fn:
                try:
                    tool_result = tool_fn.invoke(tc["args"])
                except Exception as exc:
                    tool_result = f"Tool error: {exc}"
            else:
                tool_result = f"Unknown tool: {tc['name']}"
            messages.append(ToolMessage(content=str(tool_result), tool_call_id=tc["id"]))
    else:
        final_content = response.content or "[max tool rounds reached]"

    total_tokens = total_prompt + total_completion
    s = get_settings()
    model = (s.llm_default_model or "gpt-4o-mini").strip()
    cost = calculate_cost(model, total_prompt, total_completion)

    result = LLMResult(
        content=final_content,
        prompt_tokens=total_prompt,
        completion_tokens=total_completion,
        total_tokens=total_tokens,
        cost_usd=cost,
        model=model,
    )

    if agent_id:
        from app.core.llm_budget import budget_tracker
        if budget_tracker.is_initialised:
            await budget_tracker.record_usage(agent_id, result)

    logger.info(
        "Tool agent %s agent=%s tokens=%d cost=$%.6f rounds=%d",
        model, agent_id or "-", total_tokens, cost, _round + 1,
    )

    return result
