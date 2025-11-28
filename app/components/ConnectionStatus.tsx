"use client";

import { useEffect, useState } from "react";
import { getMQTTClient, getMQTTConnectionStatus, retryMQTTConnection } from "../mqtt/client";

export default function ConnectionStatus() {
  const [status, setStatus] = useState({
    isConnected: false,
    isConnecting: false,
    currentUrl: null as string | null,
    attemptedUrls: [] as string[]
  });
  const [eventCount, setEventCount] = useState(0);
  
  const client = getMQTTClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getMQTTConnectionStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!client) return;

    const messageHandler = () => {
      setEventCount(prev => prev + 1);
    };

    const connectHandler = () => {
      console.log("Connection established");
    };

    const errorHandler = (err: Error) => {
      console.error("MQTT Error:", err);
    };

    const disconnectHandler = () => {
      console.log("MQTT Disconnected");
    };

    client.on("message", messageHandler);
    client.on("connect", connectHandler);
    client.on("error", errorHandler);
    client.on("disconnect", disconnectHandler);

    return () => {
      client.off("message", messageHandler);
      client.off("connect", connectHandler);
      client.off("error", errorHandler);
      client.off("disconnect", disconnectHandler);
    };
  }, [client]);

  const getStatusColor = () => {
    if (status.isConnected) return "bg-green-500";
    if (status.isConnecting) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
        <span className="font-semibold">MQTT Connection</span>
      </div>
      
      <div className="text-sm space-y-1">
        <div>Status: {status.isConnected ? "Connected" : status.isConnecting ? "Connecting..." : "Disconnected"}</div>
        {status.currentUrl && <div>URL: {status.currentUrl}</div>}
        <div>Messages Received: {eventCount}</div>
        {status.attemptedUrls.length > 0 && (
          <div>Failed URLs: {status.attemptedUrls.length}</div>
        )}
        
        {!status.isConnected && !status.isConnecting && (
          <button
            onClick={() => retryMQTTConnection()}
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}