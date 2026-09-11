"""Tenant-scoped durable campaign persistence.

PostgreSQL is the production store. SQLite remains available only when an
explicit offline fallback is needed, so local development stays usable.
"""

import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Protocol

from config import settings

logger = logging.getLogger("campaign_store")


class CampaignStoreProtocol(Protocol):
    def save_campaign(self, tenant_id: str, campaign_id: str, payload: Dict[str, Any]) -> Dict[str, Any]: ...
    def get_campaign(self, tenant_id: str, campaign_id: str) -> Optional[Dict[str, Any]]: ...
    def get_call_state(self, tenant_id: str, campaign_id: str, call_id: str) -> Dict[str, Any]: ...
    def save_call_state(self, tenant_id: str, campaign_id: str, call_id: str, state: Dict[str, Any]) -> None: ...


class SQLiteCampaignStore:
    """Offline development fallback; do not use for multi-instance deployment."""

    def __init__(self, path: str):
        self.path = path
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._initialize()

    def _connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self):
        with self._connection() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS campaigns (
                    tenant_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, campaign_id)
                );
                CREATE TABLE IF NOT EXISTS call_sessions (
                    tenant_id TEXT NOT NULL, campaign_id TEXT NOT NULL, call_id TEXT NOT NULL,
                    state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, campaign_id, call_id)
                );
            """)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def save_campaign(self, tenant_id: str, campaign_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = self._now()
        with self._connection() as connection:
            connection.execute("""
                INSERT INTO campaigns (tenant_id, campaign_id, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, campaign_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at
            """, (tenant_id, campaign_id, json.dumps(payload), now, now))
        return {"campaign_id": campaign_id, "updated_at": now}

    def get_campaign(self, tenant_id: str, campaign_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as connection:
            row = connection.execute("SELECT payload_json, created_at, updated_at FROM campaigns WHERE tenant_id=? AND campaign_id=?", (tenant_id, campaign_id)).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload_json"])
        return {**payload, "created_at": row["created_at"], "updated_at": row["updated_at"]}

    def get_call_state(self, tenant_id: str, campaign_id: str, call_id: str) -> Dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute("SELECT state_json FROM call_sessions WHERE tenant_id=? AND campaign_id=? AND call_id=?", (tenant_id, campaign_id, call_id)).fetchone()
        return json.loads(row["state_json"]) if row else {}

    def save_call_state(self, tenant_id: str, campaign_id: str, call_id: str, state: Dict[str, Any]) -> None:
        with self._connection() as connection:
            connection.execute("""
                INSERT INTO call_sessions (tenant_id, campaign_id, call_id, state_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, campaign_id, call_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at
            """, (tenant_id, campaign_id, call_id, json.dumps(state), self._now()))


class PostgresCampaignStore:
    def __init__(self, database_url: str):
        import psycopg2
        from psycopg2.extras import Json

        self._psycopg2 = psycopg2
        self._json = Json
        self.database_url = database_url
        self._initialize()

    def _connection(self):
        return self._psycopg2.connect(self.database_url, connect_timeout=5)

    def _initialize(self) -> None:
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS campaigns (
                    tenant_id TEXT NOT NULL,
                    campaign_id TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (tenant_id, campaign_id)
                );
                CREATE TABLE IF NOT EXISTS call_sessions (
                    tenant_id TEXT NOT NULL,
                    campaign_id TEXT NOT NULL,
                    call_id TEXT NOT NULL,
                    state JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (tenant_id, campaign_id, call_id),
                    CONSTRAINT call_sessions_campaign_fk FOREIGN KEY (tenant_id, campaign_id)
                        REFERENCES campaigns (tenant_id, campaign_id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS call_sessions_campaign_idx ON call_sessions (tenant_id, campaign_id);
            """)

    def save_campaign(self, tenant_id: str, campaign_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO campaigns (tenant_id, campaign_id, payload)
                VALUES (%s, %s, %s)
                ON CONFLICT (tenant_id, campaign_id) DO UPDATE
                SET payload=EXCLUDED.payload, updated_at=NOW()
                RETURNING updated_at
            """, (tenant_id, campaign_id, self._json(payload)))
            updated_at = cursor.fetchone()[0].isoformat()
        return {"campaign_id": campaign_id, "updated_at": updated_at}

    def get_campaign(self, tenant_id: str, campaign_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT payload, created_at, updated_at FROM campaigns WHERE tenant_id=%s AND campaign_id=%s", (tenant_id, campaign_id))
            row = cursor.fetchone()
        if not row:
            return None
        payload = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        return {**payload, "created_at": row[1].isoformat(), "updated_at": row[2].isoformat()}

    def get_call_state(self, tenant_id: str, campaign_id: str, call_id: str) -> Dict[str, Any]:
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT state FROM call_sessions WHERE tenant_id=%s AND campaign_id=%s AND call_id=%s", (tenant_id, campaign_id, call_id))
            row = cursor.fetchone()
        if not row:
            return {}
        return row[0] if isinstance(row[0], dict) else json.loads(row[0])

    def save_call_state(self, tenant_id: str, campaign_id: str, call_id: str, state: Dict[str, Any]) -> None:
        with self._connection() as connection, connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO call_sessions (tenant_id, campaign_id, call_id, state)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (tenant_id, campaign_id, call_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()
            """, (tenant_id, campaign_id, call_id, self._json(state)))


def create_campaign_store() -> CampaignStoreProtocol:
    backend = settings.CAMPAIGN_STORE_BACKEND.lower()
    if backend not in {"auto", "postgres", "sqlite"}:
        raise ValueError("CAMPAIGN_STORE_BACKEND must be auto, postgres, or sqlite")
    if backend in {"auto", "postgres"} and settings.DATABASE_URL:
        try:
            store = PostgresCampaignStore(settings.DATABASE_URL)
            logger.info("Campaign persistence: PostgreSQL")
            return store
        except Exception:
            if backend == "postgres":
                raise
            logger.warning("PostgreSQL unavailable; using local SQLite fallback", exc_info=True)
    logger.warning("Campaign persistence: local SQLite fallback (not for production)")
    return SQLiteCampaignStore(settings.CAMPAIGN_STORE_PATH)


campaign_store = create_campaign_store()
# Compatibility alias for existing tests/imports.
CampaignStore = SQLiteCampaignStore
