import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import INSTALL_DATA from "./data/installData";
import SUBURB_HEAT_DATA from "./data/suburbHeatData";

// Mapbox token from .env
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Base style
const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

const INITIAL_CENTER = [150.8, -33.9]; // NSW-ish
const INITIAL_ZOOM = 5;

// 🔐 Simple password (from env, with fallback for local)
const RAW_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const APP_PASSWORD = (RAW_PASSWORD ?? "changeme123").trim();

// ---------- helpers ----------

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function installsToGeoJson(records) {
  return {
    type: "FeatureCollection",
    features: records
      .filter(
        (r) =>
          typeof r.Latitude === "number" &&
          typeof r.Longitude === "number"
      )
      .map((r) => ({
        type: "Feature",
        properties: { ...r },
        geometry: {
          type: "Point",
          coordinates: [r.Longitude, r.Latitude],
        },
      })),
  };
}

function suburbsToGeoJson(rows) {
  return {
    type: "FeatureCollection",
    features: rows
      .filter((r) => {
        const lat = Number(r.Lat);
        const lng = Number(r.Long);
        return !Number.isNaN(lat) && !Number.isNaN(lng);
      })
      .map((r) => ({
        type: "Feature",
        properties: {
          State: r.State ?? "",
          Suburb: r.Suburb ?? "",
          Count: Number(r.Count ?? 0),
        },
        geometry: {
          type: "Point",
          coordinates: [Number(r.Long), Number(r.Lat)],
        },
      })),
  };
}

// ---------- main component ----------

export default function App() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // 🔐 simple password gate state
  const [isAuthed, setIsAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  // --- install filters ---

  // multi-select sale types
  const [selectedSaleTypes, setSelectedSaleTypes] = useState([]);

  const [minKw, setMinKw] = useState("");
  const [maxKw, setMaxKw] = useState("");

  const [minKwh, setMinKwh] = useState("");
  const [maxKwh, setMaxKwh] = useState("");

  const [minSubEx, setMinSubEx] = useState("");
  const [maxSubEx, setMaxSubEx] = useState("");

  const [minSubInc, setMinSubInc] = useState("");
  const [maxSubInc, setMaxSubInc] = useState("");

  const [minNetEx, setMinNetEx] = useState("");
  const [maxNetEx, setMaxNetEx] = useState("");

  const [minNetInc, setMinNetInc] = useState("");
  const [maxNetInc, setMaxNetInc] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // layer toggles
  const [showInstalls, setShowInstalls] = useState(true);
  const [showLeads, setShowLeads] = useState(true);

  // display modes: "heat" | "points" | "both"
  const [installsDisplay, setInstallsDisplay] = useState("both");
  const [leadsDisplay, setLeadsDisplay] = useState("heat");

  // ---------- derived data ----------

  const saleTypes = useMemo(
    () =>
      [...new Set(INSTALL_DATA.map((d) => d["Sale Type"]).filter(Boolean))].sort(),
    []
  );

  const filteredInstalls = useMemo(() => {
    const fMinKw = minKw ? Number(minKw) : null;
    const fMaxKw = maxKw ? Number(maxKw) : null;

    const fMinKwh = minKwh ? Number(minKwh) : null;
    const fMaxKwh = maxKwh ? Number(maxKwh) : null;

    const fMinSubEx = minSubEx ? Number(minSubEx) : null;
    const fMaxSubEx = maxSubEx ? Number(maxSubEx) : null;

    const fMinSubInc = minSubInc ? Number(minSubInc) : null;
    const fMaxSubInc = maxSubInc ? Number(maxSubInc) : null;

    const fMinNetEx = minNetEx ? Number(minNetEx) : null;
    const fMaxNetEx = maxNetEx ? Number(maxNetEx) : null;

    const fMinNetInc = minNetInc ? Number(minNetInc) : null;
    const fMaxNetInc = maxNetInc ? Number(maxNetInc) : null;

    const fStart = startDate ? new Date(startDate) : null;
    const fEnd = endDate ? new Date(endDate) : null;

    return INSTALL_DATA.filter((row) => {
      // multi-select sale type filter
      if (
        selectedSaleTypes.length > 0 &&
        !selectedSaleTypes.includes(row["Sale Type"])
      ) {
        return false;
      }

      const kw = toNumber(row["Total System Size (kW)"]);
      if (fMinKw !== null && (kw === null || kw < fMinKw)) return false;
      if (fMaxKw !== null && (kw === null || kw > fMaxKw)) return false;

      const kwh = toNumber(row["Total Storage (kWh)"]);
      if (fMinKwh !== null && (kwh === null || kwh < fMinKwh)) return false;
      if (fMaxKwh !== null && (kwh === null || kwh > fMaxKwh)) return false;

      const subEx = toNumber(row["Subtotal (Excluding GST)"]);
      if (fMinSubEx !== null && (subEx === null || subEx < fMinSubEx))
        return false;
      if (fMaxSubEx !== null && (subEx === null || subEx > fMaxSubEx))
        return false;

      const subInc = toNumber(row["Subtotal (inc GST)"]);
      if (fMinSubInc !== null && (subInc === null || subInc < fMinSubInc))
        return false;
      if (fMaxSubInc !== null && (subInc === null || subInc > fMaxSubInc))
        return false;

      const netEx = toNumber(row["Net Total (Excluding GST)"]);
      if (fMinNetEx !== null && (netEx === null || netEx < fMinNetEx))
        return false;
      if (fMaxNetEx !== null && (netEx === null || netEx > fMaxNetEx))
        return false;

      const netInc = toNumber(row["Net Total (inc GST)"]);
      if (fMinNetInc !== null && (netInc === null || netInc < fMinNetInc))
        return false;
      if (fMaxNetInc !== null && (netInc === null || netInc > fMaxNetInc))
        return false;

      const d = toDate(row["RFC Coded Date"]);
      if (fStart && (!d || d < fStart)) return false;
      if (fEnd && (!d || d > fEnd)) return false;

      return true;
    });
  }, [
    selectedSaleTypes,
    minKw,
    maxKw,
    minKwh,
    maxKwh,
    minSubEx,
    maxSubEx,
    minSubInc,
    maxSubInc,
    minNetEx,
    maxNetEx,
    minNetInc,
    maxNetInc,
    startDate,
    endDate,
  ]);

  const installsGeoJson = useMemo(
    () => installsToGeoJson(filteredInstalls),
    [filteredInstalls]
  );

  const suburbsGeoJson = useMemo(
    () => suburbsToGeoJson(SUBURB_HEAT_DATA),
    []
  );

  // ---------- password handler ----------

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === APP_PASSWORD) {
      setIsAuthed(true);
      setLoginError("");
      setPasswordInput("");
    } else {
      setLoginError("Incorrect password. Please try again.");
    }
  };

  // ---------- map initialisation ----------

  useEffect(() => {
    if (!isAuthed) return; // don't init map until authed
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      // installs source
      map.addSource("installs", {
        type: "geojson",
        data: installsToGeoJson(INSTALL_DATA),
      });

      // installs heat
      map.addLayer({
        id: "installs-heat",
        type: "heatmap",
        source: "installs",
        maxzoom: 12,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["coalesce", ["to-number", ["get", "Total System Size (kW)"]], 0],
            0, 0.2,
            10, 1,
          ],
          "heatmap-intensity": 0.4,
          "heatmap-radius": 25,
          "heatmap-opacity": 0.6,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,   "rgba(0, 0, 255, 0)",
            0.1, "#ffebb5",
            0.3, "#ffc46b",
            0.5, "#ff9a3c",
            0.7, "#ff6b00",
            1,   "#b93c00",
          ],
        },
      });

      // installs circles
      map.addLayer({
        id: "installs-circle",
        type: "circle",
        source: "installs",
        minzoom: 6,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["to-number", ["get", "Total System Size (kW)"]], 0],
            0, 2.5,
            5, 4,
            10, 5.5,
            20, 7,
          ],
          "circle-color": [
            "match",
            ["get", "Sale Type"],
            "PV and Battery",
            "#1f78b4",
            "PV Only",
            "#33a02c",
            "Retrofit Battery only",
            "#e31a1c",
            /* other */ "#6a3d9a",
          ],
          "circle-opacity": 0.7,
          "circle-stroke-width": 0.8,
          "circle-stroke-color": "#ffffff",
        },
      });

      // popup for installs
      map.on("click", "installs-circle", (e) => {
        const p = e.features?.[0]?.properties || {};

        const name =
          p["Opportunity Name"] ||
          p.OpportunityName ||
          "Unknown";

        const address =
          p["Formatted Address"] ||
          p.Formatted_Address ||
          "";

        const html = `
          <div style="font-size:12px; line-height:1.4; color:#111;">
            <strong>${name}</strong><br/>
            <span>${address}</span><br/><br/>
            <table style="border-collapse:collapse; border-spacing:0;">
              <tr><td><strong>Sale Type:</strong></td><td>&nbsp;${p["Sale Type"] ?? ""}</td></tr>
              <tr><td><strong>System Size (kW):</strong></td><td>&nbsp;${p["Total System Size (kW)"] ?? ""}</td></tr>
              <tr><td><strong>Storage (kWh):</strong></td><td>&nbsp;${p["Total Storage (kWh)"] ?? ""}</td></tr>
              <tr><td><strong>Subtotal ex GST:</strong></td><td>&nbsp;${p["Subtotal (Excluding GST)"] ?? ""}</td></tr>
              <tr><td><strong>Subtotal inc GST:</strong></td><td>&nbsp;${p["Subtotal (inc GST)"] ?? ""}</td></tr>
              <tr><td><strong>Net Total ex GST:</strong></td><td>&nbsp;${p["Net Total (Excluding GST)"] ?? ""}</td></tr>
              <tr><td><strong>Net Total inc GST:</strong></td><td>&nbsp;${p["Net Total (inc GST)"] ?? ""}</td></tr>
              <tr><td><strong>Install Date:</strong></td><td>&nbsp;${p["RFC Coded Date"] ?? ""}</td></tr>
            </table>
          </div>
        `;

        new mapboxgl.Popup({ maxWidth: "260px" })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      map.on("mouseenter", "installs-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "installs-circle", () => {
        map.getCanvas().style.cursor = "";
      });

      // suburbs source
      map.addSource("suburbs", {
        type: "geojson",
        data: suburbsGeoJson,
      });

      // suburbs heat
      map.addLayer(
        {
          id: "suburbs-heat",
          type: "heatmap",
          source: "suburbs",
          maxzoom: 12,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["coalesce", ["to-number", ["get", "Count"]], 0],
              0, 0,
              20, 0.2,
              100, 0.5,
              500, 0.8,
              2000, 1,
            ],
            "heatmap-opacity": 0.5,
            "heatmap-radius": 20,
            "heatmap-intensity": 0.7,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,   "rgba(0, 0, 255, 0)",
              0.1, "#c9e7ff",
              0.3, "#77c0ff",
              0.5, "#2b9cff",
              0.7, "#006ce1",
              1,   "#004599",
            ],
          },
        },
        "installs-circle"
      );

      // suburbs circles (for points view)
      map.addLayer(
        {
          id: "suburbs-circle",
          type: "circle",
          source: "suburbs",
          minzoom: 4,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["to-number", ["get", "Count"]], 0],
              0, 2,
              50, 3,
              200, 4,
              1000, 6,
            ],
            "circle-color": "#77c0ff",
            "circle-stroke-width": 0.6,
            "circle-stroke-color": "#0b1f3b",
            "circle-opacity": 0.9,
          },
        },
        "suburbs-heat"
      );

      setMapReady(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, [isAuthed, suburbsGeoJson]);

  // update installs source when filters change
  useEffect(() => {
    if (!isAuthed) return;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("installs");
    if (source && typeof source.setData === "function") {
      source.setData(installsGeoJson);
    }
  }, [installsGeoJson, mapReady, isAuthed]);

  // layer visibility + display modes
  useEffect(() => {
    if (!isAuthed) return;
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // installs
    const installsHeatVisibility =
      showInstalls &&
      (installsDisplay === "heat" || installsDisplay === "both")
        ? "visible"
        : "none";

    const installsCircleVisibility =
      showInstalls &&
      (installsDisplay === "points" || installsDisplay === "both")
        ? "visible"
        : "none";

    if (map.getLayer("installs-heat")) {
      map.setLayoutProperty("installs-heat", "visibility", installsHeatVisibility);
    }
    if (map.getLayer("installs-circle")) {
      map.setLayoutProperty(
        "installs-circle",
        "visibility",
        installsCircleVisibility
      );
    }

    // leads
    const leadsHeatVisibility =
      showLeads &&
      (leadsDisplay === "heat" || leadsDisplay === "both")
        ? "visible"
        : "none";

    const leadsCircleVisibility =
      showLeads &&
      (leadsDisplay === "points" || leadsDisplay === "both")
        ? "visible"
        : "none";

    if (map.getLayer("suburbs-heat")) {
      map.setLayoutProperty("suburbs-heat", "visibility", leadsHeatVisibility);
    }
    if (map.getLayer("suburbs-circle")) {
      map.setLayoutProperty("suburbs-circle", "visibility", leadsCircleVisibility);
    }
  }, [
    showInstalls,
    showLeads,
    installsDisplay,
    leadsDisplay,
    mapReady,
    isAuthed,
  ]);

  // ---------- UI helpers ----------

  const clearFilters = () => {
    setSelectedSaleTypes([]);
    setMinKw("");
    setMaxKw("");
    setMinKwh("");
    setMaxKwh("");
    setMinSubEx("");
    setMaxSubEx("");
    setMinSubInc("");
    setMaxSubInc("");
    setMinNetEx("");
    setMaxNetEx("");
    setMinNetInc("");
    setMaxNetInc("");
    setStartDate("");
    setEndDate("");
  };

  const handleSaleTypesChange = (e) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedSaleTypes(values);
  };

  // ---------- password gate render ----------

  if (!isAuthed) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#e5e7eb",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <form
          onSubmit={handleLoginSubmit}
          style={{
            background: "#0b1120",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #1f2937",
            width: 320,
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          <h2 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Think Heatmap</h2>
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#9ca3af" }}>
            This map is restricted. Please enter the access password.
          </p>

          <label
            htmlFor="password"
            style={{ display: "block", fontSize: 13, marginBottom: 6 }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #374151",
              background: "#020617",
              color: "#e5e7eb",
              marginBottom: 10,
            }}
          />
          {loginError && (
            <p style={{ color: "#f97373", fontSize: 12, marginTop: 0 }}>
              {loginError}
            </p>
          )}

          <button
            type="submit"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "none",
              background: "#22c55e",
              color: "#022c22",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  // ---------- main map render ----------

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* map */}
      <div
        ref={mapContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />

      {/* sidebar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 340,
          height: "100%",
          background: "rgba(20,20,20,0.95)",
          color: "#f5f5f5",
          padding: 18,
          boxSizing: "border-box",
          zIndex: 1,
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Install Heat Map</h2>
        <p style={{ fontSize: 13, color: "#bbb", marginBottom: 12 }}>
          Filter by sale type, system size, storage, totals and install date.
        </p>

        {/* layer toggles + modes */}
        <h4 style={{ margin: "0 0 4px 0" }}>Layers</h4>

        {/* Installs */}
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showInstalls}
              onChange={(e) => setShowInstalls(e.target.checked)}
            />
            <span>Installs</span>
          </label>
          <div style={{ marginLeft: 20, marginTop: 4 }}>
            <select
              value={installsDisplay}
              onChange={(e) => setInstallsDisplay(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="heat">Heat only</option>
              <option value="points">Points only</option>
              <option value="both">Heat + points</option>
            </select>
          </div>
        </div>

        {/* Leads */}
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showLeads}
              onChange={(e) => setShowLeads(e.target.checked)}
            />
            <span>Leads</span>
          </label>
          <div style={{ marginLeft: 20, marginTop: 4 }}>
            <select
              value={leadsDisplay}
              onChange={(e) => setLeadsDisplay(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="heat">Heat only</option>
              <option value="points">Points only</option>
              <option value="both">Heat + points</option>
            </select>
          </div>
        </div>

        {/* Sale Type – multi-select */}
        <label style={{ display: "block", marginTop: 8 }}>Sale Type</label>
        <select
          multiple
          value={selectedSaleTypes}
          onChange={handleSaleTypesChange}
          size={Math.min(6, saleTypes.length || 4)}
          style={{ width: "100%", marginBottom: 4 }}
        >
          {saleTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: "#bbb", marginTop: 0 }}>
          Hold Cmd/Ctrl to select multiple types. Clear all to show all.
        </p>

        {/* System Size (kW) */}
        <label style={{ display: "block", marginTop: 10 }}>
          Total System Size (kW)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minKw}
            onChange={(e) => setMinKw(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxKw}
            onChange={(e) => setMaxKw(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Storage (kWh) */}
        <label style={{ display: "block", marginTop: 10 }}>
          Total Storage (kWh)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minKwh}
            onChange={(e) => setMinKwh(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxKwh}
            onChange={(e) => setMaxKwh(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Subtotal ex GST */}
        <label style={{ display: "block", marginTop: 10 }}>
          Subtotal (Excluding GST)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minSubEx}
            onChange={(e) => setMinSubEx(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxSubEx}
            onChange={(e) => setMaxSubEx(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Subtotal inc GST */}
        <label style={{ display: "block", marginTop: 10 }}>
          Subtotal (inc GST)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minSubInc}
            onChange={(e) => setMinSubInc(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxSubInc}
            onChange={(e) => setMaxSubInc(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Net Total ex GST */}
        <label style={{ display: "block", marginTop: 10 }}>
          Net Total (Excluding GST)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minNetEx}
            onChange={(e) => setMinNetEx(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxNetEx}
            onChange={(e) => setMaxNetEx(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Net Total inc GST */}
        <label style={{ display: "block", marginTop: 10 }}>
          Net Total (inc GST)
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            placeholder="Min"
            value={minNetInc}
            onChange={(e) => setMinNetInc(e.target.value)}
            style={{ width: "50%" }}
          />
          <input
            type="number"
            placeholder="Max"
            value={maxNetInc}
            onChange={(e) => setMaxNetInc(e.target.value)}
            style={{ width: "50%" }}
          />
        </div>

        {/* Install Date */}
        <label style={{ display: "block", marginTop: 10 }}>
          Install Date
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <p style={{ marginTop: 12, fontSize: 13, color: "#bbb" }}>
          <strong>{filteredInstalls.length}</strong> installs shown
        </p>

        <button
          style={{
            marginTop: 4,
            padding: "6px 10px",
            borderRadius: 4,
            border: "none",
            background: "#333",
            color: "#fff",
            cursor: "pointer",
          }}
          onClick={clearFilters}
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}