"""
ArduPilot .bin log parser — Fly.io microservice.
Receives a .bin file via POST /parse, returns structured JSON
using pymavlink.
"""

import io
import json
import os
import tempfile

from flask import Flask, Response, jsonify, request

app = Flask(__name__)

PARSER_SECRET = os.environ.get("PARSER_SECRET", "")

# ArduCopter flight mode mapping
COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
    8: "POSITION", 9: "LAND", 10: "OF_LOITER", 11: "DRIFT",
    13: "SPORT", 14: "FLIP", 15: "AUTOTUNE", 16: "POSHOLD",
    17: "BRAKE", 18: "THROW", 19: "AVOID_ADSB", 20: "GUIDED_NOGPS",
    21: "SMART_RTL", 22: "FLOWHOLD", 23: "FOLLOW", 24: "ZIGZAG",
    25: "SYSTEMID", 26: "AUTOROTATE", 27: "AUTO_RTL",
}

# ArduPlane flight mode mapping
PLANE_MODES = {
    0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING",
    4: "ACRO", 5: "FLY_BY_WIRE_A", 6: "FLY_BY_WIRE_B",
    7: "CRUISE", 8: "AUTOTUNE", 10: "AUTO", 11: "RTL",
    12: "LOITER", 14: "AVOID_ADSB", 15: "GUIDED",
    17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER",
    20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO",
    24: "THERMAL",
}

# Message prefixes to skip (boot/system noise)
SKIP_MSG_PREFIXES = [
    "gimbal ", "fmuv", "chibios", "u-blox", "gps 1:", "ekf",
    "frame:", "rcout:", "barometer", "compass", "imu", "ins",
    "terrain:", "rally", "fence", "param ",
]


@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "service": "ardupilot-parser"})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/parse", methods=["POST"])
def parse():
    # ── Auth ──
    if PARSER_SECRET:
        token = request.headers.get("X-Parser-Secret", "")
        if token != PARSER_SECRET:
            return jsonify({"error": "Unauthorized"}), 401

    # ── File ──
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    # pymavlink needs a real file path
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        uploaded.save(tmp)
        tmp_path = tmp.name

    try:
        result = _parse_bin(tmp_path)
        return Response(
            json.dumps(result, ensure_ascii=False),
            mimetype="application/json",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        os.unlink(tmp_path)


def _should_skip_message(text: str) -> bool:
    """Return True if this MSG should be filtered out."""
    lower = text.lower().strip()
    for prefix in SKIP_MSG_PREFIXES:
        if lower.startswith(prefix):
            return True
    return False


def _parse_bin(path: str) -> dict:
    from pymavlink import mavutil

    mlog = mavutil.mavlink_connection(path, dialect="ardupilotmega")

    gps_list = []
    battery_list = []
    attitude_list = []
    modes_list = []
    messages_list = []
    params = {}
    vehicle_type = "ArduPilot"
    firmware_version = None

    while True:
        msg = mlog.recv_match(blocking=False)
        if msg is None:
            break

        msg_type = msg.get_type()

        if msg_type == "GPS":
            try:
                gps_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "lat": msg.Lat,
                    "lng": msg.Lng,
                    "alt": msg.Alt,
                    "spd": msg.Spd,
                    "nSat": getattr(msg, "NSats", getattr(msg, "nSat", 0)),
                })
            except Exception:
                pass

        elif msg_type in ("BAT", "BATT"):
            try:
                battery_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "volt": msg.Volt,
                    "curr": getattr(msg, "Curr", None),
                    "remaining": getattr(msg, "Rem", None),
                    "curr_tot": getattr(msg, "CurrTot", None),
                    "temp": getattr(msg, "Temp", None),
                })
            except Exception:
                pass

        elif msg_type == "ATT":
            try:
                attitude_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "pitch": msg.Pitch,
                    "roll": msg.Roll,
                    "yaw": msg.Yaw,
                })
            except Exception:
                pass

        elif msg_type == "MODE":
            try:
                mode_num = getattr(msg, "ModeNum", None)
                mode_name = getattr(msg, "Mode", None)

                # Try to resolve numeric mode to human-readable name
                if mode_num is not None:
                    resolved = COPTER_MODES.get(mode_num)
                    if resolved is None:
                        resolved = PLANE_MODES.get(mode_num)
                    if resolved:
                        mode_name = resolved
                    elif mode_name is None:
                        mode_name = f"MODE_{mode_num}"

                if mode_name is None:
                    mode_name = "UNKNOWN"

                modes_list.append({
                    "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                    "mode": str(mode_name),
                    "mode_num": mode_num,
                })
            except Exception:
                pass

        elif msg_type == "MSG":
            try:
                text = msg.Message
                # Extract firmware version
                txt_lower = text.lower()
                if firmware_version is None:
                    for tag in ("arducopter", "arduplane", "ardurover", "ardusub"):
                        if tag in txt_lower:
                            firmware_version = text.strip()
                            break

                # Filter out noise
                if not _should_skip_message(text):
                    messages_list.append({
                        "time_ms": int(getattr(msg, "TimeUS", 0) / 1000),
                        "text": text,
                    })
            except Exception:
                pass

        elif msg_type == "PARM":
            try:
                params[msg.Name] = msg.Value
            except Exception:
                pass

    # Detect vehicle type from firmware_version or messages
    if firmware_version:
        fl = firmware_version.lower()
        if "arducopter" in fl:
            vehicle_type = "ArduCopter"
        elif "arduplane" in fl:
            vehicle_type = "ArduPlane"
        elif "ardurover" in fl:
            vehicle_type = "ArduRover"
        elif "ardusub" in fl:
            vehicle_type = "ArduSub"
    else:
        for m in messages_list:
            txt = m.get("text", "").lower()
            if "arducopter" in txt:
                vehicle_type = "ArduCopter"
                break
            elif "arduplane" in txt:
                vehicle_type = "ArduPlane"
                break
            elif "ardurover" in txt:
                vehicle_type = "ArduRover"
                break
            elif "ardusub" in txt:
                vehicle_type = "ArduSub"
                break

    return {
        "gps": gps_list,
        "battery": battery_list,
        "attitude": attitude_list,
        "modes": modes_list,
        "messages": messages_list,
        "params": params,
        "vehicle_type": vehicle_type,
        "firmware_version": firmware_version,
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
