"""Отправка писем через SMTP (stdlib). Например Gmail: smtp.gmail.com:587 + пароль приложения.
Если SMTP_HOST не задан, письма не отправляются, а пишутся в лог."""
import html as html_lib
import logging
import smtplib
import ssl
from email.message import EmailMessage

from fastapi.concurrency import run_in_threadpool

from . import config

log = logging.getLogger("ecoquest")


def enabled() -> bool:
    return bool(config.SMTP_HOST)


def _send(to: str, subject: str, text: str, html: str | None):
    msg = EmailMessage()
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    if config.SMTP_PORT == 465:
        smtp = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=context, timeout=20)
    else:
        smtp = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20)
    with smtp:
        if config.SMTP_PORT != 465:
            smtp.starttls(context=context)
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send(to: str, subject: str, text: str, html: str | None = None):
    """Вызывается из BackgroundTasks: ошибки только логируем, пользователю ответ уже отдан."""
    if not enabled():
        log.info("SMTP не настроен, письмо для %s не отправлено: %s\n%s", to, subject, text)
        return
    try:
        await run_in_threadpool(_send, to, subject, text, html)
        log.info("Письмо отправлено: %s -> %s", subject, to)
    except (smtplib.SMTPException, OSError) as e:
        log.error("Не удалось отправить письмо %s: %r", to, e)


async def send_password_reset(to: str, name: str, token: str):
    minutes = config.RESET_TOKEN_MINUTES
    if config.RESET_URL:
        link = config.RESET_URL.format(token=token)
        action_text = f"Щоб задати новий пароль, перейдіть за посиланням:\n{link}"
        action_html = f'<p><a href="{link}">Задати новий пароль</a></p>'
    else:
        action_text = f"Код для скидання пароля (вставте його в застосунку):\n{token}"
        action_html = f"<p>Код для скидання пароля:</p><p><code>{token}</code></p>"
    text = (
        f"Вітаємо, {name}!\n\n"
        f"Хтось (сподіваємось, ви) попросив скинути пароль в EcoQuest Dnipro.\n\n"
        f"{action_text}\n\n"
        f"Діє {minutes} хв і спрацює один раз. Якщо це були не ви — просто ігноруйте лист."
    )
    html = (
        f"<p>Вітаємо, {html_lib.escape(name)}!</p>"
        f"<p>Хтось (сподіваємось, ви) попросив скинути пароль в EcoQuest Dnipro.</p>"
        f"{action_html}"
        f"<p>Діє {minutes} хв і спрацює один раз. Якщо це були не ви — просто ігноруйте лист.</p>"
    )
    await send(to, "EcoQuest Dnipro — скидання пароля", text, html)
