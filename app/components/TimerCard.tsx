"use client";

import { useState } from "react";
import { getMQTTClient } from "../mqtt/client";

export default function TimerCard() {
  const client = getMQTTClient();

  const [delay, setDelay] = useState(10);

  const sendTimer = () => {
    if(!client) return;
    const payload = JSON.stringify({
      delay: delay,
      action: "OFF",
    });

    client.publish("extension/relay1/timer/set", payload);
  };

  return (
    <div className="p-4 border rounded-xl shadow-sm space-y-2">
      <h2 className="font-semibold text-lg">Timer</h2>

      <input
        type="number"
        value={delay}
        onChange={(e) => setDelay(Number(e.target.value))}
        className="border p-2 rounded-md"
      />

      <button
        onClick={sendTimer}
        className="px-4 py-2 bg-green-600 text-white rounded-md"
      >
        Set Timer
      </button>
    </div>
  );
}
