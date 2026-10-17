"""Демо-данные: пользователи, организация с модераторами, квесты вокруг Днепра, метка жителя,
партнеры с наградами и промокодами.
Запуск: python seed.py  (идемпотентно — повторный запуск не дублирует)."""
import asyncio

from sqlalchemy import select

from app.database import SessionLocal, init_db
from app.models import (
    Organization, OrganizationMember, OrgRole, OrgStatus, Partner, PromoCode, Quest, QuestStatus, Report, Reward,
    Role, User,
)
from app import config

USERS = ["Рома", "Маша", "Діма", "Даня", "Лара", "Партнер"]
MODERATOR = "Рома"  # модератор приложения
# (name, description, head, members, moderators, status). Глава — модератор организации всегда.
ORGS = [
    ("ДніпроПуть (демо)", "Спільнота, що прибирає зелені зони Дніпра", "Даня", ["Маша", "Діма"], ["Діма"],
     OrgStatus.APPROVED),
    ("Студрада НТУ ДП (демо)", "Заявка для показу модерації", "Лара", [], [], OrgStatus.PENDING),
]

# (title, description, lat, lng, difficulty). Все квесты — организации ДніпроПуть, создал Даня.
QUESTS = [
    ("Прибрати галявину біля Діївки", "Пакети й пляшки біля стежки", 48.4920, 34.9600, 3),
    ("Сміття на схилі Червоного Каменю", "Велике скупчення після вихідних", 48.4300, 35.0050, 4),
    ("Пофарбувати лавки в парку Глобі", "Облізла фарба на 3 лавках", 48.4573, 35.0550, 2),
    ("Прибрати берег біля Монастирського острова", "Пластик на березі", 48.4580, 35.0700, 3),
    ("Допомогти притулку з вигулом", "Потрібні 2 години в суботу", 48.5100, 35.0300, 1),
]

# Метка жителя, из которой организация может сделать квест.
REPORTS = [("Маша", "Звалище шин біля гаражів", 48.4700, 35.0200)]

# (partner, head, status, rewards: [(title, terms, cost, code prefix)])
PARTNERS = [
    ("Кав'ярня «Зерно»", "Партнер", OrgStatus.APPROVED,
     [("Капучино безкоштовно", "Одна кава на чек. Діє до кінця місяця.", 150, "COFFEE")]),
    ("Велопрокат «Педаль»", "Партнер", OrgStatus.APPROVED,
     [("Година прокату -50%", "Пред'явіть код на касі.", 300, "BIKE")]),
    ("Книгарня «Сторінка»", "Партнер", OrgStatus.APPROVED,
     [("Знижка 15% на книгу", "Не сумується з іншими акціями.", 500, "BOOK")]),
    ("Піцерія «Скибка» (заявка)", "Лара", OrgStatus.PENDING, []),
]

PLACEHOLDER = "https://placehold.co/800x600/2f855a/ffffff?text=EcoQuest"


async def main():
    await init_db()
    async with SessionLocal() as db:
        users = {}
        for name in USERS:
            sub = f"dev:{name.lower()}"
            u = await db.scalar(select(User).where(User.google_sub == sub))
            if u is None:
                u = User(google_sub=sub, name=name)
                db.add(u)
            users[name] = u
        users[MODERATOR].role = Role.MODERATOR
        await db.flush()

        if not await db.scalar(select(Organization.id).limit(1)):
            for name, desc, head, members, moderators, status in ORGS:
                org = Organization(name=name, description=desc, head_id=users[head].id, status=status)
                db.add(org)
                await db.flush()
                for m in [head, *members]:
                    role = OrgRole.MODERATOR if m == head or m in moderators else OrgRole.MEMBER
                    db.add(OrganizationMember(organization_id=org.id, user_id=users[m].id, role=role))
        owner = await db.scalar(select(Organization).where(Organization.status == OrgStatus.APPROVED).limit(1))

        if not await db.scalar(select(Quest.id).limit(1)):
            for title, desc, lat, lng, diff in QUESTS:
                db.add(Quest(
                    created_by=owner.head_id, owner_org_id=owner.id, title=title, description=desc,
                    lat=lat, lng=lng, photo_url=PLACEHOLDER, status=QuestStatus.AVAILABLE,
                    difficulty=diff, reward_xp=config.REWARD_TABLE[diff], ai_result={"reason": "seed"},
                ))

        if not await db.scalar(select(Report.id).limit(1)):
            for author, desc, lat, lng in REPORTS:
                db.add(Report(created_by=users[author].id, description=desc, lat=lat, lng=lng, photo_url=PLACEHOLDER))

        if not await db.scalar(select(Partner.id).limit(1)):
            for name, head, status, rewards in PARTNERS:
                partner = Partner(name=name, head_id=users[head].id, status=status)
                db.add(partner)
                await db.flush()
                for title, terms, cost, prefix in rewards:
                    r = Reward(partner_id=partner.id, partner_name=name, title=title, terms=terms, cost_xp=cost)
                    db.add(r)
                    await db.flush()
                    for n in range(1, 11):
                        db.add(PromoCode(reward_id=r.id, code=f"DEMO-{prefix}-{n:03d}"))

        await db.commit()
    print("seed ok")


if __name__ == "__main__":
    asyncio.run(main())
