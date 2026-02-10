"""
Pydantic-AI Bridge Module for Super-Goose.

Wraps Pydantic-AI's core functionality for use by Goose agents via the
Conscious bridge layer.  Provides type-safe agent execution, schema
creation / validation, structured output modes, and LLM cost estimation.

Pydantic-AI reference:
    G:/goose/external/pydantic-ai/pydantic_ai_slim/pydantic_ai/

Capabilities exposed:
    - validate_output   : Validate data against a dynamically-created Pydantic model
    - run_typed_agent    : Run an Agent[None, T] with typed, validated output
    - run_with_tools     : Run an agent with registered tool functions
    - create_schema      : Build a Pydantic BaseModel class at runtime
    - list_output_modes  : Enumerate Pydantic-AI structured output modes
    - estimate_cost      : Rough per-token cost estimate via genai-prices
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy globals -- populated by init()
# ---------------------------------------------------------------------------
_pydantic_ai: Any = None          # pydantic_ai top-level module
_pydantic: Any = None             # pydantic module
_genai_prices: Any = None         # genai_prices module (optional)
_initialized: bool = False
_init_error: Optional[str] = None
_version: Optional[str] = None

# Path to the vendored pydantic-ai source tree
_PYDANTIC_AI_ROOT = Path(__file__).resolve().parents[3] / "pydantic-ai"
_PYDANTIC_AI_SLIM = _PYDANTIC_AI_ROOT / "pydantic_ai_slim"

# ---------------------------------------------------------------------------
# Well-known output modes that Pydantic-AI supports.
# Maps symbolic name -> description of when/why you would use it.
# ---------------------------------------------------------------------------
OUTPUT_MODES: dict[str, str] = {
    "ToolOutput": (
        "Use a tool call to return structured data.  The model is given a "
        "tool whose schema matches the output type and must call it to "
        "produce the result.  Most portable mode across providers."
    ),
    "NativeOutput": (
        "Leverage the provider's native structured-output API (e.g. OpenAI "
        "response_format / Anthropic tool_use) for validated JSON output.  "
        "Lower latency than ToolOutput but provider-dependent."
    ),
    "PromptedOutput": (
        "Inject the JSON schema into the system prompt and ask the model to "
        "reply with conforming JSON.  Works with any provider but may be "
        "less reliable than tool or native modes."
    ),
    "TextOutput": (
        "Plain text output processed by a user-supplied function.  The "
        "function receives the raw string and returns the desired type."
    ),
    "StructuredDict": (
        "Attach an arbitrary JSON schema to a dict[str, Any] subclass so "
        "that the model returns a validated dictionary without requiring a "
        "full Pydantic model."
    ),
}

# ---------------------------------------------------------------------------
# Approximate per-token pricing used as a fallback when genai-prices is not
# available.  Values are in USD and intentionally conservative.
# ---------------------------------------------------------------------------
_FALLBACK_PRICING: dict[str, dict[str, float]] = {
    # Anthropic
    "anthropic:claude-sonnet-4-20250514": {"input": 3.00 / 1e6, "output": 15.00 / 1e6},
    "anthropic:claude-opus-4-20250514": {"input": 15.00 / 1e6, "output": 75.00 / 1e6},
    "anthropic:claude-haiku-3-5": {"input": 0.80 / 1e6, "output": 4.00 / 1e6},
    # OpenAI
    "openai:gpt-4o": {"input": 2.50 / 1e6, "output": 10.00 / 1e6},
    "openai:gpt-4o-mini": {"input": 0.15 / 1e6, "output": 0.60 / 1e6},
    # Google
    "google:gemini-2.0-flash": {"input": 0.10 / 1e6, "output": 0.40 / 1e6},
}

# ---------------------------------------------------------------------------
# Registry-compatible ToolStatus (imported lazily to avoid circular deps)
# ---------------------------------------------------------------------------


def _make_tool_status(
    available: bool,
    healthy: bool,
    error: Optional[str] = None,
    version: Optional[str] = None,
) -> Any:
    """Build a ToolStatus dataclass from the registry module.

    Falls back to a plain dict if the registry cannot be imported (e.g.
    during unit testing of this module in isolation).
    """
    try:
        from integrations.registry import ToolStatus
        return ToolStatus(
            name="pydantic_ai",
            available=available,
            healthy=healthy,
            error=error,
            version=version,
        )
    except ImportError:
        return {
            "name": "pydantic_ai",
            "available": available,
            "healthy": healthy,
            "error": error,
            "version": version,
        }


# ===================================================================
# Initialisation
# ===================================================================


def init() -> None:
    """Lazily initialise the bridge by importing pydantic-ai.

    Adds the vendored ``pydantic_ai_slim`` directory to ``sys.path`` if it
    is not already present, then attempts to import ``pydantic_ai`` and
    ``pydantic``.  Errors are captured in ``_init_error`` so that
    :func:`status` can report them without raising.
    """
    global _pydantic_ai, _pydantic, _genai_prices
    global _initialized, _init_error, _version

    if _initialized:
        return

    # Ensure the vendored source is importable
    slim_str = str(_PYDANTIC_AI_SLIM)
    if slim_str not in sys.path:
        sys.path.insert(0, slim_str)

    try:
        import pydantic_ai as pai  # noqa: WPS433
        _pydantic_ai = pai
        _version = getattr(pai, "__version__", None)
    except ImportError as exc:
        _init_error = (
            f"Failed to import pydantic_ai: {exc}. "
            f"Install with: pip install -e {_PYDANTIC_AI_SLIM}"
        )
        _initialized = True
        logger.error(_init_error)
        return

    try:
        import pydantic  # noqa: WPS433
        _pydantic = pydantic
    except ImportError as exc:
        _init_error = f"Failed to import pydantic: {exc}"
        _initialized = True
        logger.error(_init_error)
        return

    # genai-prices is optional -- used only by estimate_cost()
    try:
        import genai_prices  # noqa: WPS433
        _genai_prices = genai_prices
    except ImportError:
        logger.debug("genai-prices not available; estimate_cost will use fallback table")

    _initialized = True
    logger.info("pydantic_ai_bridge initialised (version=%s)", _version)


def _ensure_init() -> None:
    """Call :func:`init` if not yet done, and raise if it failed."""
    if not _initialized:
        init()
    if _init_error:
        raise RuntimeError(_init_error)


# ===================================================================
# Public API -- status / capabilities
# ===================================================================


def status() -> Any:
    """Return a :class:`~integrations.registry.ToolStatus` for Pydantic-AI.

    The bridge is considered *available* if the source tree exists on disk,
    and *healthy* if ``pydantic_ai`` can be imported successfully.
    """
    if not _initialized:
        init()

    available = _PYDANTIC_AI_ROOT.exists()
    healthy = _pydantic_ai is not None and _init_error is None
    return _make_tool_status(
        available=available,
        healthy=healthy,
        error=_init_error,
        version=_version,
    )


def capabilities() -> list[str]:
    """Return the list of operations this bridge supports."""
    return [
        "validate_output",
        "run_typed_agent",
        "run_with_tools",
        "create_schema",
        "list_output_modes",
        "estimate_cost",
    ]


# ===================================================================
# Public API -- operations
# ===================================================================


async def validate_output(data: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    """Validate *data* against a JSON Schema expressed as a ``dict``.

    Internally this creates a Pydantic ``TypeAdapter`` from the schema and
    calls ``validate_python``.

    Args:
        data: The dictionary to validate.
        schema: A JSON-Schema-compatible dict describing the expected shape.
            Must be of type ``object`` at the top level.

    Returns:
        A dict with keys:

        - ``valid`` (bool): Whether the data passed validation.
        - ``data`` (dict | None): The validated (and possibly coerced) data
          on success, or ``None`` on failure.
        - ``errors`` (list | None): Pydantic validation errors on failure.
    """
    _ensure_init()

    try:
        # Build a one-off Pydantic model from the schema
        model_cls = _model_from_schema("ValidationTarget", schema)
        instance = model_cls.model_validate(data)
        return {
            "valid": True,
            "data": instance.model_dump(),
            "errors": None,
        }
    except Exception as exc:
        # Pydantic ValidationError has a .errors() method
        errors = exc.errors() if hasattr(exc, "errors") else [str(exc)]
        return {
            "valid": False,
            "data": None,
            "errors": errors,
        }


async def run_typed_agent(
    prompt: str,
    output_type: dict[str, Any],
    *,
    model: str = "anthropic:claude-sonnet-4-20250514",
    system_prompt: str = "",
    model_settings: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Run a Pydantic-AI agent and return validated, typed output.

    Creates an ephemeral ``Agent[None, T]`` where *T* is a dynamically-built
    Pydantic model derived from *output_type*.

    Args:
        prompt: The user prompt to send to the model.
        output_type: A dict describing the output schema.  Each key is a
            field name; the value is a type descriptor string
            (``"str"``, ``"int"``, ``"float"``, ``"bool"``, ``"list[str]"``
            etc.) or a nested ``dict`` for sub-models.
        model: Model identifier, e.g. ``"anthropic:claude-sonnet-4-20250514"``.
        system_prompt: Optional system prompt prepended to the conversation.
        model_settings: Optional dict of model settings passed through to the
            underlying provider (temperature, max_tokens, etc.).

    Returns:
        A dict with keys:

        - ``success`` (bool)
        - ``output`` (dict | None): The validated model output as a dict.
        - ``usage`` (dict | None): Token usage summary from the run.
        - ``error`` (str | None): Error message on failure.
    """
    _ensure_init()

    try:
        Agent = _pydantic_ai.Agent  # noqa: N806
        ModelSettings = _pydantic_ai.ModelSettings  # noqa: N806

        output_model = _model_from_fields("AgentOutput", output_type)

        settings = ModelSettings(**model_settings) if model_settings else None

        agent_kwargs: dict[str, Any] = {
            "model": model,
            "output_type": output_model,
        }
        if system_prompt:
            agent_kwargs["system_prompt"] = system_prompt
        if settings is not None:
            agent_kwargs["model_settings"] = settings

        agent = Agent(**agent_kwargs)
        result = await agent.run(prompt)

        usage_dict: Optional[dict[str, Any]] = None
        if result.usage():
            u = result.usage()
            usage_dict = {
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens,
                "total_tokens": u.total_tokens,
                "requests": u.requests,
            }

        output_data = result.output
        if hasattr(output_data, "model_dump"):
            output_data = output_data.model_dump()

        return {
            "success": True,
            "output": output_data,
            "usage": usage_dict,
            "error": None,
        }
    except Exception as exc:
        logger.exception("run_typed_agent failed")
        return {
            "success": False,
            "output": None,
            "usage": None,
            "error": str(exc),
        }


async def run_with_tools(
    prompt: str,
    tools: list[dict[str, Any]],
    output_type: dict[str, Any],
    *,
    model: str = "anthropic:claude-sonnet-4-20250514",
    system_prompt: str = "",
    model_settings: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Run a Pydantic-AI agent with dynamically-defined tool functions.

    Each entry in *tools* is a dict describing a callable that the agent can
    invoke.  The bridge creates lightweight Python functions with matching
    signatures and registers them with the agent.

    Tool dict format::

        {
            "name": "get_weather",
            "description": "Return the current weather for a city.",
            "parameters": {
                "city": "str",
                "units": "str"
            },
            "handler": <async callable>   # optional -- see below
        }

    If ``handler`` is omitted the tool becomes a *stub* that returns its
    own parameters as a dict (useful for testing / schema exploration).

    Args:
        prompt: User prompt.
        tools: List of tool descriptors (see format above).
        output_type: Dict describing the desired output schema (same format
            as :func:`run_typed_agent`).
        model: Model identifier string.
        system_prompt: Optional system prompt.
        model_settings: Optional provider settings dict.

    Returns:
        Same result dict shape as :func:`run_typed_agent`, with an
        additional ``tool_calls`` key listing tools the model invoked.
    """
    _ensure_init()

    try:
        Agent = _pydantic_ai.Agent  # noqa: N806
        Tool = _pydantic_ai.Tool  # noqa: N806
        ModelSettings = _pydantic_ai.ModelSettings  # noqa: N806

        output_model = _model_from_fields("AgentOutput", output_type)
        settings = ModelSettings(**model_settings) if model_settings else None

        # Build Tool objects from descriptors
        tool_objects = []
        for tool_desc in tools:
            name = tool_desc["name"]
            description = tool_desc.get("description", "")
            handler = tool_desc.get("handler")

            if handler is None:
                # Create a stub that echoes its kwargs
                async def _stub(**kwargs: Any) -> dict[str, Any]:
                    return kwargs
                handler = _stub

            tool_objects.append(
                Tool(handler, name=name, description=description)
            )

        agent_kwargs: dict[str, Any] = {
            "model": model,
            "output_type": output_model,
            "tools": tool_objects,
        }
        if system_prompt:
            agent_kwargs["system_prompt"] = system_prompt
        if settings is not None:
            agent_kwargs["model_settings"] = settings

        agent = Agent(**agent_kwargs)
        result = await agent.run(prompt)

        usage_dict: Optional[dict[str, Any]] = None
        if result.usage():
            u = result.usage()
            usage_dict = {
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens,
                "total_tokens": u.total_tokens,
                "requests": u.requests,
            }

        output_data = result.output
        if hasattr(output_data, "model_dump"):
            output_data = output_data.model_dump()

        # Extract tool call history from the run messages
        tool_calls: list[dict[str, Any]] = []
        for msg in result.all_messages():
            if hasattr(msg, "parts"):
                for part in msg.parts:
                    part_kind = getattr(part, "part_kind", "")
                    if part_kind == "tool-call":
                        tool_calls.append({
                            "tool_name": getattr(part, "tool_name", ""),
                            "args": getattr(part, "args_as_dict", lambda: {})()
                                if callable(getattr(part, "args_as_dict", None))
                                else getattr(part, "args", {}),
                        })

        return {
            "success": True,
            "output": output_data,
            "usage": usage_dict,
            "tool_calls": tool_calls,
            "error": None,
        }
    except Exception as exc:
        logger.exception("run_with_tools failed")
        return {
            "success": False,
            "output": None,
            "usage": None,
            "tool_calls": [],
            "error": str(exc),
        }


async def create_schema(
    name: str,
    fields: dict[str, Any],
) -> dict[str, Any]:
    """Dynamically create a Pydantic model and return its JSON schema.

    Args:
        name: Class name for the generated model.
        fields: Mapping of field names to type descriptors.  Supported
            descriptors:

            - Simple strings: ``"str"``, ``"int"``, ``"float"``, ``"bool"``
            - Generic strings: ``"list[str]"``, ``"Optional[int]"``
            - Nested dicts: ``{"sub_field": "str"}`` -- creates a nested
              Pydantic model with a name derived from the field.

    Returns:
        A dict with keys:

        - ``name`` (str): The model class name.
        - ``json_schema`` (dict): The full JSON schema for the model.
        - ``field_count`` (int): Number of top-level fields.
    """
    _ensure_init()

    model_cls = _model_from_fields(name, fields)
    return {
        "name": name,
        "json_schema": model_cls.model_json_schema(),
        "field_count": len(fields),
    }


def list_output_modes() -> list[dict[str, str]]:
    """Return the available Pydantic-AI output modes with descriptions.

    Each entry has ``name`` and ``description`` keys.  This function does
    not require initialisation and never fails.
    """
    return [
        {"name": mode, "description": desc}
        for mode, desc in OUTPUT_MODES.items()
    ]


async def estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> dict[str, Any]:
    """Estimate the cost (in USD) for a given token count.

    Attempts to use the ``genai-prices`` library (bundled as a dependency
    of pydantic-ai) for accurate, up-to-date pricing.  Falls back to a
    built-in lookup table if the library is unavailable.

    Args:
        model: Model identifier string, e.g. ``"anthropic:claude-sonnet-4-20250514"``.
        input_tokens: Number of input / prompt tokens.
        output_tokens: Number of output / completion tokens.

    Returns:
        A dict with keys:

        - ``model`` (str): The model queried.
        - ``input_tokens`` (int)
        - ``output_tokens`` (int)
        - ``input_cost_usd`` (float)
        - ``output_cost_usd`` (float)
        - ``total_cost_usd`` (float)
        - ``source`` (str): ``"genai-prices"`` or ``"fallback-table"``.
        - ``warning`` (str | None): Set when the model was not found in any
          price source.
    """
    if not _initialized:
        init()

    # Try genai-prices first
    if _genai_prices is not None:
        try:
            from genai_prices.data_snapshot import get_snapshot

            # Parse provider:model_name from the identifier
            if ":" in model:
                provider_id, model_name = model.split(":", 1)
            else:
                provider_id, model_name = None, model

            snapshot = get_snapshot()
            provider_obj = snapshot.find_provider(None, provider_id, None)
            model_ref = provider_obj.find_model(model_name)

            input_price = model_ref.input_price_per_token * input_tokens
            output_price = model_ref.output_price_per_token * output_tokens

            return {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "input_cost_usd": round(input_price, 6),
                "output_cost_usd": round(output_price, 6),
                "total_cost_usd": round(input_price + output_price, 6),
                "source": "genai-prices",
                "warning": None,
            }
        except Exception:
            logger.debug("genai-prices lookup failed for %s, using fallback", model)

    # Fallback to built-in table
    pricing = _FALLBACK_PRICING.get(model)
    if pricing is not None:
        input_cost = pricing["input"] * input_tokens
        output_cost = pricing["output"] * output_tokens
        return {
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "input_cost_usd": round(input_cost, 6),
            "output_cost_usd": round(output_cost, 6),
            "total_cost_usd": round(input_cost + output_cost, 6),
            "source": "fallback-table",
            "warning": None,
        }

    return {
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_cost_usd": 0.0,
        "output_cost_usd": 0.0,
        "total_cost_usd": 0.0,
        "source": "fallback-table",
        "warning": f"Model '{model}' not found in any pricing source.",
    }


# ===================================================================
# Registry execute() entry-point
# ===================================================================


async def execute(operation: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch an operation by name -- called by :class:`ToolRegistry`.

    This allows the registry to call any bridge function via a single
    ``await bridge.execute("validate_output", {...})`` entry-point.

    Args:
        operation: One of the names returned by :func:`capabilities`.
        params: Keyword arguments forwarded to the target function.

    Returns:
        The result dict from the underlying operation, or an error dict
        if the operation is unknown.
    """
    dispatch: dict[str, Any] = {
        "validate_output": validate_output,
        "run_typed_agent": run_typed_agent,
        "run_with_tools": run_with_tools,
        "create_schema": create_schema,
        "list_output_modes": list_output_modes,
        "estimate_cost": estimate_cost,
    }

    func = dispatch.get(operation)
    if func is None:
        return {
            "error": f"Unknown operation '{operation}'. Available: {list(dispatch.keys())}",
            "success": False,
        }

    # list_output_modes is synchronous
    if operation == "list_output_modes":
        return {"success": True, "data": func()}

    try:
        result = await func(**params)
        return result
    except Exception as exc:
        logger.exception("execute(%s) failed", operation)
        return {"error": str(exc), "success": False}


# ===================================================================
# Internal helpers
# ===================================================================

# Mapping from type-descriptor strings to Python types.
_TYPE_MAP: dict[str, type] = {
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "bytes": bytes,
    "dict": dict,
    "list": list,
    "Any": Any,
}


def _resolve_type(descriptor: Any, field_name: str = "") -> Any:
    """Turn a type-descriptor into a real Python type annotation.

    Supports:
    - Plain strings like ``"str"``, ``"int"``
    - Generic strings like ``"list[str]"``, ``"Optional[int]"``
    - Nested dicts (creates a child Pydantic model)
    - Raw Python types passed directly
    """
    if isinstance(descriptor, dict):
        # Nested model
        child_name = field_name.title().replace("_", "") + "Model" if field_name else "NestedModel"
        return _model_from_fields(child_name, descriptor)

    if isinstance(descriptor, type):
        return descriptor

    if isinstance(descriptor, str):
        # Check simple map first
        if descriptor in _TYPE_MAP:
            return _TYPE_MAP[descriptor]

        # Handle Optional[X]
        if descriptor.startswith("Optional[") and descriptor.endswith("]"):
            inner = descriptor[len("Optional["):-1]
            inner_type = _resolve_type(inner, field_name)
            return Optional[inner_type]  # type: ignore[valid-type]

        # Handle list[X]
        if descriptor.startswith("list[") and descriptor.endswith("]"):
            inner = descriptor[len("list["):-1]
            inner_type = _resolve_type(inner, field_name)
            return list[inner_type]  # type: ignore[valid-type]

        # Handle dict[K, V]
        if descriptor.startswith("dict[") and descriptor.endswith("]"):
            inner = descriptor[len("dict["):-1]
            parts = [p.strip() for p in inner.split(",", 1)]
            if len(parts) == 2:
                key_type = _resolve_type(parts[0], field_name)
                val_type = _resolve_type(parts[1], field_name)
                return dict[key_type, val_type]  # type: ignore[valid-type]
            return dict

        raise ValueError(
            f"Unsupported type descriptor: '{descriptor}'. "
            f"Supported: {list(_TYPE_MAP.keys())} plus Optional[T], list[T], dict[K,V], or nested dicts."
        )

    raise TypeError(f"Cannot resolve type from {type(descriptor).__name__}: {descriptor!r}")


def _model_from_fields(name: str, fields: dict[str, Any]) -> Any:
    """Dynamically create a Pydantic BaseModel from a field descriptor dict.

    Args:
        name: The class name for the new model.
        fields: ``{"field_name": "type_descriptor", ...}``

    Returns:
        A Pydantic ``BaseModel`` subclass.
    """
    _ensure_init()
    from pydantic import create_model  # noqa: WPS433

    field_definitions: dict[str, Any] = {}
    for field_name, descriptor in fields.items():
        resolved = _resolve_type(descriptor, field_name)
        # create_model expects (type,) or (type, default) or (type, FieldInfo)
        field_definitions[field_name] = (resolved, ...)

    return create_model(name, **field_definitions)


def _model_from_schema(name: str, json_schema: dict[str, Any]) -> Any:
    """Create a Pydantic model from a raw JSON Schema dict.

    For simple object schemas with ``properties``, this converts each
    property into a field definition.  For more complex schemas, it falls
    back to Pydantic's TypeAdapter for validation.

    Args:
        name: Class name for the generated model.
        json_schema: A JSON Schema dict (must have ``type: object``).

    Returns:
        A Pydantic ``BaseModel`` subclass.
    """
    _ensure_init()
    from pydantic import create_model  # noqa: WPS433

    properties = json_schema.get("properties", {})
    required = set(json_schema.get("required", []))

    # JSON Schema type -> Python type
    _json_type_map: dict[str, type] = {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
        "array": list,
        "object": dict,
    }

    field_defs: dict[str, Any] = {}
    for prop_name, prop_schema in properties.items():
        json_type = prop_schema.get("type", "string")
        py_type = _json_type_map.get(json_type, Any)

        if prop_name in required:
            field_defs[prop_name] = (py_type, ...)
        else:
            field_defs[prop_name] = (Optional[py_type], None)

    return create_model(name, **field_defs)
