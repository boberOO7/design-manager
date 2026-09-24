#!/usr/bin/env python3
"""Read a linked production dump, sanitize it, and restore it only to local Supabase."""

import hashlib
import tempfile
from contextlib import nullcontext
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local/prod-snapshot"
MANIFEST = CACHE / "current.json"
DEV_EMAIL = "dev@studioflow.local"
EXCLUDED = (
    "google_calendar_server_credentials",
    "google_calendar_connections",
    "google_calendar_event_mappings",
    "google_calendar_reconciliation_jobs",
    "finance_currencies",  # Seeded by a migration during every local reset.
)
COPY = re.compile(r'^COPY "public"\."([a-z_]+)" \((.+)\) FROM stdin;$')
UUID = re.compile(r"^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$", re.I)
SECRET_FIELD = re.compile(
    r"password|passphrase|secret|token|credential|authorization|api[_-]?key|"
    r"private[_-]?key|signing[_-]?key|access[_-]?key|webhook|smtp|database[_-]?url|"
    r"connection[_-]?string",
    re.I,
)
SECRET_VALUE = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"\b(?:sb_secret_|sk-|gh[pousr]_|AIza|ya29\.)[A-Za-z0-9_-]{20,}\b|"
    r"\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b|"
    r"\bBearer\s+[A-Za-z0-9._~-]{20,}\b|"
    r"([?&](?:access_token|refresh_token|api_key|client_secret|webhook_secret|password|token)=)[^&\s]+",
    re.I,
)


def command(args, *, capture=True, env=None):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=capture, env=env)
    if result.returncode:
        detail = (result.stderr or result.stdout or "unknown error").strip()[-1200:]
        raise RuntimeError(f"{' '.join(args[:3])} failed: {detail}")
    return result.stdout


def read_only_source():
    """Require an existing read-only role on the currently linked project."""
    linked = ROOT / "supabase/.temp/linked-project.json"
    if not linked.exists():
        raise RuntimeError("Supabase project is not linked")
    ref = json.loads(linked.read_text())["ref"]
    url = os.environ.get("STUDIOFLOW_PROD_READONLY_DB_URL", "")
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme not in ("postgres", "postgresql") or not parsed.username or
            not parsed.password or not parsed.hostname or parsed.port != 5432 or
            parsed.path != "/postgres"):
        raise RuntimeError("Set STUDIOFLOW_PROD_READONLY_DB_URL to the linked project's session/direct Postgres URL for an existing read-only role")
    if parsed.hostname != f"db.{ref}.supabase.co" and not parsed.username.endswith("." + ref):
        raise RuntimeError("Read-only database URL does not match the linked Supabase project")
    if parsed.hostname in ("localhost", "127.0.0.1"):
        raise RuntimeError("Production read-only database URL must be remote")
    values = {
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port),
        "PGUSER": urllib.parse.unquote(parsed.username),
        "PGDATABASE": parsed.path.lstrip("/"),
        "PGSSLMODE": "require",
        "PGOPTIONS": "-c default_transaction_read_only=on",
    }
    password = urllib.parse.unquote(parsed.password)
    if any("\n" in value or "\r" in value for value in (*values.values(), password)):
        raise RuntimeError("Invalid database URL")
    return values, password


def remote_pg(values, password, args, output=None):
    docker = ["docker", "exec", "-i"]
    for key, value in values.items():
        docker += ["-e", f"{key}={value}"]
    docker += ["supabase_db_design-manager", "sh", "-c",
               'IFS= read -r PGPASSWORD; export PGPASSWORD; exec "$@"', "sh", *args]
    result = subprocess.run(docker, cwd=ROOT, input=password + "\n", text=True,
                            stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f"Read-only production query failed: {result.stderr.strip()[-1200:]}")
    return result.stdout


def remote_dump(raw):
    values, password = read_only_source()
    permission_sql = """SELECT current_setting('transaction_read_only'),
      NOT (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
        OR has_database_privilege(current_user,current_database(),'CREATE')
        OR has_schema_privilege(current_user,'public','CREATE')
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relkind IN ('r','p')
                     AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')))
      FROM pg_roles r WHERE r.rolname=current_user"""
    result = remote_pg(values, password, ["psql", "-XAt", "-F", "|", "-c", permission_sql]).strip()
    if result != "on|t":
        raise RuntimeError("Remote database role is not read-only; refusing to dump")
    args = ["pg_dump", "--data-only", "--quote-all-identifiers", "--no-owner", "--no-privileges", "--schema=public"]
    args += ["--exclude-table=public." + table for table in EXCLUDED]
    remote_pg(values, password, args, raw)
    raw.seek(0)


def local_status():
    try:
        output = command(["pnpm", "exec", "supabase", "status", "--output", "json"])
        status = json.loads(output[output.index("{"):])
        db_url, api_url, anon_key = status["DB_URL"], status["API_URL"], status["ANON_KEY"]
        if not re.match(r"^postgres(?:ql)?://[^@]+@(?:127\.0\.0\.1|localhost):\d+/", db_url):
            raise ValueError("Supabase DB URL is not local")
        if urllib.parse.urlparse(api_url).hostname not in ("127.0.0.1", "localhost"):
            raise ValueError("Supabase API URL is not local")
        command(["psql", db_url, "-XAt", "-c", "SELECT 1"])
        return db_url, api_url, anon_key
    except (KeyError, ValueError, RuntimeError) as error:
        raise RuntimeError(f"Local Supabase is unavailable: {error}") from error


def columns(db_url):
    sql = "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position"
    rows = command(["psql", db_url, "-XAt", "-F", "\t", "-c", sql])
    return {(table, column): kind for table, column, kind in (line.split("\t") for line in rows.splitlines())}


def unescape(value):
    if value == r"\N":
        return None
    return re.sub(r"\\([0-7]{3}|.)", lambda m: chr(int(m[1], 8)) if len(m[1]) == 3 and m[1][0] in "01234567" else {
        "n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f", "v": "\v", "\\": "\\",
    }.get(m[1], m[1]), value)


def escape(value):
    if value is None:
        return r"\N"
    return str(value).replace("\\", r"\\").replace("\t", r"\t").replace("\n", r"\n").replace("\r", r"\r")


def copy_blocks(path):
    table = None
    fields = []
    with (path.open(encoding="utf-8") if isinstance(path, Path) else nullcontext(path)) as source:
        source.seek(0)
        for line in source:
            if table is None:
                match = COPY.match(line.rstrip("\n"))
                if match:
                    table = match[1]
                    fields = [name.strip('"') for name in match[2].split(", ")]
                yield table, fields, line, False
            elif line == "\\.\n":
                yield table, fields, line, False
                table = None
            else:
                yield table, fields, line, True
    if table is not None:
        raise RuntimeError("Incomplete COPY block in production dump")


def identities(path):
    profile_ids = set()
    active_profiles = set()
    admins = []
    for table, fields, line, is_row in copy_blocks(path):
        if not is_row or table not in ("profiles", "studio_members"):
            continue
        values = line.rstrip("\n").split("\t")
        if len(values) != len(fields):
            raise RuntimeError(f"Malformed {table} COPY row")
        row = dict(zip(fields, (unescape(value) for value in values)))
        if table == "profiles":
            if not row["id"] or not UUID.fullmatch(row["id"]):
                raise RuntimeError("Invalid production profile identifier")
            profile_ids.add(row["id"])
            if row["is_active"] == "t":
                active_profiles.add(row["id"])
        elif row["system_role"] == "admin" and row["is_active"] == "t":
            admins.append((row["studio_id"], row["user_id"]))
    selected = next((user for _, user in sorted(admins) if user in active_profiles), None)
    if not selected or not profile_ids:
        raise RuntimeError("Production dump has no active studio administrator to use for local login")
    return selected


def redact_secret_values(value):
    return SECRET_VALUE.sub("[redacted credential]", value)


def scrub_json(value):
    if isinstance(value, dict):
        return {key: None if SECRET_FIELD.search(key) else scrub_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub_json(item) for item in value]
    return redact_secret_values(value) if isinstance(value, str) else value


def sanitize(raw, target, schema):
    seen = set()
    target.touch(mode=0o600)
    os.chmod(target, 0o600)
    with target.open("w", encoding="utf-8") as output:
        output.write("SET session_replication_role = replica;\n")
        for table, fields, line, is_row in copy_blocks(raw):
            if table in EXCLUDED:
                raise RuntimeError(f"Excluded table {table} was included in the dump")
            if table and not is_row:
                seen.add(table)
            if not is_row:
                if line.startswith(("\\restrict ", "\\unrestrict ")):
                    output.write("-- " + line)
                elif line.startswith("\\") and line != "\\.\n":
                    raise RuntimeError("Unexpected pg_dump command outside COPY data")
                else:
                    output.write(line)
                continue
            values = line.rstrip("\n").split("\t")
            if len(values) != len(fields):
                raise RuntimeError(f"Malformed COPY row in {table}")
            cleaned = []
            for field, raw_value in zip(fields, values):
                kind = schema.get((table, field))
                if kind is None:
                    raise RuntimeError(f"Unknown remote column {table}.{field}; review sanitization before importing")
                if raw_value == r"\N":
                    cleaned.append(raw_value)
                elif table == "profiles" and field == "avatar_url":
                    cleaned.append(r"\N")
                elif SECRET_FIELD.search(field):
                    cleaned.append(r"\N")
                elif kind in ("json", "jsonb"):
                    original = json.loads(unescape(raw_value))
                    safe = scrub_json(original)
                    cleaned.append(raw_value if safe == original else escape(json.dumps(safe, ensure_ascii=False, separators=(",", ":"))))
                elif kind in ("text", "character varying", "character"):
                    original = unescape(raw_value)
                    safe = redact_secret_values(original)
                    cleaned.append(raw_value if safe == original else escape(safe))
                else:
                    cleaned.append(raw_value)
            output.write("\t".join(cleaned) + "\n")
    if "profiles" not in seen or "studio_members" not in seen:
        raise RuntimeError("Production dump is missing profiles or studio_members")
    data = target.read_text(encoding="utf-8")
    if SECRET_VALUE.search(data):
        raise RuntimeError("Sanitized snapshot still contains recognizable credential material")
    if any(name in data for name in EXCLUDED):
        raise RuntimeError("Sanitized snapshot mentions an excluded integration table")
    return hashlib.sha256(data.encode()).hexdigest()


def auth_sql(snapshot, dev_id, password):
    rows = []
    for table, fields, line, is_row in copy_blocks(snapshot):
        if not is_row or table != "profiles":
            continue
        values = dict(zip(fields, (unescape(value) for value in line.rstrip("\n").split("\t"))))
        user_id = values["id"]
        is_dev = user_id == dev_id
        email = f"'{DEV_EMAIL}'" if is_dev else "NULL"
        hashed = f"extensions.crypt('{password}', extensions.gen_salt('bf'))" if is_dev else "NULL"
        confirmed = "now()" if is_dev else "NULL"
        app_meta = "'{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb" if is_dev else "'{}'::jsonb"
        rows.append(
            f"('00000000-0000-0000-0000-000000000000','{user_id}',"
            f"'authenticated','authenticated',{email},{hashed},{confirmed},"
            f"'','','','','','','','',{app_meta},'{{}}'::jsonb,now(),now())"
        )
    return (
        "INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,"
        "confirmation_token,recovery_token,email_change_token_new,email_change_token_current,"
        "email_change,phone_change,phone_change_token,reauthentication_token,"
        "raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES\n"
        + ",\n".join(rows) + ";\n"
        + "INSERT INTO auth.identities (provider_id,user_id,identity_data,provider,created_at,updated_at) "
        + f"SELECT id::text,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',false,'phone_verified',false),'email',now(),now() FROM auth.users WHERE id='{dev_id}';\n"
    )


VERIFY_SQL = """
DO $$
DECLARE fk record; required text; matches text; broken boolean;
BEGIN
  FOR fk IN SELECT oid, conname, conrelid, confrelid FROM pg_constraint
            WHERE contype='f' AND connamespace IN ('public'::regnamespace, 'auth'::regnamespace) LOOP
    SELECT string_agg(format('c.%I IS NOT NULL', child.attname), ' AND ' ORDER BY key.ord),
           string_agg(format('p.%I = c.%I', parent.attname, child.attname), ' AND ' ORDER BY key.ord)
      INTO required, matches
    FROM pg_constraint constraint_row
    CROSS JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey) WITH ORDINALITY key(child_no,parent_no,ord)
    JOIN pg_attribute child ON child.attrelid=fk.conrelid AND child.attnum=key.child_no
    JOIN pg_attribute parent ON parent.attrelid=fk.confrelid AND parent.attnum=key.parent_no
    WHERE constraint_row.oid=fk.oid;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s))',
                   fk.conrelid::regclass, required, fk.confrelid::regclass, matches) INTO broken;
    IF broken THEN RAISE EXCEPTION 'Snapshot violates foreign key %', fk.conname; END IF;
  END LOOP;
END $$;
"""


def restore(db_url, api_url, anon_key, snapshot, dev_id, password):
    auth_file = CACHE / ".auth-restore.sql"
    verify_file = CACHE / ".verify-restore.sql"
    try:
        auth_file.write_text(auth_sql(snapshot, dev_id, password), encoding="utf-8")
        verify_file.write_text(VERIFY_SQL, encoding="utf-8")
        os.chmod(auth_file, 0o600)
        command(["pnpm", "exec", "supabase", "db", "reset", "--local", "--no-seed", "--yes"])
        command(["psql", db_url, "-X", "-v", "ON_ERROR_STOP=1", "-1", "-f", str(auth_file), "-f", str(snapshot), "-f", str(verify_file)])
        payload = json.dumps({"email": DEV_EMAIL, "password": password}).encode()
        request = urllib.request.Request(api_url + "/auth/v1/token?grant_type=password", data=payload,
                                         headers={"apikey": anon_key, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=15) as response:
            user = json.load(response)["user"]
        if user["id"] != dev_id:
            raise RuntimeError("Local Auth signed in the wrong profile")
        check = command(["psql", db_url, "-XAt", "-c", f"SELECT count(*) FROM public.studio_members WHERE user_id='{dev_id}' AND system_role='admin' AND is_active"])
        if check.strip() == "0":
            raise RuntimeError("Local dev account has no active admin membership")
    finally:
        auth_file.unlink(missing_ok=True)
        verify_file.unlink(missing_ok=True)


def refresh():
    db_url, api_url, anon_key = local_status()
    schema = columns(db_url)
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(CACHE, 0o700)
    name = f"snapshot-{secrets.token_hex(8)}.sql"
    sanitized = CACHE / name
    try:
        # An unnamed file disappears even if the process is interrupted.
        with tempfile.TemporaryFile(mode="w+t", encoding="utf-8", dir=CACHE) as raw:
            remote_dump(raw)
            dev_id = identities(raw)
            digest = sanitize(raw, sanitized, schema)
        os.chmod(sanitized, 0o600)
        password = secrets.token_urlsafe(18)
        restore(db_url, api_url, anon_key, sanitized, dev_id, password)
        previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else None
        staged = CACHE / ".current.json.tmp"
        staged.write_text(json.dumps({"file": name, "sha256": digest, "dev_id": dev_id, "password": password}) + "\n")
        os.chmod(staged, 0o600)
        staged.replace(MANIFEST)
        if previous:
            (CACHE / previous["file"]).unlink(missing_ok=True)
        print(f"Sanitized snapshot saved. Local login: {DEV_EMAIL} / {password}")
    except Exception:
        sanitized.unlink(missing_ok=True)
        raise


def reset():
    db_url, api_url, anon_key = local_status()
    if not MANIFEST.exists():
        raise RuntimeError("No cached sanitized snapshot; run pnpm dev:refresh-prod first")
    saved = json.loads(MANIFEST.read_text())
    snapshot = CACHE / saved["file"]
    if not snapshot.is_file() or hashlib.sha256(snapshot.read_bytes()).hexdigest() != saved["sha256"]:
        raise RuntimeError("Cached snapshot is missing or changed; refresh it before resetting")
    restore(db_url, api_url, anon_key, snapshot, saved["dev_id"], saved["password"])
    print(f"Restored cached snapshot. Local login: {DEV_EMAIL} / {saved['password']}")


def self_test():
    assert unescape(escape("a\tb\nc\\d")) == "a\tb\nc\\d"
    assert redact_secret_values("Bearer " + "a" * 24) == "[redacted credential]"
    assert scrub_json({"display": "Visible", "nested": {"client_secret": "secret"}}) == {"display": "Visible", "nested": {"client_secret": None}}
    admin_id = "11111111-1111-4111-8111-111111111111"
    member_id = "22222222-2222-4222-8222-222222222222"
    studio_id = "33333333-3333-4333-8333-333333333333"
    rows = [
        ("profiles", {"id": admin_id, "full_name": "Olena Коваль", "email": "olena@example.com", "job_title": "Lead Architect", "avatar_url": "https://production.example/storage/avatar.jpg", "is_active": "t"}),
        ("profiles", {"id": member_id, "full_name": "Ivan Petrenko", "email": "ivan@example.com", "job_title": "Designer", "avatar_url": "user/avatar.jpg", "is_active": "t"}),
        ("studio_members", {"studio_id": studio_id, "user_id": admin_id, "system_role": "admin", "is_active": "t"}),
        ("projects", {"id": studio_id, "name": "Kyiv family apartment", "description": "Warm oak and stone", "client_name": "Family K"}),
        ("tasks", {"id": studio_id, "title": "Kitchen lighting plan", "description": "Pendant over island\nTrack by window", "status": "in_progress"}),
        ("office_assignments", {"id": studio_id, "title": "Prepare samples", "description": "Bring oak and stone"}),
        ("equipment", {"id": studio_id, "display_name": "Rendering workstation", "serial_number": "ABC-123"}),
        ("finance_accounts", {"id": studio_id, "name": "Operating account", "opening_balance": "12500.00"}),
        ("crm_candidates", {"id": studio_id, "full_name": "Nadia Applicant", "email": "nadia@example.com", "phone": "+380501234567"}),
        ("calendar_events", {"id": studio_id, "meeting_url": "https://meet.example.com/design-review"}),
        ("notifications", {"id": studio_id, "metadata": json.dumps({"leadName": "Family K", "contactEmail": "client@example.com", "access_token": "ya29." + "a" * 24})}),
    ]
    schema = {(table, field): "jsonb" if field == "metadata" else "text" for table, row in rows for field in row}
    with tempfile.TemporaryDirectory() as directory:
        raw, safe = Path(directory) / "raw.sql", Path(directory) / "safe.sql"
        with raw.open("w") as output:
            for table, row in rows:
                output.write(f'COPY "public"."{table}" (' + ", ".join(f'"{field}"' for field in row) + ") FROM stdin;\n")
                output.write("\t".join(escape(value) for value in row.values()) + "\n\\.\n")
        assert identities(raw) == admin_id
        sanitize(raw, safe, schema)
        preserved = {}
        for table, fields, line, is_row in copy_blocks(safe):
            if is_row:
                preserved.setdefault(table, []).append(dict(zip(fields, (unescape(value) for value in line.rstrip("\n").split("\t")))))
        for table, row in rows:
            if table in ("notifications", "profiles"):
                continue
            assert row in preserved[table], f"Ordinary {table} data changed"
        assert all(row["avatar_url"] is None for row in preserved["profiles"])
        assert [row["id"] for row in preserved["profiles"]] == [admin_id, member_id]
        metadata = json.loads(preserved["notifications"][0]["metadata"])
        assert metadata == {"leadName": "Family K", "contactEmail": "client@example.com", "access_token": None}
        auth = auth_sql(safe, admin_id, "local-test-password")
        assert "olena@example.com" not in auth and "ivan@example.com" not in auth
        assert auth.count("extensions.crypt(") == 1 and auth.count("INSERT INTO auth.identities") == 1
        assert f"'{member_id}','authenticated','authenticated',NULL,NULL,NULL" in auth
        with raw.open("a") as output:
            output.write('COPY "public"."google_calendar_server_credentials" ("encrypted_refresh_token") FROM stdin;\nsecret\n\\.\n')
        try:
            sanitize(raw, safe, {**schema, ("google_calendar_server_credentials", "encrypted_refresh_token"): "text"})
        except RuntimeError as error:
            assert "Excluded table" in str(error)
        else:
            raise AssertionError("Integration token table was imported")
    print("Sanitizer checks passed")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["refresh"]:
            refresh()
        elif sys.argv[1:] == ["reset"]:
            reset()
        elif sys.argv[1:] == ["self-test"]:
            self_test()
        else:
            raise RuntimeError("Usage: dev-snapshot.py refresh|reset|self-test")
    except (RuntimeError, ValueError, OSError, urllib.error.URLError) as error:
        print(f"Snapshot workflow failed: {error}", file=sys.stderr)
        sys.exit(1)
