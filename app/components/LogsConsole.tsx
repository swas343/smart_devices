"use client";

import { useEffect, useState } from "react";
import { getMQTTClient } from "../mqtt/client";

export default function LogsConsole() {
  const client = getMQTTClient();
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!client) return;
    client.on("message", (topic, msg) => {
      if (topic === "esp32/test/out") {
        setLogs((prev) => (prev.length > 5 ? [] : [...prev, msg.toString()]));
      }
    });
  }, []);

  return (
    <div className="p-4 border rounded-xl shadow-sm h-60 overflow-auto">
      <h2 className="font-semibold text-lg">Device Logs</h2>

      <div className="text-sm mt-2 space-y-1">
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
