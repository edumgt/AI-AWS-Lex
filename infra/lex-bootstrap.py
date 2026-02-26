#!/usr/bin/env python3
"""Amazon Lex V2 bootstrap script (Python CLI wrapper).

`infra/lex-bootstrap.sh`의 동작을 Python으로 옮긴 버전입니다.
AWS CLI가 설치되어 있고 인증이 구성되어 있어야 합니다.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CFG = ROOT_DIR / "infra" / "config.env"
FALLBACK_CFG = ROOT_DIR / "infra" / "config.example.env"


class ScriptError(RuntimeError):
    pass


def load_env_file(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        data[key] = value
    return data


def get_config() -> dict[str, str]:
    cfg_path = DEFAULT_CFG if DEFAULT_CFG.exists() else FALLBACK_CFG
    cfg = load_env_file(cfg_path)
    merged = dict(cfg)
    merged.update({k: v for k, v in os.environ.items() if k in cfg or k.isupper()})
    return merged


def require_bin(name: str) -> None:
    if subprocess.run(["bash", "-lc", f"command -v {shlex.quote(name)}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        raise ScriptError(f"{name} CLI가 필요합니다.")


def run_aws(cfg: dict[str, str], *args: str, output_json: bool = True, allow_fail: bool = False) -> Any:
    aws_bin = cfg.get("AWS_BIN", "aws")
    cmd = [aws_bin, "--region", cfg["AWS_REGION"], *args]
    if output_json and "--output" not in args:
        cmd.extend(["--output", "json"])
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        if allow_fail:
            return None
        raise ScriptError(f"명령 실패: {' '.join(cmd)}\n{proc.stderr.strip()}")
    if output_json:
        out = proc.stdout.strip()
        return json.loads(out) if out else {}
    return proc.stdout.strip()


def get_text(cfg: dict[str, str], *args: str, allow_fail: bool = False) -> str:
    aws_bin = cfg.get("AWS_BIN", "aws")
    cmd = [aws_bin, "--region", cfg["AWS_REGION"], *args, "--output", "text"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        if allow_fail:
            return ""
        raise ScriptError(proc.stderr.strip())
    return proc.stdout.strip()


def wait_until(label: str, fn, ok: set[str], fail: set[str], timeout: int, interval: int) -> str:
    waited = 0
    print(f" - {label} 대기", file=sys.stderr)
    while True:
        status = fn() or "Unknown"
        print(f"   * status={status}", file=sys.stderr)
        if status in ok:
            return status
        if status in fail:
            raise ScriptError(f"{label} 실패(status={status})")
        time.sleep(interval)
        waited += interval
        if waited >= timeout:
            raise ScriptError(f"Timed out: {label} 대기 실패")


def split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def make_slot_type_values(items: list[str]) -> list[dict[str, Any]]:
    return [{"sampleValue": {"value": item}} for item in items]


def assert_id(label: str, value: str) -> None:
    if not re.fullmatch(r"[0-9A-Za-z]{1,10}", value or ""):
        raise ScriptError(f"ERROR: {label} 값이 비정상입니다: '{value}'")


def list_builtins(cfg: dict[str, str], cache_file: Path) -> set[str]:
    force_refresh = cfg.get("FORCE_REFRESH_BUILTIN_CACHE", "false").lower() == "true"
    if force_refresh and cache_file.exists():
        cache_file.unlink()

    if cache_file.exists() and cache_file.stat().st_size > 0:
        print(f" - Built-in cache 사용: {cache_file}", file=sys.stderr)
        return set(cache_file.read_text(encoding="utf-8").splitlines())

    next_token = ""
    values: list[str] = []
    while True:
        args = ["lexv2-models", "list-built-in-slot-types", "--locale-id", cfg["LOCALE_ID"], "--max-results", "20"]
        if next_token:
            args.extend(["--next-token", next_token])
        payload = run_aws(cfg, *args)
        for item in payload.get("builtInSlotTypeSummaries", []):
            sig = item.get("slotTypeSignature")
            if sig:
                values.append(sig)
        next_token = payload.get("nextToken", "")
        if not next_token:
            break

    cache_file.write_text("\n".join(values) + ("\n" if values else ""), encoding="utf-8")
    print(f" - Built-in cache 생성 완료: {cache_file} (lines={len(values)})", file=sys.stderr)
    return set(values)


def pick_builtin(builtins: set[str], *candidates: str) -> str:
    for candidate in candidates:
        if candidate in builtins:
            return candidate
    return "AMAZON.AlphaNumeric" if "AMAZON.AlphaNumeric" in builtins else ""


def find_summary_id(items: list[dict[str, Any]], name_key: str, id_key: str, wanted_name: str) -> str:
    for item in items:
        if item.get(name_key) == wanted_name:
            return item.get(id_key, "")
    return ""


def main() -> int:
    cfg = get_config()
    require_bin(cfg.get("AWS_BIN", "aws"))

    tmp_dir = Path(cfg.get("TMP_DIR", "/tmp"))
    cache_file = tmp_dir / f"lexv2_builtin_slot_types_{cfg['LOCALE_ID']}.txt"

    reuse_existing = cfg.get("REUSE_EXISTING_BOT", "true").lower() == "true"
    create_new_ver = cfg.get("CREATE_NEW_VERSION", "true").lower() == "true"

    # [1/9] IAM Role
    print(f"[1/9] IAM Role 준비: {cfg['LEX_ROLE_NAME']}")
    account_id = get_text(cfg, "sts", "get-caller-identity", "--query", "Account")
    lex_role_arn = f"arn:aws:iam::{account_id}:role/{cfg['LEX_ROLE_NAME']}"

    role_exists = subprocess.run(
        [cfg.get("AWS_BIN", "aws"), "--region", cfg["AWS_REGION"], "iam", "get-role", "--role-name", cfg["LEX_ROLE_NAME"]],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ).returncode == 0

    if not role_exists:
        trust_doc = {
            "Version": "2012-10-17",
            "Statement": [{"Effect": "Allow", "Principal": {"Service": "lexv2.amazonaws.com"}, "Action": "sts:AssumeRole"}],
        }
        trust_file = tmp_dir / "lexv2-trust.json"
        trust_file.write_text(json.dumps(trust_doc), encoding="utf-8")
        run_aws(
            cfg,
            "iam",
            "create-role",
            "--role-name",
            cfg["LEX_ROLE_NAME"],
            "--assume-role-policy-document",
            f"file://{trust_file}",
            output_json=False,
        )

        invoke_resource = cfg.get("LAMBDA_ARN") or "*"
        policy_doc = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "InvokeLambdaForFulfillment",
                    "Effect": "Allow",
                    "Action": ["lambda:InvokeFunction"],
                    "Resource": [invoke_resource],
                },
                {
                    "Sid": "CloudWatchLogsBasic",
                    "Effect": "Allow",
                    "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                    "Resource": "*",
                },
            ],
        }
        policy_file = tmp_dir / "lexv2-inline-policy.json"
        policy_file.write_text(json.dumps(policy_doc), encoding="utf-8")
        run_aws(
            cfg,
            "iam",
            "put-role-policy",
            "--role-name",
            cfg["LEX_ROLE_NAME"],
            "--policy-name",
            "LexLabInlinePolicy",
            "--policy-document",
            f"file://{policy_file}",
            output_json=False,
        )
        print(f" - 생성 완료: {lex_role_arn}")
    else:
        print(f" - 이미 존재: {lex_role_arn}")

    # [2/9] Bot
    print(f"[2/9] Bot 생성 또는 재사용: {cfg['BOT_NAME']}")
    bot_id = cfg.get("BOT_ID", "")
    if not bot_id and reuse_existing:
        bots = run_aws(cfg, "lexv2-models", "list-bots", "--max-results", "50")
        same = [b for b in bots.get("botSummaries", []) if b.get("botName") == cfg["BOT_NAME"]]
        same.sort(key=lambda x: x.get("lastUpdatedDateTime", ""))
        if same:
            bot_id = same[-1].get("botId", "")
            print(f" - 기존 Bot 재사용: botId={bot_id}")

    if not bot_id:
        bot = run_aws(
            cfg,
            "lexv2-models",
            "create-bot",
            "--bot-name",
            cfg["BOT_NAME"],
            "--description",
            cfg["BOT_DESCRIPTION"],
            "--role-arn",
            lex_role_arn,
            "--data-privacy",
            "childDirected=false",
            "--idle-session-ttl-in-seconds",
            cfg["IDLE_SESSION_TTL"],
        )
        bot_id = bot["botId"]
    print(f" - botId={bot_id}")

    wait_until(
        f"Bot Available: botId={bot_id}",
        lambda: get_text(cfg, "lexv2-models", "describe-bot", "--bot-id", bot_id, "--query", "botStatus", allow_fail=True),
        {"Available"},
        {"Failed"},
        300,
        5,
    )

    # [3/9] Locale
    print(f"[3/9] Locale 생성/확인: {cfg['LOCALE_ID']}")
    locale_exists = run_aws(
        cfg,
        "lexv2-models",
        "describe-bot-locale",
        "--bot-id",
        bot_id,
        "--bot-version",
        "DRAFT",
        "--locale-id",
        cfg["LOCALE_ID"],
        allow_fail=True,
    ) is not None
    if locale_exists:
        print(f" - 이미 존재: {cfg['LOCALE_ID']}")
    else:
        run_aws(
            cfg,
            "lexv2-models",
            "create-bot-locale",
            "--bot-id",
            bot_id,
            "--bot-version",
            "DRAFT",
            "--locale-id",
            cfg["LOCALE_ID"],
            "--nlu-intent-confidence-threshold",
            cfg["NLU_CONFIDENCE"],
            output_json=False,
        )
        print(" - 생성 요청 완료")

    wait_until(
        f"Locale Creating 탈출: {cfg['LOCALE_ID']}",
        lambda: get_text(
            cfg,
            "lexv2-models",
            "describe-bot-locale",
            "--bot-id",
            bot_id,
            "--bot-version",
            "DRAFT",
            "--locale-id",
            cfg["LOCALE_ID"],
            "--query",
            "botLocaleStatus",
            allow_fail=True,
        ),
        {"Built", "ReadyExpressTesting", "NotBuilt", "Failed"},
        {"Failed"},
        300,
        5,
    )

    # [4/9] Slot types
    print("[4/9] SlotType 생성/갱신")
    slot_types = run_aws(cfg, "lexv2-models", "list-slot-types", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--max-results", "100")
    branch_values = make_slot_type_values(split_csv(cfg["BRANCH_VALUES"]))
    course_values = make_slot_type_values(split_csv(cfg["COURSE_VALUES"]))

    def upsert_slot_type(name: str, desc: str, values: list[dict[str, Any]]) -> str:
        found_id = find_summary_id(slot_types.get("slotTypeSummaries", []), "slotTypeName", "slotTypeId", name)
        args = [
            "lexv2-models",
            "update-slot-type" if found_id else "create-slot-type",
            "--bot-id",
            bot_id,
            "--bot-version",
            "DRAFT",
            "--locale-id",
            cfg["LOCALE_ID"],
            "--slot-type-name",
            name,
            "--description",
            desc,
            "--slot-type-values",
            json.dumps(values, ensure_ascii=False),
            "--value-selection-setting",
            "resolutionStrategy=TopResolution",
        ]
        if found_id:
            args.extend(["--slot-type-id", found_id])
            run_aws(cfg, *args, output_json=False)
            print(f" - {name} 갱신: {found_id}")
            return found_id
        created = run_aws(cfg, *args)
        created_id = created["slotTypeId"]
        print(f" - {name} 생성: {created_id}")
        return created_id

    branch_type_id = upsert_slot_type("BranchType", "학원 지점", branch_values)
    course_type_id = upsert_slot_type("CourseType", "수강 과정", course_values)

    # [5/9] Intent/slots
    print("[5/9] Intent 생성/갱신 + Slots 구성")
    intents = run_aws(cfg, "lexv2-models", "list-intents", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--max-results", "100")
    make_intent_id = find_summary_id(intents.get("intentSummaries", []), "intentName", "intentId", "MakeReservation")

    base_utt = [{"utterance": "상담 예약할래요"}, {"utterance": "예약하고 싶어요"}, {"utterance": "수강 상담 예약"}]
    if make_intent_id:
        run_aws(cfg, "lexv2-models", "update-intent", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--intent-id", make_intent_id, "--intent-name", "MakeReservation", "--description", "상담/수강 예약 생성", "--sample-utterances", json.dumps(base_utt, ensure_ascii=False), output_json=False)
    else:
        make_intent_id = run_aws(cfg, "lexv2-models", "create-intent", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--intent-name", "MakeReservation", "--description", "상담/수강 예약 생성", "--sample-utterances", json.dumps(base_utt, ensure_ascii=False))["intentId"]
    assert_id("MAKE_INTENT_ID", make_intent_id)

    builtins = list_builtins(cfg, cache_file)
    name_type = pick_builtin(builtins, "AMAZON.Person", "AMAZON.FirstName", "AMAZON.LastName")
    date_type = pick_builtin(builtins, "AMAZON.Date", "AMAZON.DateTime")
    time_type = pick_builtin(builtins, "AMAZON.Time", "AMAZON.DateTime")
    phone_type = pick_builtin(builtins, "AMAZON.PhoneNumber")
    if not all([name_type, date_type, time_type, phone_type]):
        raise ScriptError("ko_KR에서 사용할 수 있는 built-in slot type을 찾지 못했습니다.")

    slots = run_aws(cfg, "lexv2-models", "list-slots", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--intent-id", make_intent_id, "--max-results", "100")

    def upsert_slot(name: str, slot_type: str, prompt: str, priority: int) -> tuple[str, dict[str, Any]]:
        slot_id = find_summary_id(slots.get("slotSummaries", []), "slotName", "slotId", name)
        elicitation = {
            "slotConstraint": "Required",
            "promptSpecification": {
                "maxRetries": 2,
                "messageGroups": [{"message": {"plainTextMessage": {"value": prompt}}}],
            },
        }
        common = [
            "lexv2-models",
            "update-slot" if slot_id else "create-slot",
            "--bot-id",
            bot_id,
            "--bot-version",
            "DRAFT",
            "--locale-id",
            cfg["LOCALE_ID"],
            "--intent-id",
            make_intent_id,
            "--slot-name",
            name,
            "--slot-type-id",
            slot_type,
            "--value-elicitation-setting",
            json.dumps(elicitation, ensure_ascii=False),
        ]
        if slot_id:
            common.extend(["--slot-id", slot_id])
            run_aws(cfg, *common, output_json=False)
            sid = slot_id
        else:
            sid = run_aws(cfg, *common)["slotId"]
        assert_id("slotId", sid)
        return sid, {"priority": priority, "slotId": sid}

    priority_entries = []
    for idx, spec in enumerate(
        [
            ("Branch", branch_type_id, "어느 지점으로 예약할까요? (예: 강남점)"),
            ("CourseName", course_type_id, "어떤 과정을 원하세요? (예: 토익)"),
            ("Date", date_type, "희망 날짜를 알려주세요. (예: 2026-02-10 또는 2월 10일)"),
            ("Time", time_type, "희망 시간을 알려주세요. (예: 19:30)"),
            ("StudentName", name_type, "예약자 이름을 알려주세요."),
            ("PhoneNumber", phone_type, "연락처를 알려주세요. (예: 010-1234-5678)"),
        ],
        1,
    ):
        _, entry = upsert_slot(spec[0], spec[1], spec[2], idx)
        priority_entries.append(entry)

    full_utt = [
        {"utterance": "강남점 토익 예약하고 싶어요"},
        {"utterance": "{Branch} {CourseName} 상담 예약할래요"},
        {"utterance": "{Date} {Time}에 {Branch} {CourseName} 예약"},
    ]
    run_aws(cfg, "lexv2-models", "update-intent", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--intent-id", make_intent_id, "--intent-name", "MakeReservation", "--description", "상담/수강 예약 생성", "--sample-utterances", json.dumps(full_utt, ensure_ascii=False), "--slot-priorities", json.dumps(priority_entries), "--fulfillment-code-hook", "enabled=true", output_json=False)
    print("✅ [5/9] MakeReservation intent/slots OK")

    # [6/9] Build
    print("[6/9] Locale Build 시작")
    run_aws(cfg, "lexv2-models", "build-bot-locale", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], output_json=False)
    wait_until(
        f"Build 완료: {cfg['LOCALE_ID']}",
        lambda: get_text(cfg, "lexv2-models", "describe-bot-locale", "--bot-id", bot_id, "--bot-version", "DRAFT", "--locale-id", cfg["LOCALE_ID"], "--query", "botLocaleStatus"),
        {"Built"},
        {"Failed"},
        900,
        10,
    )

    # [7/9] Version
    print("[7/9] Bot Version")
    if create_new_ver:
        version = run_aws(cfg, "lexv2-models", "create-bot-version", "--bot-id", bot_id, "--bot-version-locale-specification", json.dumps({cfg["LOCALE_ID"]: {"sourceBotVersion": "DRAFT"}}))["botVersion"]
        print(f" - 새 버전 생성: {version}")
    else:
        versions = run_aws(cfg, "lexv2-models", "list-bot-versions", "--bot-id", bot_id, "--max-results", "50")
        items = [v for v in versions.get("botVersionSummaries", []) if v.get("botVersion") != "DRAFT"]
        items.sort(key=lambda x: x.get("creationDateTime", ""))
        if not items:
            raise ScriptError("재사용할 버전이 없어 새 버전을 생성하세요.")
        version = items[-1]["botVersion"]
        print(f" - 기존 최신 버전 재사용: {version}")

    wait_until(
        f"Bot Available: botId={bot_id}",
        lambda: get_text(cfg, "lexv2-models", "describe-bot", "--bot-id", bot_id, "--query", "botStatus", allow_fail=True),
        {"Available"},
        {"Failed"},
        300,
        5,
    )

    # [8/9] Alias
    print(f"[8/9] Alias 생성/갱신: {cfg['BOT_ALIAS_NAME']}")
    aliases = run_aws(cfg, "lexv2-models", "list-bot-aliases", "--bot-id", bot_id, "--max-results", "50")
    alias_id = find_summary_id(aliases.get("botAliasSummaries", []), "botAliasName", "botAliasId", cfg["BOT_ALIAS_NAME"])
    if cfg.get("LAMBDA_ARN"):
        locale_settings = {cfg["LOCALE_ID"]: {"enabled": True, "codeHookSpecification": {"lambdaCodeHook": {"lambdaARN": cfg["LAMBDA_ARN"], "codeHookInterfaceVersion": "1.0"}}}}
    else:
        locale_settings = {cfg["LOCALE_ID"]: {"enabled": True}}

    wait_until(
        f"Bot Available: botId={bot_id}",
        lambda: get_text(cfg, "lexv2-models", "describe-bot", "--bot-id", bot_id, "--query", "botStatus", allow_fail=True),
        {"Available"},
        {"Failed"},
        300,
        5,
    )

    if alias_id:
        run_aws(cfg, "lexv2-models", "update-bot-alias", "--bot-id", bot_id, "--bot-alias-id", alias_id, "--bot-alias-name", cfg["BOT_ALIAS_NAME"], "--bot-version", version, "--bot-alias-locale-settings", json.dumps(locale_settings), output_json=False)
        print(f" - Alias 갱신: {alias_id}")
    else:
        created_alias = run_aws(cfg, "lexv2-models", "create-bot-alias", "--bot-id", bot_id, "--bot-alias-name", cfg["BOT_ALIAS_NAME"], "--bot-version", version, "--bot-alias-locale-settings", json.dumps(locale_settings))
        alias_id = created_alias["botAliasId"]
        print(f" - Alias 생성: {alias_id}")

    wait_until(
        f"Alias Available: botAliasId={alias_id}",
        lambda: get_text(cfg, "lexv2-models", "describe-bot-alias", "--bot-id", bot_id, "--bot-alias-id", alias_id, "--query", "botAliasStatus", allow_fail=True),
        {"Available"},
        {"Failed"},
        300,
        5,
    )

    # [9/9] Summary
    print("[9/9] 결과 요약")
    print("✅ 완료")
    print(f"- BOT_ID={bot_id}")
    print(f"- BOT_VERSION={version}")
    print(f"- BOT_ALIAS_ID={alias_id}")
    print(f"- LOCALE_ID={cfg['LOCALE_ID']}")
    print("\nNode 서버에서 사용할 환경변수:")
    print(f"export AWS_REGION={cfg['AWS_REGION']}")
    print(f"export LEX_BOT_ID={bot_id}")
    print(f"export LEX_BOT_ALIAS_ID={alias_id}")
    print(f"export LEX_LOCALE_ID={cfg['LOCALE_ID']}")
    print("\n(참고) ko_KR에서 Date/Time 전용 built-in이 없으면 AMAZON.AlphaNumeric로 수집됩니다.")
    print("→ CodeHook(Lambda)에서 정규화/검증 권장.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ScriptError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
