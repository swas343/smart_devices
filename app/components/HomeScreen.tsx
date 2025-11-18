"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Text, Switch, Group } from "@mantine/core";
import { SocketName, SocketState } from "../types";
import { getMQTTClient } from "../mqtt/client";
import { CONTROL_BASE, STATUS_BASE } from "../constants";

const initialSockets: SocketState = {
  socket1: "off",
  socket2: "off",
  socket3: "off",
};

export default function HomeScreen() {
  const client = getMQTTClient();
  const [deviceStatus, setDeviceStatus] = useState("offline");
  const [socketStatus, setSocketStatus] = useState<SocketState>(initialSockets);
  const [socketLoading, setSocketLoading] = useState<
    Record<SocketName, boolean>
  >({
    socket1: false,
    socket2: false,
    socket3: false,
  });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }, []);

  const getDeviceStatus = useCallback(() => {
    if (!client) return;
    client.publish("esp32/status/request", "STATUS");
    addLog("Sent → esp32/status/request: STATUS");
  }, [client, addLog]);

  const getSocketStatuses = useCallback(() => {
    if (!client) return;
    // Request status for all sockets
    const sockets: SocketName[] = ["socket1", "socket2", "socket3"];
    sockets.forEach((socketName) => {
      client.publish(`${STATUS_BASE}request/${socketName}`, "STATUS");
      addLog(`Sent → ${STATUS_BASE}request/${socketName}: STATUS`);
    });
  }, [client, addLog]);

  useEffect(() => {
    if (!client) return;

    client.on("message", (topic: string, message: Buffer) => {
      const payload = message.toString();
      addLog(`Received → ${topic}: ${payload}`);
      if (topic === "esp32/status") {
        setDeviceStatus(payload);
      }

      // Listen for socket status updates on the status topics
      if (topic.startsWith(STATUS_BASE)) {
        const sock = topic.split("/").pop() as SocketName;
        if (
          sock &&
          (sock === "socket1" || sock === "socket2" || sock === "socket3")
        ) {
          setSocketStatus((prev) => ({
            ...prev,
            [sock]: payload.toLowerCase() as "on" | "off",
          }));
          // Clear loading state when we receive a status update
          setSocketLoading((prev) => ({
            ...prev,
            [sock]: false,
          }));
        }
      }

      // Also listen for control confirmations (when ESP32 confirms a control command)
      if (topic.startsWith(CONTROL_BASE)) {
        const sock = topic.split("/").pop() as SocketName;
        if (
          sock &&
          (sock === "socket1" || sock === "socket2" || sock === "socket3")
        ) {
          setSocketStatus((prev) => ({
            ...prev,
            [sock]: payload.toLowerCase() as "on" | "off",
          }));
          // Clear loading state when we receive a status update
          setSocketLoading((prev) => ({
            ...prev,
            [sock]: false,
          }));
        }
      }
    });

    return () => {
      if (client) {
        client.end();
      }
    };
  }, [client, addLog]); // Include addLog in dependencies

  // Pre-populate status on component load
  useEffect(() => {
    if (!client) return;

    // Use a timeout to avoid the setState synchronously within effect warning
    const timeoutId = setTimeout(() => {
      getDeviceStatus();
      getSocketStatuses();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [client, getDeviceStatus, getSocketStatuses]);

  const toggleSocket = (socketName: SocketName, turnOn: boolean) => {
    if (!client) return;

    // Set loading state
    setSocketLoading((prev) => ({
      ...prev,
      [socketName]: true,
    }));

    const topic = `${CONTROL_BASE}${socketName}`;
    const cmd = turnOn ? "ON" : "OFF";

    client.publish(topic, cmd);
    addLog(`Sent → ${topic}: ${cmd}`);

    // Optimistically update the UI
    // setSocketStatus((prev) => ({
    //   ...prev,
    //   [socketName]: turnOn ? "on" : "off",
    // }));

    // Clear loading state after 3 seconds if no response
    setTimeout(() => {
      setSocketLoading((prev) => ({
        ...prev,
        [socketName]: false,
      }));
    }, 3000);
  };

  return (
    <div style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <h1>Smart Extension</h1>
      <Card withBorder padding="lg" shadow="sm">
        <Text size="lg">
          Device Status:{" "}
          <span style={{ color: deviceStatus === "online" ? "green" : "red" }}>
            {deviceStatus}
          </span>
        </Text>
      </Card>

      {Object.keys(socketStatus).map((sock) => {
        const socketName = sock as SocketName;
        return (
          <Card
            key={sock}
            withBorder
            padding="md"
            shadow="sm"
            style={{
              marginTop: 20,
              opacity: deviceStatus === "offline" ? 0.6 : 1,
              position: "relative",
            }}
          >
            <Text size="lg" fw={700}>
              {socketName.toUpperCase()}
            </Text>

            <Group
              justify="space-between"
              align="center"
              style={{ marginTop: 10 }}
            >
              <Text
                size="sm"
                c={socketStatus[socketName] === "on" ? "green" : "gray"}
              >
                Status:{" "}
                {socketLoading[socketName]
                  ? "Switching..."
                  : socketStatus[socketName].toUpperCase()}
              </Text>
              <Switch
                checked={socketStatus[socketName] === "on"}
                onChange={(event) =>
                  toggleSocket(socketName, event.currentTarget.checked)
                }
                label={socketStatus[socketName] === "on" ? "ON" : "OFF"}
                color="blue"
                size="md"
                disabled={
                  socketLoading[socketName] || deviceStatus === "offline"
                }
              />
            </Group>
          </Card>
        );
      })}

      {/* Logs Viewer */}
      <h3 style={{ marginTop: 30 }}>Logs</h3>
      <div
        style={{
          height: 200,
          overflowY: "scroll",
          background: "#f5f5f5",
          padding: 10,
          borderRadius: 8,
          fontFamily: "monospace",
        }}
      >
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
