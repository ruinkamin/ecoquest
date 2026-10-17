"""Сквозной сценарный тест всего API на временной SQLite (Neon не трогается).
Запуск из backend/:  .venv/Scripts/python tests/test_flow.py   (или python tests/test_flow.py)"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="ecoquest-test-"))
os.environ.update({
    "DATABASE_URL": f"sqlite+aiosqlite:///{(_tmp / 'test.db').as_posix()}",
    "JWT_SECRET": "test", "DEV_LOGIN": "true", "AI_MODE": "mock", "MAX_REVIEW_ROUNDS": "3", "PASS_PERCENT": "30",
    "DISPUTE_DELTA": "30", "TRUST_WINDOW": "10", "TRUST_THRESHOLD": "0.4", "TRUST_MIN_DECISIONS": "5",
    "UPLOAD_DIR": str(_tmp / "uploads"), "SMTP_HOST": "", "RESET_URL": "", "MODERATOR_EMAILS": "", "GOOGLE_CLIENT_ID": "",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import seed  # noqa: E402

asyncio.run(seed.main())

import io  # noqa: E402
from PIL import Image  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import ai, config  # noqa: E402

def jpeg_with_gps():
    img = Image.new("RGB", (3000, 1500), (40, 120, 60))
    exif = Image.Exif(); exif[0x8825] = {2: (48.0, 27.0, 0.0)}; exif[0x010F] = "Phone"
    buf = io.BytesIO(); img.save(buf, "JPEG", exif=exif); return buf.getvalue()

JPEG = jpeg_with_gps()
PH = lambda: {"photo": ("x.jpg", JPEG, "image/jpeg")}
def h(t): return {"Authorization": f"Bearer {t}"}
def ok(r, code=200):
    assert r.status_code == code, (r.status_code, r.text); return r.json() if r.content else None

with TestClient(app) as c:
    # --- auth + reset
    ok(c.post("/auth/register", json={"email": "anya@mail.com", "password": "secret1", "name": "Аня"}), 201)
    r = ok(c.post("/auth/forgot-password", json={"email": "anya@mail.com"})); token = r["dev_token"]
    assert ok(c.post("/auth/forgot-password", json={"email": "nobody@mail.com"})) == {"ok": True}
    ok(c.post("/auth/reset-password", json={"token": "bad", "password": "newpass1"}), 400)
    ok(c.post("/auth/reset-password", json={"token": token, "password": "newpass1"}))
    ok(c.post("/auth/reset-password", json={"token": token, "password": "newpass2"}), 400)
    ok(c.post("/auth/login", json={"email": "anya@mail.com", "password": "secret1"}), 401)
    a = ok(c.post("/auth/login", json={"email": "anya@mail.com", "password": "newpass1"}))["access_token"]
    me_a = ok(c.get("/me", headers=h(a))); assert me_a["has_password"] and not me_a["has_google"]
    names = ["Рома", "Маша", "Даня", "Боря", "Лара", "Діма", "Партнер"]
    tok = {n: ok(c.post("/auth/dev", json={"name": n}))["access_token"] for n in names}
    ids = {n: ok(c.get("/me", headers=h(t)))["id"] for n, t in tok.items()}
    mod, masha, danya, borya, lara, dima, partner = (tok[n] for n in names)
    team = ok(c.post("/teams", headers=h(a), json={"name": "Еко-друзі"}), 201)
    assert len(team["invite_code"]) == 8 and [member["name"] for member in team["members"]] == ["Аня"]
    joined_team = ok(c.post("/teams/join", headers=h(borya), json={"code": team["invite_code"].lower()}))
    assert joined_team["id"] == team["id"] and {member["name"] for member in joined_team["members"]} == {"Аня", "Боря"}
    assert ok(c.get("/me/teams", headers=h(borya)))[0]["invite_code"] == team["invite_code"]
    ok(c.post("/teams/join", headers=h(borya), json={"code": team["invite_code"]}), 409)
    ok(c.post("/teams/join", headers=h(lara), json={"code": "NOTACODE"}), 404)
    org = ok(c.get("/organizations"))[0]["id"]
    OM = f"/organizations/{org}/moderation"
    assert ok(c.get("/me", headers=h(dima)))["moderated_org_ids"] == [org]
    assert ok(c.get("/me", headers=h(masha)))["moderated_org_ids"] == []

    # --- квест создает только модератор организации; AI предлагает, организация правит и публикует
    form = {"lat": 48.46, "lng": 35.04, "description": "сміття", "organization_id": org}
    ok(c.post("/quests", headers=h(a), data=form, files=PH()), 403)       # не член организации
    ok(c.post("/quests", headers=h(masha), data=form, files=PH()), 403)   # член, но не модератор
    q = ok(c.post("/quests", headers=h(danya), data=form, files=PH()), 201)
    assert q["owner_org_id"] == org
    path = config.UPLOAD_DIR / q["photo_url"].split("/")[-1]
    saved = Image.open(path); assert max(saved.size) == 2560 and not saved.getexif(), "EXIF stripped, resized"
    d = ok(c.get(f"/quests/{q['id']}", headers=h(dima))); assert d["status"] == "pending_moderation" and d["reward_xp"] == 100
    assert d["ai_reason"] and d["owner_org_name"].startswith("ДніпроПуть")
    ok(c.get(f"/quests/{q['id']}", headers=h(borya)), 404)
    ok(c.get(f"{OM}/quests", headers=h(masha)), 403)
    assert [x["id"] for x in ok(c.get(f"{OM}/quests", headers=h(dima)))] == [q["id"]]
    e = ok(c.patch(f"{OM}/quests/{q['id']}", headers=h(dima), json={"difficulty": 4, "title": "Галявина"}))
    assert (e["reward_xp"], e["title"]) == (250, "Галявина")
    ok(c.patch(f"{OM}/quests/{q['id']}", headers=h(dima), json={"reward_xp": 200}))
    p = ok(c.post(f"{OM}/quests/{q['id']}/publish", headers=h(dima)))
    assert (p["status"], p["reward_xp"], p["difficulty"]) == ("available", 200, 4)
    ok(c.post(f"{OM}/quests/{q['id']}/publish", headers=h(dima)), 409)
    ok(c.patch(f"{OM}/quests/{q['id']}", headers=h(dima), json={"reward_xp": 1}), 409)
    hist = ok(c.get(f"{OM}/quests/{q['id']}", headers=h(danya)))["history"]
    print("history", [(x["action"], x["before_json"].get("reward_xp"), x["after_json"].get("reward_xp")) for x in hist])
    assert [x["action"] for x in hist] == ["edit", "edit", "publish"]
    qb = ok(c.post("/quests", headers=h(danya), data=form, files=PH()), 201)
    ok(c.post(f"{OM}/quests/{qb['id']}/block", headers=h(danya), json={"reason": ""}), 422)
    ok(c.post(f"{OM}/quests/{qb['id']}/block", headers=h(danya), json={"reason": "дубль"}))
    d = ok(c.get(f"/quests/{qb['id']}", headers=h(danya))); assert (d["status"], d["moderator_note"]) == ("blocked", "дубль")

    # --- AI отказал: организация может опубликовать сама; hazard — только модератор приложения
    real_check = ai.check_quest
    async def rejecting(photo, description, hazard=False):
        return {"approved": False, "title": "Шприци" if hazard else None, "difficulty": 3, "hazard": hazard, "reason": "test"}
    ai.check_quest = rejecting
    qr = ok(c.post("/quests", headers=h(danya), data=form, files=PH()), 201)
    ok(c.post(f"{OM}/quests/{qr['id']}/publish", headers=h(danya)))
    assert ok(c.get(f"{OM}/quests/{qr['id']}", headers=h(danya)))["history"][-1]["reason"] == "Опубликовано вопреки отказу AI"
    ai.check_quest = lambda photo, description: rejecting(photo, description, hazard=True)
    qh = ok(c.post("/quests", headers=h(danya), data=form, files=PH()), 201)
    ai.check_quest = real_check
    ok(c.post(f"{OM}/quests/{qh['id']}/publish", headers=h(danya)), 409)
    assert [x["id"] for x in ok(c.get("/moderation/quests", headers=h(mod)))] == [qh["id"]]
    ok(c.get("/moderation/quests", headers=h(danya)), 403)
    ok(c.post(f"/moderation/quests/{qh['id']}/block", headers=h(mod), json={"reason": "небезпечно"}))

    # --- метки жителей -> квест организации
    rep = ok(c.post("/reports", headers=h(a), data={"lat": 48.47, "lng": 35.03, "description": "купа сміття"}, files=PH()), 201)
    assert rep["reviewer_type"] == "ai" and rep["review_status"] == "pending"
    assert rep["id"] in [x["id"] for x in ok(c.get("/reports?bbox=34.9,48.3,35.2,48.6"))]
    personal = ok(c.post(
        "/reports", headers=h(a),
        data={"lat": 48.471, "lng": 35.031, "description": "Моя активність", "reviewer_type": "self"},
        files=PH(),
    ), 201)
    assert personal["reviewer_type"] == "self" and personal["review_status"] == "pending"
    assert [x["id"] for x in ok(c.get("/me/reports?reviewer=self&status=pending&q=Моя", headers=h(a)))] == [personal["id"]]
    assert ok(c.post(f"/reports/{personal['id']}/evaluate", headers=h(a), json={"score": 5, "note": "Добре виконано"}))["review_status"] == "evaluated"
    assert ok(c.post(f"/reports/{personal['id']}/evaluate", headers=h(a), json={"score": 4}), 409)
    assert ok(c.get(f"/reports/{personal['id']}", headers=h(borya)))["id"] == personal["id"]
    assert ok(c.get("/me/reports?reviewer=self&status=evaluated", headers=h(a)))[0]["review_score"] == 5
    ok(c.post(f"/reports/{personal['id']}/evaluate", headers=h(borya), json={"score": 4}), 404)
    ok(c.post(f"/reports/{rep['id']}/quest", headers=h(a), json={"organization_id": org}), 403)
    qrep = ok(c.post(f"/reports/{rep['id']}/quest", headers=h(danya), json={"organization_id": org}), 201)
    assert qrep["report_id"] == rep["id"] and qrep["owner_org_id"] == org and qrep["description"] == "купа сміття"
    ok(c.post(f"/reports/{rep['id']}/quest", headers=h(dima), json={"organization_id": org}), 409)
    assert rep["id"] not in [x["id"] for x in ok(c.get("/reports"))]
    assert ok(c.get("/me", headers=h(a)))["lifetime_xp"] == 0

    # --- роли в организации: назначает только глава
    ok(c.patch(f"/organizations/{org}/members/{ids['Маша']}", headers=h(dima), json={"role": "moderator"}), 403)
    ok(c.patch(f"/organizations/{org}/members/{ids['Маша']}", headers=h(danya), json={"role": "moderator"}))
    assert ok(c.get("/me", headers=h(masha)))["moderated_org_ids"] == [org]
    ok(c.patch(f"/organizations/{org}/members/{ids['Маша']}", headers=h(danya), json={"role": "member"}))
    ok(c.patch(f"/organizations/{org}/members/{ids['Даня']}", headers=h(danya), json={"role": "member"}), 409)
    od = ok(c.get(f"/organizations/{org}", headers=h(dima)))
    assert od["is_moderator"] and {m["name"]: m["role"] for m in od["members"]} == {"Даня": "moderator", "Маша": "member", "Діма": "moderator"}

    # --- выполнение командой от организации + чат AI и организации
    ok(c.post(f"/quests/{q['id']}/claim", headers=h(borya), json={"mode": "organization", "organization_id": org}), 403)
    ok(c.post(f"/quests/{q['id']}/claim", headers=h(masha), json={"mode": "organization", "organization_id": org}))
    ok(c.post(f"/quests/{q['id']}/claim", headers=h(borya)), 409)
    for n in ["Боря", "Діма", "Лара"]:
        ok(c.post(f"/quests/{q['id']}/participants", headers=h(masha), json={"user_id": ids[n]}), 201)
    ok(c.post(f"/quests/{q['id']}/participation", headers=h(borya), json={"accept": True}))
    ok(c.post(f"/quests/{q['id']}/participation", headers=h(dima), json={"accept": False}))  # Діма не участник -> может проверять
    ok(c.post(f"/quests/{q['id']}/submissions", headers=h(borya), files=PH()), 409)  # не ответственный
    sub = ok(c.post(f"/quests/{q['id']}/submissions", headers=h(masha), files=PH()), 201)
    ok(c.post(f"/quests/{q['id']}/participation", headers=h(lara), json={"accept": True}), 409)  # состав зафиксирован
    mine = ok(c.get(f"/quests/{q['id']}", headers=h(masha)))
    assert mine["status"] == "pending_verification" and mine["last_submission"]["status"] == "org_review"
    assert "messages" not in mine["last_submission"] and "ai_percent" not in mine["last_submission"]  # исполнитель видит только итог
    ok(c.get(f"{OM}/submissions", headers=h(masha)), 403)
    s = ok(c.get(f"{OM}/submissions", headers=h(dima)))[0]
    assert (s["id"], s["ai_percent"], s["rounds_left"], s["can_review"]) == (sub["id"], 100, 3, True)
    SU = f"{OM}/submissions/{sub['id']}"
    for expected in (70, 55, 47):  # mock AI каждый раз уступает половину разницы
        ok(c.post(f"{SU}/messages", headers=h(dima), json={"percent": 40, "text": "прибрали лише половину галявини"}))
        s = ok(c.get(SU, headers=h(dima))); assert (s["status"], s["ai_percent"]) == ("org_review", expected), s
    ok(c.post(f"{SU}/messages", headers=h(dima), json={"percent": 40, "text": "ще раз"}), 409)  # лимит правок
    print("chat", [(m["author"], m["percent"]) for m in s["messages"]], "| org rounds", s["org_rounds"], "ai revisions", s["ai_revisions"])
    assert (s["org_rounds"], s["ai_revisions"], s["rounds_left"]) == (3, 3, 0) and len(s["messages"]) == 7
    s = ok(c.post(f"{SU}/decision", headers=h(dima), json={"percent": 40, "note": "зараховано частково"}))
    assert (s["status"], s["final_percent"], s["awarded_xp"], s["disputed"]) == ("approved", 40, 80, False)
    ok(c.post(f"{SU}/decision", headers=h(danya), json={"percent": 100}), 409)
    mine = ok(c.get(f"/quests/{q['id']}", headers=h(masha)))["last_submission"]
    assert (mine["status"], mine["final_percent"], mine["awarded_xp"], mine["moderator_note"]) == ("approved", 40, 80, "зараховано частково")
    xp = {n: ok(c.get("/me", headers=h(tok[n])))["lifetime_xp"] for n in ["Маша", "Боря", "Діма", "Лара"]}
    print("xp", xp); assert xp == {"Маша": 80, "Боря": 80, "Діма": 0, "Лара": 0}
    assert ok(c.get(f"/organizations/{org}", headers=h(danya)))["points"] == 80

    seed_q = {x["title"]: x["id"] for x in ok(c.get("/quests?status=available"))}

    # --- конфликт интересов: модератор-исполнитель не решает по своему отчету
    s1 = seed_q["Пофарбувати лавки в парку Глобі"]  # 100 XP
    ok(c.post(f"/quests/{s1}/claim", headers=h(danya)), 403)  # автор не берет свой квест
    ok(c.post(f"/quests/{s1}/claim", headers=h(dima)))
    sid = ok(c.post(f"/quests/{s1}/submissions", headers=h(dima), files=PH()), 201)["id"]
    assert ok(c.get(f"{OM}/submissions/{sid}", headers=h(dima)))["can_review"] is False
    ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(dima), json={"percent": 100}), 403)
    s = ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(danya), json={"percent": 0, "note": "не те місце"}))
    assert (s["status"], s["disputed"]) == ("rejected", True)  # AI ставил 100
    assert ok(c.get(f"/quests/{s1}", headers=h(dima)))["status"] == "in_progress"
    sid = ok(c.post(f"/quests/{s1}/submissions", headers=h(dima), files=PH()), 201)["id"]
    ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(danya), json={"percent": 100}))

    # --- все модераторы организации в команде -> проверить некому, итог за AI.
    # Автора в команду не позвать, поэтому квест создает Маша, пока она модератор.
    ok(c.patch(f"/organizations/{org}/members/{ids['Маша']}", headers=h(danya), json={"role": "moderator"}))
    s2 = ok(c.post("/quests", headers=h(masha), data=form, files=PH()), 201)["id"]
    ok(c.patch(f"{OM}/quests/{s2}", headers=h(masha), json={"reward_xp": 50}))
    ok(c.post(f"{OM}/quests/{s2}/publish", headers=h(masha)))
    ok(c.patch(f"/organizations/{org}/members/{ids['Маша']}", headers=h(danya), json={"role": "member"}))
    ok(c.post(f"/quests/{s2}/claim", headers=h(dima), json={"mode": "team"}))
    ok(c.post(f"/quests/{s2}/participants", headers=h(dima), json={"user_id": ids["Даня"]}), 201)
    ok(c.post(f"/quests/{s2}/participation", headers=h(danya), json={"accept": True}))
    ok(c.post(f"/quests/{s2}/submissions", headers=h(dima), files=PH()), 201)
    last = ok(c.get(f"/quests/{s2}", headers=h(dima)))
    assert last["status"] == "completed" and last["last_submission"]["awarded_xp"] == 50
    assert ok(c.get("/me", headers=h(dima)))["lifetime_xp"] == 150

    # --- AI упал: организация решает вручную, без чата; это не спорное решение
    s3 = seed_q["Прибрати галявину біля Діївки"]  # 150 XP
    ok(c.post(f"/quests/{s3}/claim", headers=h(borya)))
    config.AI_MODE = "gemini"; config.GEMINI_API_KEY = ""
    sid = ok(c.post(f"/quests/{s3}/submissions", headers=h(borya), files=PH()), 201)["id"]
    s = ok(c.get(f"{OM}/submissions/{sid}", headers=h(danya))); assert s["ai_failed"] and s["ai_percent"] is None
    ok(c.post(f"{OM}/submissions/{sid}/messages", headers=h(danya), json={"percent": 50, "text": "?"}), 409)
    s = ok(c.post(f"{OM}/submissions/{sid}/retry-ai", headers=h(danya)))
    assert ok(c.get(f"{OM}/submissions/{sid}", headers=h(danya)))["ai_failed"]  # снова упал
    config.AI_MODE = "mock"
    s = ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(danya), json={"percent": 80}))
    assert (s["status"], s["awarded_xp"], s["disputed"]) == ("approved", 120, False)

    # --- доверие: много решений вопреки AI -> следующее спорное ждет модератора приложения
    s4 = seed_q["Сміття на схилі Червоного Каменю"]  # 250 XP
    ok(c.post(f"/quests/{s4}/claim", headers=h(borya)))
    sid = ok(c.post(f"/quests/{s4}/submissions", headers=h(borya), files=PH()), 201)["id"]
    s = ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(danya), json={"percent": 0}))
    assert s["status"] == "rejected"  # 2 спорных из 5 = 0.4, порог не превышен
    sid = ok(c.post(f"/quests/{s4}/submissions", headers=h(borya), files=PH()), 201)["id"]
    s = ok(c.post(f"{OM}/submissions/{sid}/decision", headers=h(danya), json={"percent": 0, "note": "не віримо"}))
    assert (s["status"], s["org_percent"], s["ai_percent"]) == ("platform_review", 0, 100)  # 3 из 6 = 0.5
    assert ok(c.get(f"/quests/{s4}", headers=h(borya)))["last_submission"]["status"] == "platform_review"
    trust = ok(c.get(f"/organizations/{org}", headers=h(borya)))["trust"]
    print("trust", trust); assert trust == {"decisions": 6, "disputed": 3, "disputed_ratio": 0.5, "under_review": True}
    assert ok(c.get("/moderation/organizations/trust", headers=h(mod)))[0]["trust"]["under_review"]
    assert [x["id"] for x in ok(c.get("/moderation/submissions", headers=h(mod)))] == [sid]
    s = ok(c.post(f"/moderation/submissions/{sid}/decision", headers=h(mod), json={"percent": 100, "note": "сміття прибрано"}))
    assert (s["status"], s["awarded_xp"], [m["author"] for m in s["messages"]][-2:]) == ("approved", 250, ["org", "platform"])
    assert ok(c.get("/me", headers=h(borya)))["spendable_xp"] == 80 + 120 + 250

    # --- магазин
    coffee = [r for r in ok(c.get("/rewards")) if r["cost_xp"] == 150][0]
    ok(c.post(f"/rewards/{coffee['id']}/redeem", headers=h(borya)))
    assert ok(c.get("/me", headers=h(borya)))["spendable_xp"] == 300

    # --- партнеры: заявка -> модератор приложения -> свои награды и коды
    pb = ok(c.post("/partners", headers=h(borya), json={"name": "Шаурма «Боря»"}), 201)
    ok(c.post("/partners", headers=h(borya), json={"name": "Ще одна"}), 409)
    ok(c.post(f"/partners/{pb['id']}/rewards", headers=h(borya), json={"title": "x", "cost_xp": 10}), 409)  # не одобрен
    ok(c.get("/moderation/partners", headers=h(danya)), 403)
    assert len(ok(c.get("/moderation/partners", headers=h(mod)))) == 2  # + заявка Лари из seed
    ok(c.post(f"/moderation/partners/{pb['id']}/decision", headers=h(mod), json={"approved": True}))
    rw = ok(c.post(f"/partners/{pb['id']}/rewards", headers=h(borya), json={"title": "Шаурма -20%", "cost_xp": 100}), 201)
    ok(c.post(f"/partners/{pb['id']}/rewards", headers=h(masha), json={"title": "x", "cost_xp": 10}), 403)
    rw = ok(c.post(f"/partners/{pb['id']}/rewards/{rw['id']}/codes", headers=h(borya), json={"codes": ["SH-1", "SH-2", "SH-1"]}))
    assert rw["available"] == 2 and rw["partner_name"] == "Шаурма «Боря»"
    ok(c.post(f"/partners/{pb['id']}/rewards/{rw['id']}/codes", headers=h(borya), json={"codes": ["SH-1"]}), 409)
    assert rw["id"] in [x["id"] for x in ok(c.get("/rewards"))]
    ok(c.patch(f"/partners/{pb['id']}/rewards/{rw['id']}", headers=h(borya), json={"is_active": False}))
    assert rw["id"] not in [x["id"] for x in ok(c.get("/rewards"))]
    assert len(ok(c.get(f"/partners/{pb['id']}/rewards", headers=h(borya)))) == 1

    # --- статистика: публичная витрина, профиль игрока, организация
    st = ok(c.get("/stats"))  # без авторизации
    print("stats", {k: v for k, v in st.items() if k != "weeks"})
    assert (st["places_cleaned"], st["reports_total"], st["reports_converted"]) == (5, 3, 1)
    assert (st["volunteers"], st["xp_awarded"], st["promo_codes_issued"]) == (4, 730, 1)
    assert (st["organizations"], st["partners"], st["ai_agreement"]) == (1, 4, 0.5)
    assert len(st["weeks"]) == 8 and st["weeks"][-1]["places_cleaned"] == 5 and st["weeks"][-1]["reports"] == 3
    bs = ok(c.get(f"/users/{ids['Боря']}/stats", headers=h(masha)))
    print("borya", {k: v for k, v in bs.items() if k != "user"})
    assert (bs["quests_completed"], bs["submissions_approved"], bs["submissions_rejected"], bs["reliability"]) == (3, 2, 1, 0.67)
    assert (bs["lifetime_xp"], bs["level"], bs["level_progress_xp"]) == (450, 1, 450)
    ast = ok(c.get("/me/stats", headers=h(a))); assert (ast["reports_created"], ast["reports_converted"]) == (2, 1)
    ok(c.get("/users/999999/stats", headers=h(a)), 404)
    os_ = ok(c.get(f"/organizations/{org}/stats"))
    print("org stats", {k: v for k, v in os_.items() if k not in ("organization", "trust")})
    assert (os_["quests_created"], os_["quests_published"], os_["quests_completed_owned"]) == (11, 8, 5)
    assert (os_["quests_completed_as_executor"], os_["reports_converted"], os_["avg_completion_percent"]) == (1, 1, 84.0)
    assert os_["trust"]["under_review"]

    # --- «Доказ добра»: мапа змін и публичное портфолио (без входа)
    im = ok(c.get("/impact"))
    assert len(im) == 5 and all(x["photo_after_url"] != x["photo_before_url"] for x in im)
    iq = next(x for x in im if x["quest_id"] == q["id"])
    assert (iq["final_percent"], [u["name"] for u in iq["team"]]) == (40, ["Маша", "Боря"])
    assert iq["owner_org_name"] == iq["executor_org_name"] == od["name"] and "email" not in iq["team"][0]
    assert ok(c.get("/impact?bbox=30,40,31,41")) == []
    ok(c.get("/impact?bbox=bad"), 422)
    pf = ok(c.get(f"/users/{ids['Боря']}/portfolio"))
    print("portfolio", [(x["quest_id"], x["final_percent"], x["awarded_xp"]) for x in pf["items"]])
    assert {x["quest_id"]: x["awarded_xp"] for x in pf["items"]} == {q["id"]: 80, s3: 120, s4: 250}
    assert pf["stats"]["reliability"] == 0.67 and pf["items"][0]["quest_id"] == s4  # новые первыми
    assert ok(c.get(f"/users/{ids['Лара']}/portfolio"))["items"] == []
    ok(c.get("/users/999999/portfolio"), 404)

    # --- гость (без входа): карта, рейтинг, детали квеста, профили
    free = [x for x in ok(c.get("/quests?status=available")) if x["created_by"] != ids["Боря"]][0]
    g = ok(c.get(f"/quests/{free['id']}"))
    assert g["actions"]["can_claim"] and g["my_participation"] is None and g["ai_reason"] is None
    ok(c.get(f"/quests/{qrep['id']}"), 404)                                    # еще на модерации
    ok(c.get(f"/quests/{q['id']}", headers={"Authorization": "Bearer bad"}), 401)  # токен истек — не гость
    go = ok(c.get(f"/organizations/{org}")); assert not (go["is_head"] or go["is_member"]) and "trust" in go
    ok(c.get(f"/organizations/{org + 1}"), 404)                                 # заявка Лары не одобрена
    assert ok(c.get(f"/partners/{pb['id']}"))["status"] == "approved"
    assert ok(c.get(f"/users/{ids['Боря']}/stats"))["quests_completed"] == 3
    assert ok(c.get("/leaderboard"))[0]["user"]["name"] == "Боря"
    ok(c.post(f"/quests/{free['id']}/claim"), 401)                              # действия — только со входом

    # --- фильтры карты
    shore = [x for x in ok(c.get("/quests?status=available")) if (x["title"] or "").startswith("Прибрати берег")][0]
    assert all(x["difficulty"] == 3 for x in ok(c.get("/quests?difficulty=3"))) and ok(c.get("/quests?difficulty=5")) == []
    assert [x["id"] for x in ok(c.get("/quests?q=Монастирського"))] == [shore["id"]]
    near = ok(c.get(f"/quests?near={shore['lat']},{shore['lng']}&radius_km=1"))
    assert near[0]["id"] == shore["id"] and near[0]["distance_km"] == 0
    assert all(x["distance_km"] <= 1 for x in near) and [x["distance_km"] for x in near] == sorted(x["distance_km"] for x in near)
    assert ok(c.get(f"/quests?organization_id={org}")) and ok(c.get("/quests?organization_id=999")) == []
    ok(c.get("/quests?near=bad"), 422)
    ok(c.get("/quests?difficulty=x"), 422)

    # --- статистика спонсора
    coffee_partner = ok(c.get("/partners"))[0]["id"]
    ps = ok(c.get(f"/partners/{coffee_partner}/stats", headers=h(partner)))
    print("partner stats", {k: v for k, v in ps.items() if k not in ("partner", "rewards")})
    assert (ps["codes_total"], ps["codes_issued"], ps["unique_users"], ps["xp_spent"], ps["issued_last_7_days"]) == (10, 1, 1, 150, 1)
    ok(c.get(f"/partners/{coffee_partner}/stats", headers=h(lara)), 404)          # не глава
    assert ok(c.get(f"/partners/{coffee_partner}/stats", headers=h(mod)))["codes_issued"] == 1
    pbs = ok(c.get(f"/partners/{pb['id']}/stats", headers=h(borya)))
    assert (pbs["rewards_active"], pbs["codes_available"], pbs["rewards"][0]["is_active"]) == (0, 2, False)

    # --- отказ от квеста: только ответственный, команда снимается
    ok(c.post(f"/quests/{shore['id']}/claim", headers=h(a), json={"mode": "team"}))
    ok(c.post(f"/quests/{shore['id']}/participants", headers=h(a), json={"user_id": ids["Боря"]}), 201)
    ok(c.post(f"/quests/{shore['id']}/participation", headers=h(borya), json={"accept": True}))
    assert ok(c.get(f"/quests/{shore['id']}", headers=h(a)))["actions"]["can_abandon"]
    assert not ok(c.get(f"/quests/{shore['id']}", headers=h(borya)))["actions"]["can_abandon"]
    ok(c.post(f"/quests/{shore['id']}/abandon", headers=h(borya)), 409)
    ab = ok(c.post(f"/quests/{shore['id']}/abandon", headers=h(a)))
    assert (ab["status"], ab["executor_id"], ab["mode"]) == ("available", None, None)
    assert ok(c.get(f"/quests/{shore['id']}"))["participants"] == []
    ok(c.post(f"/quests/{shore['id']}/abandon", headers=h(a)), 409)
    ok(c.post(f"/quests/{shore['id']}/claim", headers=h(borya)))                 # снова можно взять
    ok(c.post(f"/quests/{shore['id']}/abandon", headers=h(borya)))

    # --- заявки организаций + участники
    app_ = ok(c.post("/organizations", headers=h(borya), json={"name": "Боря і Ко"}), 201)
    ok(c.post(f"/moderation/organizations/{app_['id']}/decision", headers=h(mod), json={"approved": True}))
    assert app_["id"] in ok(c.get("/me", headers=h(borya)))["moderated_org_ids"]
    org_history = ok(c.get(f"/organizations/{org}/impact"))
    assert all("photo_before_url" in item and "photo_after_url" in item for item in org_history)
    new_org_rank = next(
        entry for entry in ok(c.get("/leaderboard/organizations?limit=100"))
        if entry["organization"]["id"] == app_["id"]
    )
    assert new_org_rank["points"] == 0
    ok(c.post(f"/organizations/{org}/members", headers=h(danya), json={"email": "anya@mail.com"}), 201)
    ok(c.post(f"/organizations/{org}/members", headers=h(masha), json={"user_id": ids["Боря"]}), 403)
    acts = ok(c.get("/moderation/actions", headers=h(mod)))
    print("actions", sorted({(x["target_type"], x["action"]) for x in acts}))
    print("org leaderboard", [(x["organization"]["name"], x["points"]) for x in ok(c.get("/leaderboard/organizations"))])
    ok(c.post("/reports", headers=h(a), data={"lat": 1, "lng": 2}, files={"photo": ("x.jpg", b"\xff\xd8\xffjunk", "image/jpeg")}), 415)
    # настоящая картинка, но не JPEG/PNG/WebP: Pillow не должен даже пробовать другие декодеры
    gif = io.BytesIO(); Image.new("RGB", (50, 50), (200, 0, 0)).save(gif, "GIF")
    r = ok(c.post("/reports", headers=h(a), data={"lat": 1, "lng": 2}, files={"photo": ("x.jpg", gif.getvalue(), "image/jpeg")}), 415)
    assert "JPEG" in r["detail"]
    # --- автора квеста нельзя позвать в чужую команду
    ok(c.post(f"/quests/{qr['id']}/claim", headers=h(borya), json={"mode": "team"}))
    ok(c.post(f"/quests/{qr['id']}/participants", headers=h(borya), json={"user_id": ids["Даня"]}), 403)

    # --- real email path with fake SMTP server
    import app.mailer as mailer
    sent = []
    class FakeSMTP:
        def __init__(self, host, port, timeout=None): sent.append(("connect", host, port))
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def starttls(self, context=None): sent.append(("tls",))
        def login(self, u, p): sent.append(("login", u))
        def send_message(self, msg): sent.append(("msg", msg))
    mailer.smtplib.SMTP = FakeSMTP
    config.SMTP_HOST, config.SMTP_PORT, config.SMTP_USER, config.SMTP_PASSWORD, config.SMTP_FROM = "smtp.test", 587, "bot@test", "pw", "bot@test"
    config.RESET_URL = "https://front.test/reset?token={token}"
    r = ok(c.post("/auth/forgot-password", json={"email": "ANYA@mail.com"}))
    msg = [x for x in sent if x[0] == "msg"][0][1]
    body = msg.get_body(("plain",)).get_content()
    assert msg["To"] == "anya@mail.com" and r["dev_token"] in body and "https://front.test/reset?token=" in body
    assert ("tls",) in sent and ("login", "bot@test") in sent
    print("email:", msg["Subject"], "| link in body:", "front.test" in body)
    ok(c.post("/auth/reset-password", json={"token": r["dev_token"], "password": "viaemail1"}))

    # --- Google: без настроенных client id — 503; токен проверяется по всем client id (Web/Android/iOS)
    import app.auth as auth_mod
    config.GOOGLE_CLIENT_IDS = []
    ok(c.post("/auth/google", json={"id_token": "x"}), 503)
    seen = {}
    def fake_verify(token, request, audience):
        seen["audience"] = audience
        return {"sub": "g-rn-1", "email": "anya@mail.com", "email_verified": True, "name": "Anya", "picture": None}
    auth_mod.id_token.verify_oauth2_token = fake_verify
    config.GOOGLE_CLIENT_IDS = ["web.apps.googleusercontent.com", "android.apps.googleusercontent.com"]
    g = ok(c.post("/auth/google", json={"id_token": "x"}))
    assert seen["audience"] == config.GOOGLE_CLIENT_IDS
    assert ok(c.get("/me", headers=h(g["access_token"])))["has_google"]
    print("ALL OK")
