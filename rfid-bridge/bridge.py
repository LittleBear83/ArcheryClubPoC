#!/usr/bin/env python3

import json
import logging
from logging.handlers import RotatingFileHandler
import os
import platform
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from smartcard.System import readers

BRIDGE_VERSION = "1.0.0"
GET_UID_APDU = [0xFF, 0xCA, 0x00, 0x00, 0x00]
WINDOWS_MUTEX_NAME = "Local\\SelbyArcheryClubRfidAgent"
WINDOWS_STOP_EVENT_NAME = "Local\\SelbyArcheryClubRfidAgentStop"
LOGGER = logging.getLogger("selby-rfid-agent")
SHUTDOWN_EVENT = threading.Event()

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


def local_app_data_directory():
    if platform.system().lower() == "windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "Selby Archery Club" / "RFID Agent"

    return Path.home() / ".local" / "state" / "selby-rfid-agent"


def application_directory():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent

    return Path(__file__).resolve().parent


def runtime_bind_address():
    if platform.system().lower() == "windows" and getattr(sys, "frozen", False):
        return "127.0.0.1", 8765

    return (
        str(CONFIG.get("host", "127.0.0.1")),
        int(CONFIG.get("port", 8765)),
    )


def load_config():
    config = dict(DEFAULT_CONFIG)
    config_paths = [
        local_app_data_directory() / "config.json",
        application_directory() / "config.json",
    ]

    config_path = next((path for path in config_paths if path.exists()), None)

    if config_path:
        with config_path.open("r", encoding="utf-8") as handle:
            supplied = json.load(handle)

        if isinstance(supplied, dict):
            config.update(supplied)

    return config


CONFIG = load_config()


def configure_logging():
    log_directory = local_app_data_directory() / "logs"
    log_directory.mkdir(parents=True, exist_ok=True)
    log_path = log_directory / "rfid-agent.log"

    handler = RotatingFileHandler(
        log_path,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    )

    LOGGER.handlers.clear()
    LOGGER.addHandler(handler)
    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False

    return log_path


class SingleInstance:
    def __init__(self):
        self.handle = None
        self.stop_event_handle = None

    def acquire(self):
        if platform.system().lower() != "windows":
            return True

        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool
        kernel32.CreateEventW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.CreateEventW.restype = ctypes.c_void_p
        self.handle = kernel32.CreateMutexW(None, False, WINDOWS_MUTEX_NAME)

        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())

        if ctypes.get_last_error() == 183:
            kernel32.CloseHandle(self.handle)
            self.handle = None
            return False

        self.stop_event_handle = kernel32.CreateEventW(
            None,
            False,
            False,
            WINDOWS_STOP_EVENT_NAME,
        )

        if not self.stop_event_handle:
            self.release()
            raise ctypes.WinError(ctypes.get_last_error())

        return True

    def wait_for_stop(self, callback):
        if self.stop_event_handle is None:
            return

        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        kernel32.WaitForSingleObject.restype = ctypes.c_uint32

        if kernel32.WaitForSingleObject(self.stop_event_handle, 0xFFFFFFFF) == 0:
            callback()

    @staticmethod
    def request_existing_stop():
        if platform.system().lower() != "windows":
            return False

        import ctypes

        event_modify_state = 0x0002
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenEventW.argtypes = [ctypes.c_uint32, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.OpenEventW.restype = ctypes.c_void_p
        kernel32.SetEvent.argtypes = [ctypes.c_void_p]
        kernel32.SetEvent.restype = ctypes.c_bool
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool

        handle = kernel32.OpenEventW(
            event_modify_state,
            False,
            WINDOWS_STOP_EVENT_NAME,
        )

        if not handle:
            return False

        try:
            if not kernel32.SetEvent(handle):
                return False
        finally:
            kernel32.CloseHandle(handle)

        for _ in range(100):
            probe = kernel32.OpenEventW(
                event_modify_state,
                False,
                WINDOWS_STOP_EVENT_NAME,
            )

            if not probe:
                return True

            kernel32.CloseHandle(probe)
            time.sleep(0.1)

        return False

    def release(self):
        if self.handle is None:
            return

        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool

        if self.stop_event_handle is not None:
            kernel32.CloseHandle(self.stop_event_handle)
            self.stop_event_handle = None

        kernel32.CloseHandle(self.handle)
        self.handle = None


class BridgeState:
    def __init__(self):
        self.lock = threading.RLock()
        self.event_condition = threading.Condition(self.lock)
        self.sequence = 0
        self.status_sequence = 0
        self.latest_scan = None
        self.reader_names = []
        self.pcsc_available = False
        self.last_error = None
        self.card_present = {}

    def update_readers(self, names):
        with self.event_condition:
            changed = (
                self.reader_names != names
                or not self.pcsc_available
                or self.last_error is not None
            )
            self.reader_names = names
            self.pcsc_available = True
            self.last_error = None

            if changed:
                self.status_sequence += 1
                self.event_condition.notify_all()

    def set_pcsc_error(self, message):
        with self.event_condition:
            message = str(message)
            changed = (
                self.reader_names
                or self.pcsc_available
                or self.last_error != message
            )
            self.reader_names = []
            self.pcsc_available = False
            self.last_error = message

            if changed:
                self.status_sequence += 1
                self.event_condition.notify_all()

    def publish_scan(self, reader_name, uid, atr):
        with self.event_condition:
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
            self.event_condition.notify_all()

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

    def current_status_sequence(self):
        with self.lock:
            return self.status_sequence

    def wait_for_scan_after(self, sequence, timeout_seconds):
        deadline = time.monotonic() + timeout_seconds

        with self.event_condition:
            while self.sequence <= sequence:
                remaining = deadline - time.monotonic()

                if remaining <= 0:
                    return None

                self.event_condition.wait(timeout=remaining)

            return dict(self.latest_scan)

    def wait_for_event_after(
        self,
        scan_sequence,
        status_sequence,
        timeout_seconds,
    ):
        deadline = time.monotonic() + timeout_seconds

        with self.event_condition:
            while (
                self.sequence <= scan_sequence
                and self.status_sequence <= status_sequence
            ):
                remaining = deadline - time.monotonic()

                if remaining <= 0:
                    return None

                self.event_condition.wait(timeout=remaining)

            if self.status_sequence > status_sequence:
                return {
                    "type": "status",
                    "sequence": self.status_sequence,
                    "payload": self.reader_snapshot(),
                }

            return {
                "type": "scan",
                "sequence": self.sequence,
                "payload": dict(self.latest_scan),
            }


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

    previous_names = None

    while not SHUTDOWN_EVENT.is_set():
        try:
            available_readers = list(readers())
            names = [str(reader) for reader in available_readers]
            STATE.update_readers(names)

            if names != previous_names:
                if names:
                    LOGGER.info("RFID reader connected: %s", ", ".join(names))
                else:
                    LOGGER.info("RFID reader not connected")
                previous_names = names

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
                        LOGGER.info("RFID card read by %s", reader_name)
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
            LOGGER.warning("PC/SC unavailable: %s", error)

        SHUTDOWN_EVENT.wait(poll_seconds)


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SelbyRfidBridge/" + BRIDGE_VERSION

    def log_message(self, format_string, *args):
        LOGGER.info("%s - %s", self.address_string(), format_string % args)

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
        last_status_sequence = STATE.current_status_sequence()

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
                bridge_event = STATE.wait_for_event_after(
                    last_sequence,
                    last_status_sequence,
                    15.0,
                )

                if bridge_event is None:
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
                    continue

                if bridge_event["type"] == "status":
                    last_status_sequence = bridge_event["sequence"]
                    event_name = "status"
                else:
                    last_sequence = bridge_event["sequence"]
                    event_name = "scan"

                self.wfile.write(
                    (
                        f"event: {event_name}\n"
                        f"data: {json.dumps(bridge_event['payload'])}\n\n"
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
    if "--stop" in sys.argv[1:]:
        return 0 if SingleInstance.request_existing_stop() else 1

    log_path = configure_logging()
    instance = SingleInstance()

    if not instance.acquire():
        LOGGER.info("RFID agent is already running; exiting second instance")
        return 0

    SHUTDOWN_EVENT.clear()

    monitor = threading.Thread(
        target=reader_monitor,
        name="rfid-reader-monitor",
        daemon=True,
    )
    monitor.start()

    host, port = runtime_bind_address()

    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError(
            "RFID bridge must bind to a loopback address only."
        )

    try:
        server = ThreadingHTTPServer((host, port), BridgeHandler)
    except OSError:
        LOGGER.exception("Could not listen on http://%s:%s", host, port)
        SHUTDOWN_EVENT.set()
        monitor.join(timeout=2.0)
        instance.release()
        return 1

    server.daemon_threads = True

    def request_shutdown(_signum=None, _frame=None):
        if SHUTDOWN_EVENT.is_set():
            return

        LOGGER.info("RFID agent shutdown requested")
        SHUTDOWN_EVENT.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    for signal_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        shutdown_signal = getattr(signal, signal_name, None)
        if shutdown_signal is not None:
            signal.signal(shutdown_signal, request_shutdown)

    threading.Thread(
        target=instance.wait_for_stop,
        args=(request_shutdown,),
        name="rfid-agent-stop-listener",
        daemon=True,
    ).start()

    LOGGER.info(
        "Selby RFID Agent %s listening on http://%s:%s; log=%s",
        BRIDGE_VERSION,
        host,
        port,
        log_path,
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        request_shutdown()
    except Exception:
        LOGGER.exception("RFID agent stopped unexpectedly")
        return 1
    finally:
        SHUTDOWN_EVENT.set()
        server.server_close()
        monitor.join(timeout=2.0)
        instance.release()
        LOGGER.info("RFID agent stopped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
