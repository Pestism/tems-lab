"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Dashboard as DashboardData } from "@/parser/extract";
import Overview from "./Overview";
import SignalCharts from "./SignalCharts";
import ThroughputPanel from "./ThroughputPanel";
import RadioParams from "./RadioParams";
import CarriersTab from "./CarriersTab";
import NeighborsTable from "./NeighborsTable";
import SessionsTable from "./SessionsTable";
import Downloads from "./Downloads";

const CoverageMap = dynamic(() => import("./CoverageMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-line" />,
});

type Tab = { id: string; label: string; hint?: string };

function Panel({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold">{tab.label}</h2>
      {tab.hint && <p className="mb-4 mt-1 text-xs text-muted">{tab.hint}</p>}
      <div className={tab.hint ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

export default function Dashboard({ d, onReset }: { d: DashboardData; onReset: () => void }) {
  const tabs = useMemo<Tab[]>(() => {
    const t: Tab[] = [{ id: "overview", label: "Overview" }];
    if (d.panels.includes("map"))
      t.push({ id: "map", label: "Coverage", hint: "RSRP coverage signal" });
    if (d.panels.includes("signal"))
      t.push({ id: "signal", label: "Signal", hint: "RSRP, RSRQ, SINR and RSSI in the serving cell, over the route (LTE and 5G NR)" });
    if (d.panels.includes("throughput"))
      t.push({ id: "throughput", label: "Throughput", hint: "4G / 5G downlink throughput" });
    if (d.panels.includes("radio"))
      t.push({ id: "radio", label: "Radio params", hint: "Radio parameters observed during the test, including LTE and 5G configuration details" });
    if (d.panels.includes("carriers"))
      t.push({ id: "carriers", label: "Carriers", hint: "LTE carrier aggregation: per-component-carrier band, bandwidth and throughput" });
    if (d.panels.includes("neighbors"))
      t.push({ id: "neighbors", label: "Neighbours", hint: "Neighbour cells (by PCI + frequency) measured during the walk, with their RSRP/RSRQ" });
    if (d.panels.includes("sessions"))
      t.push({ id: "sessions", label: "Sessions", hint: "HTTP download loop recorded during the walk" });
    return t;
  }, [d.panels]);

  const [active, setActive] = useState<string>(() => {
    try {
      return localStorage.getItem("tems:tab") || "overview";
    } catch {
      return "overview";
    }
  });
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const choose = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem("tems:tab", id);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted">Analysing</div>
          <div className="truncate font-semibold">{d.file}</div>
        </div>
        <div className="flex items-center gap-3">
          <Downloads d={d} />
          <button onClick={onReset} className="btn-secondary text-sm">
            New file
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => choose(t.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm ${
              active === t.id ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.id === "overview" && (
        <Panel tab={tab}>
          <Overview d={d} />
        </Panel>
      )}
      {tab.id === "map" && (
        <Panel tab={tab}>
          <CoverageMap d={d} />
        </Panel>
      )}
      {tab.id === "signal" && (
        <Panel tab={tab}>
          <SignalCharts d={d} />
        </Panel>
      )}
      {tab.id === "throughput" && (
        <Panel tab={tab}>
          <ThroughputPanel d={d} />
        </Panel>
      )}
      {tab.id === "radio" && (
        <Panel tab={tab}>
          <RadioParams d={d} />
        </Panel>
      )}
      {tab.id === "carriers" && (
        <Panel tab={tab}>
          <CarriersTab d={d} />
        </Panel>
      )}
      {tab.id === "neighbors" && (
        <Panel tab={tab}>
          <NeighborsTable d={d} />
        </Panel>
      )}
      {tab.id === "sessions" && (
        <Panel tab={tab}>
          <SessionsTable d={d} />
        </Panel>
      )}
    </div>
  );
}
