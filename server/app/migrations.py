"""Small, additive upgrades for existing research databases.

Only explicitly supported missing columns are added. Never infer a general
schema rewrite from ORM metadata or replace data in existing rows.
"""

from __future__ import annotations

from sqlalchemy import JSON, inspect
from sqlalchemy.engine import Connection


def upgrade_legacy_schema(connection: Connection) -> None:
    """Run inside the startup transaction; old job payloads remain SQL NULL."""
    inspector = inspect(connection)
    if not inspector.has_table("jobs"):
        return
    columns = {column["name"] for column in inspector.get_columns("jobs")}
    if "payload" not in columns:
        payload_type = JSON().compile(dialect=connection.dialect)
        connection.exec_driver_sql(f"ALTER TABLE jobs ADD COLUMN payload {payload_type}")
