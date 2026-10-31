"""Safe Vehicle-to-Foot Last-Mile Routing Service.

Evaluates whether a vehicle journey can be safely and effectively shortened
by parking at an accessible candidate stopping point and walking the final
500m to 1km to the destination.

Strict Safety and Verification Policies:
  - Verifies whether a genuine pedestrian routing provider is configured.
  - Standard OSRM driving instances only run vehicle profiles; if a verified
    footway profile is not available, the service explicitly returns
    status='unverified', verified=False, and NEVER fabricates straight-line paths.
  - Evaluates hazard proximity (landslides, flash floods, impassable closures)
    along the pedestrian corridor; rejects walking if hazards intersect.
  - Compares total journey time (vehicle-to-stop + parking buffer + walk)
    against vehicle-only journey. Walking is not recommended unless it provides
    a concrete safety or time advantage.
"""
import os
import math
from typing import Optional, List, Dict, Any, Tuple
import httpx

PEDESTRIAN_ROUTER_URL = os.getenv("PEDESTRIAN_ROUTER_URL", "").strip()
DEFAULT_MAX_WALK_DISTANCE_M = 1000  # Default 1 km, configurable down to 500m
TRANSITION_BUFFER_MINUTES = 3.0     # Unloading and parking transition buffer
AVERAGE_WALKING_SPEED_M_PER_MIN = 75.0  # 4.5 km/h hill walking speed


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate great-circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def inspect_pedestrian_provider(router_url: Optional[str] = None) -> Tuple[bool, str]:
    """Inspect the configured pedestrian routing provider.

    Verifies whether the endpoint is active and genuinely supports pedestrian
    footways rather than falling back to driving profiles.
    """
    url = router_url or PEDESTRIAN_ROUTER_URL
    if not url:
        return (
            False,
            "No dedicated pedestrian routing provider configured (PEDESTRIAN_ROUTER_URL). "
            "Standard OSRM instances only support vehicle profiles.",
        )

    # Test endpoint probe with a micro-segment
    probe_url = f"{url.rstrip('/')}/route/v1/foot/91.70,26.11;91.705,26.115?overview=full&geometries=geojson"
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(probe_url)
            if resp.status_code != 200:
                return False, f"Provider returned HTTP {resp.status_code} on footway query."

            data = resp.json()
            routes = data.get("routes", [])
            if not routes:
                return False, "Provider returned no foot routes."

            # Check if duration matches realistic walking speed
            dist = routes[0].get("distance", 0)
            duration = routes[0].get("duration", 0)
            if duration > 0:
                speed_m_s = dist / duration
                if speed_m_s > 3.0:  # > 10.8 km/h is motorized, not footway
                    return (
                        False,
                        f"Configured router returned motorized speed ({speed_m_s * 3.6:.1f} km/h); "
                        "not a valid pedestrian foot profile.",
                    )

            return True, "Verified pedestrian routing provider active."
    except Exception as e:
        return False, f"Could not reach pedestrian routing provider: {str(e)}"


def query_pedestrian_route(
    start_lat: float,
    start_lng: float,
    dest_lat: float,
    dest_lng: float,
    custom_provider_url: Optional[str] = None,
) -> Tuple[bool, Optional[List[List[float]]], float, float, str]:
    """Query verified pedestrian route from the provider.

    Returns:
      (verified, coordinates_list, distance_meters, duration_seconds, status_message)
    """
    url = custom_provider_url or PEDESTRIAN_ROUTER_URL
    if not url:
        return (
            False,
            None,
            0.0,
            0.0,
            "Pedestrian provider not configured. Unmapped or straight-line trails are never fabricated.",
        )

    route_url = (
        f"{url.rstrip('/')}/route/v1/foot/{start_lng:.6f},{start_lat:.6f};"
        f"{dest_lng:.6f},{dest_lat:.6f}?overview=full&geometries=geojson"
    )

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(route_url)
            if resp.status_code != 200:
                return False, None, 0.0, 0.0, f"Router returned HTTP {resp.status_code}."

            data = resp.json()
            routes = data.get("routes", [])
            if not routes:
                return False, None, 0.0, 0.0, "No pedestrian path found between stopping point and destination."

            route0 = routes[0]
            distance_m = float(route0.get("distance", 0.0))
            duration_s = float(route0.get("duration", 0.0))
            geometry = route0.get("geometry", {})
            coords = geometry.get("coordinates", [])

            # Convert [lng, lat] GeoJSON to [lat, lng]
            lat_lng_coords = [[pt[1], pt[0]] for pt in coords]

            # Verify speed plausibility
            if duration_s > 0 and (distance_m / duration_s) > 3.0:
                return (
                    False,
                    None,
                    0.0,
                    0.0,
                    "Provider returned motorized travel metrics, rejecting as unverified footway.",
                )

            return True, lat_lng_coords, distance_m, duration_s, "Verified pedestrian path mapped."
    except Exception as e:
        return False, None, 0.0, 0.0, f"Pedestrian router query failed: {str(e)}"


def check_pedestrian_path_safety(
    path_coords: List[List[float]],
    active_incidents: Optional[List[Dict[str, Any]]] = None,
    buffer_meters: float = 120.0,
) -> Tuple[bool, List[str]]:
    """Check whether a pedestrian path intersects or runs dangerously close to active hazards."""
    if not active_incidents or not path_coords:
        return True, []

    safety_issues = []
    for inc in active_incidents:
        inc_lat = inc.get("lat")
        inc_lng = inc.get("lng")
        if inc_lat is None or inc_lng is None:
            continue

        itype = inc.get("type", "hazard").replace("_", " ").title()
        sev = inc.get("severity", "medium").title()

        # Check distance to each point in the pedestrian path
        for pt in path_coords:
            dist = _haversine_meters(pt[0], pt[1], inc_lat, inc_lng)
            if dist <= buffer_meters:
                safety_issues.append(
                    f"Pedestrian path is within {dist:.0f}m of active {sev} {itype} near ({inc_lat:.3f}, {inc_lng:.3f})."
                )
                break

    return len(safety_issues) == 0, safety_issues


def find_candidate_stopping_point(
    route_coords: List[List[float]],
    dest_lat: float,
    dest_lng: float,
    max_walk_m: float = DEFAULT_MAX_WALK_DISTANCE_M,
) -> Optional[Dict[str, Any]]:
    """Identify a candidate vehicle stopping point along the vehicle approach corridor
    that is within the allowable walking distance from the destination.
    """
    if not route_coords or len(route_coords) < 2:
        return None

    # Search backwards from near the destination along the route approach
    candidates = []
    for i in range(len(route_coords) - 1, -1, -1):
        pt = route_coords[i]
        d_dest = _haversine_meters(pt[0], pt[1], dest_lat, dest_lng)
        # We look for a vehicle pull-out / parking stop between 300m and max_walk_m
        if 250.0 <= d_dest <= max_walk_m:
            candidates.append({
                "lat": pt[0],
                "lng": pt[1],
                "index": i,
                "straight_line_dist_m": round(d_dest, 1),
                "name": f"Vehicle Staging Point ({round(d_dest)}m from destination)",
            })

    if not candidates:
        # Check if the second-to-last coordinate is within reach
        last_before = route_coords[-2] if len(route_coords) >= 2 else route_coords[0]
        d = _haversine_meters(last_before[0], last_before[1], dest_lat, dest_lng)
        if d <= max_walk_m:
            return {
                "lat": last_before[0],
                "lng": last_before[1],
                "index": len(route_coords) - 2,
                "straight_line_dist_m": round(d, 1),
                "name": f"Approach Shoulder / Staging Point ({round(d)}m from destination)",
            }
        return None

    # Pick the candidate closest to ~600m (optimal comfortable walk) or nearest
    candidates.sort(key=lambda c: abs(c["straight_line_dist_m"] - 600.0))
    return candidates[0]


def evaluate_last_mile(
    route,
    destination: Optional[Dict[str, Any]] = None,
    max_walk_distance_m: int = DEFAULT_MAX_WALK_DISTANCE_M,
    active_incidents: Optional[List[Dict[str, Any]]] = None,
    custom_pedestrian_provider: Optional[str] = None,
    simulated_foot_path: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Comprehensive evaluation of vehicle-to-foot last-mile delivery option.

    Returns structured comparison between vehicle-only journey and multimodal
    vehicle-to-foot journey with transparent reasons for acceptance or rejection.
    """
    coords = getattr(route, "coordinates", []) or []
    if not coords:
        return {
            "status": "unverified",
            "verified": False,
            "is_accepted": False,
            "max_walk_distance_m": max_walk_distance_m,
            "reasons": ["No route coordinates available to evaluate stopping points."],
            "pedestrian_path": None,
            "stopping_point": None,
            "best_vehicle_route": None,
        }

    # Destination point
    if destination and "lat" in destination and "lng" in destination:
        dest_lat = float(destination["lat"])
        dest_lng = float(destination["lng"])
        dest_name = destination.get("name", getattr(route, "destination_name", "Destination"))
    else:
        dest_lat = coords[-1][0]
        dest_lng = coords[-1][1]
        dest_name = getattr(route, "destination_name", "Destination")

    vehicle_distance_km = float(getattr(route, "distance_km", 0.0))
    vehicle_time_hours = float(getattr(route, "travel_time_hours", 0.0))
    vehicle_only_time_min = round(vehicle_time_hours * 60.0, 1)

    # 1. Identify Candidate Vehicle Stopping Point
    candidate_stop = find_candidate_stopping_point(coords, dest_lat, dest_lng, max_walk_distance_m)
    if not candidate_stop:
        return {
            "status": "rejected",
            "verified": False,
            "is_accepted": False,
            "max_walk_distance_m": max_walk_distance_m,
            "reasons": [
                f"No suitable vehicle stopping point found within configured {max_walk_distance_m}m limit.",
                "Vehicle approach passes too far from destination to permit walking.",
            ],
            "pedestrian_path": None,
            "stopping_point": None,
            "best_vehicle_route": {
                "distance_km": vehicle_distance_km,
                "time_minutes": vehicle_only_time_min,
                "destination": dest_name,
            },
        }

    stop_lat = candidate_stop["lat"]
    stop_lng = candidate_stop["lng"]

    # 2. Query Pedestrian Route Geometry
    # Support simulated_foot_path only when explicitly passed (e.g. unit tests or demo mock)
    if simulated_foot_path and simulated_foot_path.get("coordinates"):
        verified = True
        foot_coords = simulated_foot_path["coordinates"]
        walk_dist_m = float(simulated_foot_path.get("distance_m", candidate_stop["straight_line_dist_m"] * 1.15))
        walk_dur_s = float(simulated_foot_path.get("duration_s", (walk_dist_m / AVERAGE_WALKING_SPEED_M_PER_MIN) * 60.0))
        prov_msg = "Simulated verified footway corridor for test scenario."
    else:
        verified, foot_coords, walk_dist_m, walk_dur_s, prov_msg = query_pedestrian_route(
            stop_lat, stop_lng, dest_lat, dest_lng, custom_provider_url=custom_pedestrian_provider
        )

    # Strict compliance: if pedestrian routing is unavailable, return honest unverified state
    if not verified or not foot_coords:
        return {
            "status": "unverified",
            "verified": False,
            "is_accepted": False,
            "max_walk_distance_m": max_walk_distance_m,
            "stopping_point": {
                "lat": stop_lat,
                "lng": stop_lng,
                "name": candidate_stop["name"],
            },
            "reasons": [
                f"Pedestrian routing could not be verified: {prov_msg}",
                "Never assuming unmapped trails or straight lines are safe for pedestrian travel.",
            ],
            "pedestrian_path": None,
            "best_vehicle_route": {
                "distance_km": vehicle_distance_km,
                "time_minutes": vehicle_only_time_min,
                "destination": dest_name,
            },
        }

    # 3. Check Walking Distance Constraint
    if walk_dist_m > max_walk_distance_m:
        return {
            "status": "rejected",
            "verified": True,
            "is_accepted": False,
            "max_walk_distance_m": max_walk_distance_m,
            "walking_distance_m": round(walk_dist_m, 1),
            "stopping_point": {
                "lat": stop_lat,
                "lng": stop_lng,
                "name": candidate_stop["name"],
            },
            "reasons": [
                f"Actual mapped footway distance ({walk_dist_m:.0f}m) exceeds configured limit ({max_walk_distance_m}m).",
            ],
            "pedestrian_path": foot_coords,
            "best_vehicle_route": {
                "distance_km": vehicle_distance_km,
                "time_minutes": vehicle_only_time_min,
                "destination": dest_name,
            },
        }

    # 4. Check Pedestrian Path Safety Against Active Hazards
    is_safe, safety_violations = check_pedestrian_path_safety(foot_coords, active_incidents)
    if not is_safe:
        return {
            "status": "rejected",
            "verified": True,
            "is_accepted": False,
            "max_walk_distance_m": max_walk_distance_m,
            "walking_distance_m": round(walk_dist_m, 1),
            "stopping_point": {
                "lat": stop_lat,
                "lng": stop_lng,
                "name": candidate_stop["name"],
            },
            "reasons": [
                "Pedestrian route rejected due to proximity to active hazards:",
                *safety_violations,
            ],
            "pedestrian_path": foot_coords,
            "best_vehicle_route": {
                "distance_km": vehicle_distance_km,
                "time_minutes": vehicle_only_time_min,
                "destination": dest_name,
            },
        }

    # 5. Journey Time & Detour Comparison
    # Estimate vehicle detour to drive all the way to destination vs stopping
    stop_idx = candidate_stop.get("index", len(coords) - 2)
    fraction_to_stop = max(0.5, min(0.98, float(stop_idx) / max(1, len(coords) - 1)))

    vehicle_to_stop_dist_km = round(vehicle_distance_km * fraction_to_stop, 2)
    vehicle_to_stop_time_h = round(vehicle_time_hours * fraction_to_stop, 2)
    vehicle_to_stop_time_min = round(vehicle_to_stop_time_h * 60.0, 1)

    detour_avoided_km = round(max(0.0, vehicle_distance_km - vehicle_to_stop_dist_km), 2)

    walk_time_min = round(max(1.0, walk_dur_s / 60.0 if walk_dur_s > 0 else (walk_dist_m / AVERAGE_WALKING_SPEED_M_PER_MIN)), 1)
    multimodal_time_min = round(vehicle_to_stop_time_min + TRANSITION_BUFFER_MINUTES + walk_time_min, 1)
    time_saved_min = round(vehicle_only_time_min - multimodal_time_min, 1)

    # Check if road to destination is blocked near the end
    road_is_blocked = False
    if active_incidents:
        for inc in active_incidents:
            if inc.get("severity") == "severe" or "block" in inc.get("description", "").lower():
                road_is_blocked = True
                break

    # Decision Logic:
    reasons: List[str] = []
    is_accepted = False

    if road_is_blocked:
        is_accepted = True
        reasons.append("Vehicle corridor blocked by closure near destination.")
        reasons.append(f"Safe verified footway ({walk_dist_m:.0f}m, ~{walk_time_min:.0f} mins walk) provides the only viable delivery access.")
    elif time_saved_min >= 8.0 or detour_avoided_km >= 3.0:
        is_accepted = True
        reasons.append(
            f"Walking the final {walk_dist_m:.0f}m avoids a {detour_avoided_km:.1f}km vehicle switchback detour."
        )
        reasons.append(f"Saves approx {time_saved_min:.0f} minutes total journey time.")
    else:
        is_accepted = False
        reasons.append(
            f"Vehicle-only delivery is faster by {abs(time_saved_min):.0f} mins than parking and walking."
        )
        reasons.append("Walking option offers no operational or safety advantage over vehicle transit.")

    return {
        "status": "accepted" if is_accepted else "rejected",
        "verified": True,
        "is_accepted": is_accepted,
        "max_walk_distance_m": max_walk_distance_m,
        "stopping_point": {
            "lat": stop_lat,
            "lng": stop_lng,
            "name": candidate_stop["name"],
        },
        "destination": {
            "lat": dest_lat,
            "lng": dest_lng,
            "name": dest_name,
        },
        "walking_distance_m": round(walk_dist_m, 1),
        "walking_time_minutes": walk_time_min,
        "transition_buffer_minutes": TRANSITION_BUFFER_MINUTES,
        "vehicle_detour_avoided_km": detour_avoided_km,
        "vehicle_only_time_minutes": vehicle_only_time_min,
        "multimodal_total_time_minutes": multimodal_time_min,
        "time_saved_minutes": time_saved_min,
        "pedestrian_path": foot_coords,
        "reasons": reasons,
        "best_vehicle_route": {
            "distance_km": vehicle_distance_km,
            "time_minutes": vehicle_only_time_min,
            "destination": dest_name,
        },
    }
