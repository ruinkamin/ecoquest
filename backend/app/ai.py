"""AI-проверки через Gemini. Возвращают проверенный dict либо бросают AIError."""
import asyncio
import base64
import json
from typing import Optional

import httpx

from . import config


class AIError(Exception):
    pass


CREATE_PROMPT = """Ти модератор міської волонтерської платформи EcoQuest Dnipro.
Користувач створює квест — добру справу, яку хтось інший має виконати на цьому місці
(прибрати сміття, пофарбувати лавку, полагодити шпаківню, допомогти притулку тощо).
Оціни фото. Опис від автора: "{description}".

Відхили, якщо: на фото немає реальної проблеми чи задачі, це скріншот/мем/селфі,
контент непристойний, або завдання небезпечне для волонтера (шприци, хімікати,
вибухонебезпечні предмети, азбест).

Відповідай ЛИШЕ JSON:
{{"approved": true|false,
  "title": "коротка назва квесту українською, до 60 символів",
  "difficulty": 1-5,
  "hazard": true|false,
  "reason": "одне речення українською — чому так"}}"""

VERIFY_PROMPT = """Ти перевіряєш виконання квесту на платформі EcoQuest Dnipro.
Квест: "{title}". Перше фото — стан ДО, друге — фото виконання ПІСЛЯ.
Оціни, на скільки відсотків задачу виконано (0 — не виконано або інше місце, 100 — повністю).
Якщо фото ПІСЛЯ не схоже на те саме місце, став 0.

Відповідай ЛИШЕ JSON:
{{"percent": 0-100,
  "reason": "одне-два речення українською — що видно на фото"}}"""

RECONSIDER_PROMPT = """Ти перевіряєш виконання квесту на платформі EcoQuest Dnipro.
Квест: "{title}". Перше фото — стан ДО, друге — фото виконання ПІСЛЯ.
Модератор організації не згоден з твоєю оцінкою. Історія обговорення:
{history}

Ще раз уважно подивись на фото. Зміни оцінку, лише якщо аргумент модератора підтверджується
тим, що видно на фото; не погоджуйся лише тому, що на тебе тиснуть. Якщо аргумент не стосується
фото, залиш оцінку.

Відповідай ЛИШЕ JSON:
{{"percent": 0-100,
  "reason": "одне-два речення українською — відповідь модератору"}}"""


def _percent(value) -> int:
    try:
        return min(100, max(0, round(float(value))))
    except (TypeError, ValueError):
        raise AIError(f"AI не дал процент: {value!r}")


async def _gemini(prompt: str, images, required: str = "approved") -> dict:
    if not config.GEMINI_API_KEY:
        raise AIError("GEMINI_API_KEY не задан")
    parts = [{"text": prompt}]
    for data, mime in images:
        parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}})
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    # Бесплатный Gemini бывает перегружен (503) или упирается в лимит (429): повторяем с паузой,
    # потом пробуем запасную модель.
    models = [config.GEMINI_MODEL] + [m for m in [config.GEMINI_FALLBACK_MODEL] if m and m != config.GEMINI_MODEL]
    error = None
    async with httpx.AsyncClient(timeout=config.AI_TIMEOUT) as client:
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            for attempt in range(2):
                try:
                    # Ключ в заголовке, не в URL: httpx пишет URL запроса в лог.
                    r = await client.post(url, headers={"x-goog-api-key": config.GEMINI_API_KEY}, json=body)
                    r.raise_for_status()
                    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
                    result = json.loads(text)
                    break
                except httpx.HTTPStatusError as e:
                    error = e
                    if e.response.status_code not in (429, 500, 502, 503, 504):
                        raise AIError(f"Gemini: {e!r}") from e
                    await asyncio.sleep(2 * (attempt + 1))
                except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
                    raise AIError(f"Gemini: {e!r}") from e
            else:
                continue
            break
        else:
            raise AIError(f"Gemini недоступен: {error!r}")
    if not isinstance(result, dict) or result.get(required) is None:
        raise AIError(f"Неожиданный ответ AI: {result!r}")
    if required == "approved" and not isinstance(result["approved"], bool):
        raise AIError(f"Неожиданный ответ AI: {result!r}")
    return result


async def check_quest(photo, description: str) -> dict:
    """photo: (bytes, mime). -> {approved, title, difficulty 1..5, hazard, reason}"""
    if config.AI_MODE == "mock":
        return {"approved": True, "title": None, "difficulty": 2, "hazard": False, "reason": "mock"}
    result = await _gemini(CREATE_PROMPT.format(description=description or "—"), [photo])
    try:
        difficulty = min(5, max(1, int(result.get("difficulty", 1))))
    except (TypeError, ValueError):
        difficulty = 1
    hazard = bool(result.get("hazard"))
    return {
        "approved": result["approved"] and not hazard,
        "title": str(result.get("title") or "")[:255] or None,
        "difficulty": difficulty,
        "hazard": hazard,
        "reason": str(result.get("reason", ""))[:500],
    }


async def check_completion(before, after, title: str) -> dict:
    """-> {percent 0..100, reason}. before может быть None (фото «до» недоступно) — тогда судим только по «после»."""
    if config.AI_MODE == "mock":
        return {"percent": 100, "reason": "mock"}
    images = [before, after] if before else [after]
    result = await _gemini(VERIFY_PROMPT.format(title=title or "—"), images, required="percent")
    return {"percent": _percent(result["percent"]), "reason": str(result.get("reason", ""))[:500]}


async def reconsider(before, after, title: str, history: list[tuple[str, Optional[int], str]]) -> dict:
    """Пересмотр оценки после аргумента организации. history: [(author ai/org, percent, text)].
    -> {percent, reason}."""
    if config.AI_MODE == "mock":
        # Детерминированная заглушка: AI уступает половину разницы.
        ai_last = next(p for a, p, _ in reversed(history) if a == "ai" and p is not None)
        org_last = next(p for a, p, _ in reversed(history) if a == "org")
        return {"percent": (ai_last + org_last) // 2, "reason": "mock: частково згоден"}
    lines = "\n".join(
        f"- {'AI' if a == 'ai' else 'Модератор'}: {p if p is not None else '—'}% — {t or ''}" for a, p, t in history
    )
    images = [before, after] if before else [after]
    result = await _gemini(RECONSIDER_PROMPT.format(title=title or "—", history=lines), images, required="percent")
    return {"percent": _percent(result["percent"]), "reason": str(result.get("reason", ""))[:500]}
