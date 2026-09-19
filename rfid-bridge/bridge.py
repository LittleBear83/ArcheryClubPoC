#!/usr/bin/env python3

import json
import platform
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from smartcard.System import readers

BRIDGE_VERSION = "0.1.0"
GET_UID_APDU = [0xFF, 0xCA, 0x00, 0x00, 0x00]

DEFAULT_CONFIG = {
    "host": "127.0.0.1",
    "port": 8765,
    "pollIntervalMs": 350,
    "scanTimeoutMs": 15000,
    "allowedOrigins": [
        "https://archeryclub-poc-76370894029.europe-west2.run.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
}


def load_config():
    config = dict(DEFAULT_CONFIG)
    config_path = Path(__file__).with_name("config.json")

    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as handle:
            supplied = json.load(handle)

        if isinstance(supplied, dict):
            config.update(supplied)

    return config


CONFIG = load_config()


class BridgeState:
    def __init__(self):
        self.lock = threading.RLock()
        self.scan_condition = threading.Condition(self.lock)
        self.sequence = 0
        self.latest_scan = None
        self.reader_names = []
        self.pcsc_available = False
        self.last_error = None
        self.card_present = {}

    def update_readers(self, names):
        with self.lock:
            self.reader_names = names
            self.pcsc_available = True
            self.last_error = None

    def set_pcsc_error(self, message):
        with self.lock:
            self.reader_names = []
            self.pcsc_available = False
            self.last_error = str(message)

    def publish_scan(self, reader_name, uid, atr):
        with self.scan_condition:
            self.sequence += 1
            self.latest_scan = {
                "sequence": self.sequence,
                "uid": uid,
                "reader": reader_name,
                "atr": atr,
                "scannedAt": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ",
                    time.gmtime(),
                ),
            }
            self.scan_condition.notify_all()

    def reader_snapshot(self):
        with self.lock:
            return {
                "pcscAvailable": self.pcsc_available,
                "readers": list(self.reader_names),
                "readerCount": len(self.reader_names),
                "lastError": self.last_error,
            }

    def current_sequence(self):
        with self.lock:
            return self.sequence

    def wait_for_scan_after(self, sequence, timeout_seconds):
        deadline = time.monotonic() + timeout_seconds

        with self.scan_condition:
            while self.sequence <= sequence:
                remaining = deadline - time.monotonic()

                if remaining <= 0:
                    return None

                self.scan_condition.wait(timeout=remaining)

            return dict(self.latest_scan)


STATE = BridgeState()


def bytes_to_hex(values):
    return "".join(f"{value:02X}" for value in values)


def read_card_uid(connection):
    data, sw1, sw2 = connection.transmit(GET_UID_APDU)

    if sw1 != 0x90 or sw2 != 0x00:
        raise RuntimeError(
            f"Reader rejected UID command with status {sw1:02X}{sw2:02X}"
        )

    if not data:
        raise RuntimeError("Reader returned an empty UID.")

    return bytes_to_hex(data)


def reader_monitor():
    poll_seconds = max(
        0.1,
        float(CONFIG.get("pollIntervalMs", 350)) / 1000.0,
    )

    while True:
        try:
            available_readers = list(readers())
            names = [str(reader) for reader in available_readers]
            STATE.update_readers(names)

            active_names = set(names)

            with STATE.lock:
                stale_names = set(STATE.card_present) - active_names

                for stale_name in stale_names:
                    STATE.card_present.pop(stale_name, None)

            for reader in available_readers:
                reader_name = str(reader)

                try:
                    connection = reader.createConnection()
                    connection.connect()

                    atr = bytes_to_hex(connection.getATR())
                    uid = read_card_uid(connection)

                    with STATE.lock:
                        was_present = STATE.card_present.get(reader_name, False)
                        STATE.card_present[reader_name] = True

                    if not was_present:
                        print(
                            f"RFID scan: reader={reader_name!r} uid={uid}",
                            flush=True,
                        )
                        STATE.publish_scan(reader_name, uid, atr)

                    try:
                        connection.disconnect()
                    except Exception:
                        pass

                except Exception:
                    with STATE.lock:
                        STATE.card_present[reader_name] = False

        except Exception as error:
            STATE.set_pcsc_error(error)

        time.sleep(poll_seconds)


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SelbyRfidBridge/" + BRIDGE_VERSION

    def log_message(self, format_string, *args):
        print(
            f"{self.address_string()} - {format_string % args}",
            flush=True,
        )

    def origin_allowed(self):
        origin = self.headers.get("Origin")

        if not origin:
            return True

        allowed = CONFIG.get("allowedOrigins", [])
        return origin in allowed

    def add_cors_headers(self):
        origin = self.headers.get("Origin")

        if origin and origin in CONFIG.get("allowedOrigins", []):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )

        # Compatibility with browser Private Network Access preflights.
        if (
            self.headers.get(
                "Access-Control-Request-Private-Network",
                "",
            ).lower()
            == "true"
        ):
            self.send_header(
                "Access-Control-Allow-Private-Network",
                "true",
            )

    def send_json(self, status_code, payload):
        encoded = json.dumps(payload).encode("utf-8")

        self.send_response(status_code)
        self.add_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def reject_origin(self):
        self.send_json(
            403,
            {
                "success": False,
                "message": "Origin is not permitted to use this RFID bridge.",
            },
        )

    def do_OPTIONS(self):
        if not self.origin_allowed():
            self.reject_origin()
            return

        self.send_response(204)
        self.add_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self.origin_allowed():
            self.reject_origin()
            return

        path = urlparse(self.path).path

        if path == "/health":
            snapshot = STATE.reader_snapshot()

            self.send_json(
                200,
                {
                    "success": True,
                    "service": "selby-rfid-bridge",
                    "version": BRIDGE_VERSION,
                    "platform": platform.system().lower(),
                    "architecture": platform.machine(),
                    **snapshot,
                },
            )
            return

        if path == "/readers":
            snapshot = STATE.reader_snapshot()

            self.send_json(
                200,
                {
                    "success": True,
                    **snapshot,
                },
            )
            return

        if path == "/events":
            self.handle_events()
            return

        self.send_json(
            404,
            {
                "success": False,
                "message": "Not found.",
            },
        )

    def do_POST(self):
        if not self.origin_allowed():
            self.reject_origin()
            return

        path = urlparse(self.path).path

        if path != "/scan":
            self.send_json(
                404,
                {
                    "success": False,
                    "message": "Not found.",
                },
            )
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = {}

        if content_length:
            try:
                raw = self.rfile.read(content_length)
                body = json.loads(raw.decode("utf-8"))
            except Exception:
                self.send_json(
                    400,
                    {
                        "success": False,
                        "message": "Request body must be valid JSON.",
                    },
                )
                return

        timeout_ms = body.get(
            "timeoutMs",
            CONFIG.get("scanTimeoutMs", 15000),
        )

        try:
            timeout_ms = int(timeout_ms)
        except (TypeError, ValueError):
            timeout_ms = int(CONFIG.get("scanTimeoutMs", 15000))

        timeout_ms = min(max(timeout_ms, 1000), 60000)

        snapshot = STATE.reader_snapshot()

        if not snapshot["pcscAvailable"]:
            self.send_json(
                503,
                {
                    "success": False,
                    "message": "PC/SC is not available.",
                    **snapshot,
                },
            )
            return

        if snapshot["readerCount"] == 0:
            self.send_json(
                409,
                {
                    "success": False,
                    "message": "No RFID reader is connected.",
                    **snapshot,
                },
            )
            return

        starting_sequence = STATE.current_sequence()

        scan = STATE.wait_for_scan_after(
            starting_sequence,
            timeout_ms / 1000.0,
        )

        if scan is None:
            self.send_json(
                408,
                {
                    "success": False,
                    "message": "No RFID fob was detected before the scan timed out.",
                },
            )
            return

        self.send_json(
            200,
            {
                "success": True,
                "scan": scan,
            },
        )

    def handle_events(self):
        self.send_response(200)
        self.add_cors_headers()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        last_sequence = STATE.current_sequence()

        try:
            initial = {
                "type": "connected",
                "bridgeVersion": BRIDGE_VERSION,
                **STATE.reader_snapshot(),
            }

            self.wfile.write(
                (
                    "event: status\n"
                    f"data: {json.dumps(initial)}\n\n"
                ).encode("utf-8")
            )
            self.wfile.flush()

            while True:
                scan = STATE.wait_for_scan_after(
                    last_sequence,
                    15.0,
                )

                if scan is None:
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
                    continue

                last_sequence = scan["sequence"]

                self.wfile.write(
                    (
                        "event: scan\n"
                        f"data: {json.dumps(scan)}\n\n"
                    ).encode("utf-8")
                )
                self.wfile.flush()

        except (
            BrokenPipeError,
            ConnectionResetError,
            ConnectionAbortedError,
        ):
            return


def main():
    monitor = threading.Thread(
        target=reader_monitor,
        name="rfid-reader-monitor",
        daemon=True,
    )
    monitor.start()

    host = str(CONFIG.get("host", "127.0.0.1"))
    port = int(CONFIG.get("port", 8765))

    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError(
            "RFID bridge must bind to a loopback address only."
        )

    server = ThreadingHTTPServer((host, port), BridgeHandler)

    print(
        f"Selby RFID Bridge {BRIDGE_VERSION} listening on "
        f"http://{host}:{port}",
        flush=True,
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
