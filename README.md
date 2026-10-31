# MOSSAM - Smart Logistics & Accessibility Intelligence Platform

A full-stack hackathon prototype:
- **Frontend:** React + TypeScript + Vite, integrating **MapmyIndia's Interactive Maps SDK**.
- **Backend:** Python **FastAPI** + **SQLite** (via SQLAlchemy) + **Pydantic**, implementing the central
  incident -> risk-aware reroute -> alert -> impact pipeline described below.

> **Note:** This project requires a MapmyIndia API key before it can be run locally. The backend runs
> fully offline/locally with no paid services required.

## Quick Start (both servers)

```bash
# Terminal 1 - backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    |    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# -> API on http://localhost:8000 (docs at http://localhost:8000/docs)
# SQLite DB (mossam.db) is created and seeded with the existing mock data automatically.

# Terminal 2 - frontend
npm install
cp .env.example .env   # then fill in VITE_MAPMYINDIA_API_KEY
npm run dev
# -> App on http://localhost:5173
```

Run backend tests any time with:
```bash
cd backend
pytest -q
```

## How the core incident flow works

1. Control Room's **Simulate Incident** panel (or a driver's **Report Blockage** form) calls
   `POST /api/incidents` (or `/api/blockage-reports`, which reuses the same flow internally).
2. The backend persists the incident, recalculates the affected route's hazard risk/reliability
   with a transparent weighted formula (`backend/app/services/risk_engine.py`), generates a lower-scoring
   alternative route, creates an `Alert`, and writes a `RouteDecision` explaining *why* (hazard risk,
   ETA delta, risk reduction) - see `backend/app/services/explanation_service.py`.
3. The Control Room UI polls `/api/fleet`, `/api/alerts`, `/api/impact`, and `/api/routes/compare/{vehicle}`
   every few seconds and reflects the new state.
4. The Driver app polls the same comparison endpoint; when a pending AI route exists it shows a
   `RerouteBanner` with the real reason/ETA/distance delta. Accepting calls
   `POST /api/incidents/reroute/accept`, switching the vehicle onto the new route.
5. Impact stats (`/api/impact`) increment automatically (reroutes issued, corridors avoided, fuel/CO2 saved).

No real-time transport (WebSocket) was added since 3-6s polling is genuinely sufficient for this
demo's scale and keeps the stack simpler, per the project's "no unnecessary dependencies" constraint.

## Offline demo (driver app)

- `src/services/offlineQueue.ts` checks `navigator.onLine`, caches the last active route, and queues
  blockage reports locally (in `localStorage`) when offline.
- The `ConnectivityBadge` reflects the browser's real online/offline state and shows a "queued" count.
- On reconnect (`window` `online` event), queued reports are automatically resubmitted.

## AI explanation (optional Ollama)

`backend/app/services/explanation_service.py` always builds a deterministic, numbers-grounded
explanation first. If `use_ollama=true` is passed to `/api/incidents` and a local Ollama server is
running (`http://localhost:11434`), the text is reworded into more natural language - with a strict
2.5s timeout and a silent fallback to the deterministic text on any failure. **The app works fully
without Ollama.**

## Prerequisites

Before starting, create your own `.env` file in the project root.

### 1. Get a MapmyIndia API Key

1. Create a developer account on **MapmyIndia**. Website: https://www.mapmyindia.com
2. Generate an API key from the Developer Portal.
3. Copy your API key. The MapmyIndia developer platform provides the Interactive Maps SDK and related APIs needed for this application. 



### 2. Create the `.env` file

Create a file named **`.env`** in the root directory of the project:

```env
VITE_MAPMYINDIA_API_KEY=your_api_key_here
```

> **Important:** The variable name **must** be exactly `VITE_MAPMYINDIA_API_KEY`.

## Installation

Clone the repository and install the dependencies:

```bash
git clone <your-repository-url>
cd <repository-name>
npm install
```

## Running the Project

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

## Project Structure

```text
├── public/            # Static assets
├── src/               # Frontend application source
│   └── services/      # api.ts (backend client), offlineQueue.ts
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── main.py, database.py, models.py, schemas.py, seed.py
│   │   ├── routes/    # fleet, routes_api, incidents, alerts, blockage, impact
│   │   └── services/  # risk_engine, incident_service, explanation_service
│   ├── tests/         # pytest suite for the core incident flow
│   └── requirements.txt
├── .env.example       # Copy to .env and fill in
├── package.json
└── vite.config.ts
```

## Tech Stack

* **Frontend:** Vite, React, TypeScript, MapmyIndia Interactive Maps SDK
* **Backend:** FastAPI, SQLAlchemy + SQLite, Pydantic, pytest

## Environment Variables

| Variable                   | Where          | Description                                  |
| --------------------------- | -------------- | --------------------------------------------- |
| `VITE_MAPMYINDIA_API_KEY`   | frontend `.env`| Your MapmyIndia API key                       |
| `VITE_API_BASE_URL`         | frontend `.env`| FastAPI backend URL (default `http://localhost:8000`) |

## License

This project is intended for academic and prototype development purposes.
