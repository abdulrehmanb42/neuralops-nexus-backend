from typing import Optional

from ninja import Schema


class ScheduleCreateIn(Schema):
    persona_id: str
    query_text: str
    label: str = ""

    schedule_kind: str  # "interval" | "crontab" | "clocked"

    # interval
    interval_every: Optional[int] = None
    interval_period: Optional[str] = None  # "minutes" | "hours" | "days" | "weeks"

    # crontab -- defaults ("0 * * * * *" equivalent-ish) match
    # django_celery_beat.CrontabSchedule's own defaults (every minute) so an
    # omitted field doesn't silently mean something unexpected.
    crontab_minute: str = "0"
    crontab_hour: str = "*"
    crontab_day_of_week: str = "*"
    crontab_day_of_month: str = "*"
    crontab_month_of_year: str = "*"

    # clocked -- ISO 8601 datetime string, one-time fire
    clocked_time: Optional[str] = None

    timezone: str = "UTC"
    trigger_visible: bool = True
    catch_up_missed: bool = True


class ScheduleUpdateIn(Schema):
    """Partial update -- only fields the caller sends are applied."""
    query_text: Optional[str] = None
    label: Optional[str] = None
    is_paused: Optional[bool] = None


class ScheduleOut(Schema):
    id: str
    topic_id: str
    persona_id: str
    persona_name: str
    query_text: str
    label: str
    schedule_kind: str
    schedule_summary: str  # human-readable, e.g. "Daily at 09:00 UTC"
    timezone: str
    trigger_visible: bool
    catch_up_missed: bool
    is_paused: bool
    created_by_id: Optional[str] = None
    last_run_at: Optional[str] = None
    last_status: str
    last_error: Optional[str] = None
    created_at: str
