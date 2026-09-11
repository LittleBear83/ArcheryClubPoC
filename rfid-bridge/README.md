# Selby RFID Reader Bridge

Local loopback service used by the Selby Archery Club portal to communicate
with a USB PC/SC RFID reader.

The bridge deliberately contains no membership credentials, Cloud database
credentials, door-access decisions, or member-management business logic.

## Network boundary

The service listens only on:

    http://127.0.0.1:8765

It must not be exposed to the LAN or Internet.

## Raspberry Pi

The proven Raspberry Pi 5 installation uses Debian packages rather than
installing Python packages into the system Python environment:

    sudo apt update
    sudo apt install -y pcscd libacsccid1 pcsc-tools python3-pyscard

The tested Pi currently uses python3-pyscard 2.2.2.

Do not run `pip install` against the Pi system Python. Debian protects the
system Python environment using PEP 668.

The production bridge is installed at:

    /opt/selby-rfid-bridge

The supplied `selby-rfid-bridge.service` can be installed into:

    /etc/systemd/system/selby-rfid-bridge.service

Then enable it with:

    sudo systemctl daemon-reload
    sudo systemctl enable --now selby-rfid-bridge.service

## Windows development

Use a Python virtual environment:

    py -m venv .venv
    .venv\Scripts\activate
    python -m pip install -r requirements.txt

Windows uses the operating system PC/SC smart-card service.

## HTTP API

The bridge exposes:

- `GET /health`
- `GET /readers`
- `POST /scan`
- `GET /events`

`/events` is an SSE stream used by the browser portal for live card and fob
presentation events.

## Portal architecture

The browser talks to the local bridge only for reader discovery and RFID UID
events.

Member authentication, RFID assignment, duplicate-tag checking, database
writes, auditing, and access decisions remain in the authenticated portal and
server APIs.
