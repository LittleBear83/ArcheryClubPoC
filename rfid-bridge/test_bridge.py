import http.client
import json
import threading
import time
import unittest
from unittest import mock

import bridge


class BridgeApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bridge.STATE = bridge.BridgeState()
        cls.server = bridge.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            bridge.BridgeHandler,
        )
        cls.server.daemon_threads = True
        cls.thread = threading.Thread(
            target=cls.server.serve_forever,
            daemon=True,
        )
        cls.thread.start()
        cls.port = cls.server.server_address[1]
        cls.origin = bridge.DEFAULT_CONFIG["allowedOrigins"][0]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method, path, body=None, origin=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.port,
            timeout=3,
        )
        encoded = json.dumps(body).encode() if body is not None else None
        headers = {"Origin": origin or self.origin}

        if encoded is not None:
            headers["Content-Type"] = "application/json"
            headers["Content-Length"] = str(len(encoded))

        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        result = (
            response.status,
            response.getheader("Access-Control-Allow-Origin"),
            json.loads(payload),
        )
        connection.close()
        return result

    def test_health_and_readers_use_existing_contract(self):
        health = self.request("GET", "/health")
        readers = self.request("GET", "/readers")

        self.assertEqual(health[0], 200)
        self.assertEqual(health[1], self.origin)
        self.assertTrue(health[2]["success"])
        self.assertEqual(health[2]["service"], "selby-rfid-bridge")
        self.assertEqual(readers[0], 200)
        self.assertTrue(readers[2]["success"])

    def test_scan_returns_the_next_pcsc_uid(self):
        bridge.STATE.update_readers(["ACS ACR122 0"])

        publisher = threading.Thread(
            target=lambda: (
                time.sleep(0.1),
                bridge.STATE.publish_scan(
                    "ACS ACR122 0",
                    "A1B2C3D4",
                    "3B00",
                ),
            ),
            daemon=True,
        )
        publisher.start()

        response = self.request("POST", "/scan", {"timeoutMs": 1000})

        self.assertEqual(response[0], 200)
        self.assertEqual(response[2]["scan"]["uid"], "A1B2C3D4")

    def test_events_starts_with_reader_status(self):
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.port,
            timeout=3,
        )
        connection.request("GET", "/events", headers={"Origin": self.origin})
        response = connection.getresponse()

        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Content-Type"), "text/event-stream")
        self.assertEqual(response.readline().decode().strip(), "event: status")
        self.assertTrue(response.readline().decode().startswith("data: "))
        connection.close()

    def test_events_reports_reader_unplug_and_replug_status(self):
        bridge.STATE.update_readers(["ACS ACR122 0"])
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.port,
            timeout=3,
        )
        connection.request("GET", "/events", headers={"Origin": self.origin})
        response = connection.getresponse()
        response.readline()
        response.readline()
        response.readline()

        bridge.STATE.update_readers([])
        self.assertEqual(response.readline().decode().strip(), "event: status")
        unplugged = json.loads(
            response.readline().decode().removeprefix("data: ")
        )
        response.readline()
        self.assertEqual(unplugged["readerCount"], 0)

        bridge.STATE.update_readers(["ACS ACR122 0"])
        self.assertEqual(response.readline().decode().strip(), "event: status")
        replugged = json.loads(
            response.readline().decode().removeprefix("data: ")
        )
        self.assertEqual(replugged["readers"], ["ACS ACR122 0"])
        connection.close()

    def test_unknown_origin_is_rejected(self):
        response = self.request(
            "GET",
            "/health",
            origin="https://not-allowed.example",
        )

        self.assertEqual(response[0], 403)
        self.assertFalse(response[2]["success"])


class ReaderMonitorTest(unittest.TestCase):
    def test_reader_unplug_and_replug_is_detected_without_restart(self):
        class FakeReader:
            def __str__(self):
                return "ACS ACR122 0"

            def createConnection(self):
                raise RuntimeError("No card present")

        class RecordingState(bridge.BridgeState):
            def __init__(self):
                super().__init__()
                self.reader_updates = []

            def update_readers(self, names):
                super().update_readers(names)
                self.reader_updates.append(list(names))

        states = [[FakeReader()], [], [FakeReader()]]
        original_state = bridge.STATE
        recording_state = RecordingState()
        bridge.STATE = recording_state
        bridge.SHUTDOWN_EVENT.clear()

        def fake_readers():
            result = states.pop(0)
            if not states:
                bridge.SHUTDOWN_EVENT.set()
            return result

        try:
            with mock.patch.object(bridge, "readers", side_effect=fake_readers):
                with mock.patch.dict(
                    bridge.CONFIG,
                    {"pollIntervalMs": 100},
                ):
                    bridge.reader_monitor()
        finally:
            bridge.SHUTDOWN_EVENT.clear()
            bridge.STATE = original_state

        self.assertEqual(
            recording_state.reader_updates,
            [["ACS ACR122 0"], [], ["ACS ACR122 0"]],
        )


if __name__ == "__main__":
    unittest.main()
