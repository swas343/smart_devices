"use client";

import { useEffect, useState } from "react";
import { getMQTTClient } from "../mqtt/client";

const base = "smart_extension/device/extension01/";
const command = base + "command";

export default function RelayCard() {
  const client = getMQTTClient();
  const [relayState, setRelayState] = useState("OFF");

  useEffect(() => {
    if (!client) return;
    // Define message handler
    client.on("message", (topic, msg) => {
      if (topic === command) {
        setRelayState(msg.toString());
      }
    });
  }, []);

  const toggleRelay = () => {
    if (!client) return;

    const newState = relayState === "ON" ? "OFF" : "ON";
    client.publish(command, newState);
  };

  return (
    <div className="p-4 border rounded-xl shadow-sm space-y-2">
      <h2 className="font-semibold text-lg">Relay 1</h2>
      <p>
        Status: <b>{relayState}</b>
      </p>
      <button
        onClick={toggleRelay}
        className="px-4 py-2 bg-blue-600 text-white rounded-md"
      >
        Toggle
      </button>
    </div>
  );
}
