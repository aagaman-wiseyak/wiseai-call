"""Durable tenant-scoped campaign and call-session storage.

SQLite is intentionally used for the self-contained deployment/demo. The
repository boundary keeps the API independent of storage so a managed
Postgres implementation can replace it without changing call orchestration.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from config import settings


class CampaignStore:
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
                    tenant_id TEXT NOT NULL,
                    campaign_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, campaign_id)
                );
                CREATE TABLE IF NOT EXISTS call_sessions (
                    tenant_id TEXT NOT NULL,
                    campaign_id TEXT NOT NULL,
                    call_id TEXT NOT NULL,
                    state_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, campaign_id, call_id),
                    FOREIGN KEY (tenant_id, campaign_id)
                        REFERENCES campaigns(tenant_id, campaign_id)
                );
            """)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def save_campaign(self, tenant_id: str, campaign_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        now = self._now()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO campaigns (tenant_id, campaign_id, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, campaign_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (tenant_id, campaign_id, json.dumps(payload), now, now),
            )
        return {"campaign_id": campaign_id, "updated_at": now}

    def get_campaign(self, tenant_id: str, campaign_id: str) -> Optional[Dict[str, Any]]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT payload_json, created_at, updated_at FROM campaigns WHERE tenant_id = ? AND campaign_id = ?",
                (tenant_id, campaign_id),
            ).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload_json"])
        payload["created_at"] = row["created_at"]
        payload["updated_at"] = row["updated_at"]
        return payload

    def get_call_state(self, tenant_id: str, campaign_id: str, call_id: str) -> Dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT state_json FROM call_sessions WHERE tenant_id = ? AND campaign_id = ? AND call_id = ?",
                (tenant_id, campaign_id, call_id),
            ).fetchone()
        return json.loads(row["state_json"]) if row else {}

    def save_call_state(self, tenant_id: str, campaign_id: str, call_id: str, state: Dict[str, Any]) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO call_sessions (tenant_id, campaign_id, call_id, state_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, campaign_id, call_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at
                """,
                (tenant_id, campaign_id, call_id, json.dumps(state), self._now()),
            )


campaign_store = CampaignStore(settings.CAMPAIGN_STORE_PATH)
