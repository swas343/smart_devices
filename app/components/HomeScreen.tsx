"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Text, Switch, Group, Button } from "@mantine/core";
import { SocketName, SocketState } from "../types";
import { getMQTTClient } from "../mqtt/client";
import { CONTROL_BASE, DEVICE_STATUS, STATUS_BASE } from "../constants";

const initialSockets: SocketState = {
  socket1: "off",
  socket2: "off",
  socket3: "off",
};

export default function HomeScreen() {
  const client = getMQTTClient();
  const [deviceStatus, setDeviceStatus] = useState("offline");
  const [socketStatus, setSocketStatus] = useState<SocketState>(initialSockets);
  const [deviceTimeout, setDeviceTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
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

    // Request fresh status
    const topic = DEVICE_STATUS + "get";
    client.publish(topic, "STATUS");
    addLog(`Sent → ${topic}: STATUS`);
  }, [client, addLog]);

  const getSocketStatuses = useCallback(() => {
    if (!client) return;
    // Request status for all sockets
    const sockets: SocketName[] = ["socket1", "socket2", "socket3"];
    sockets.forEach((socketName) => {
      // Request fresh status
      client.publish(`${STATUS_BASE}get/${socketName}`, "STATUS");
      addLog(`Sent → ${STATUS_BASE}get/${socketName}: STATUS`);
    });
  }, [client, addLog]);

  useEffect(() => {
    if (!client) return;

    const messageHandler = (topic: string, message: Buffer) => {
      const payload = message.toString();
      addLog(`Received → ${topic}: ${payload}`);

      // Listen for device status updates
      if (topic === DEVICE_STATUS) {
        setDeviceStatus(payload);

        // Clear any existing timeout
        if (deviceTimeout) {
          clearTimeout(deviceTimeout);
        }

        // Set device as offline if no heartbeat received within 30 seconds
        const timeout = setTimeout(() => {
          setDeviceStatus("offline");
          addLog("Device timeout - marked as offline");
        }, 30000);

        setDeviceTimeout(timeout);
      } else {
        // Listen for socket status updates on the status topics
        if (topic.startsWith(STATUS_BASE)) {
          const topicParts = topic.split("/");
          const sock = topicParts[topicParts.length - 1] as SocketName;

          if (
            sock &&
            (sock === "socket1" || sock === "socket2" || sock === "socket3")
          ) {
            const normalizedPayload = payload.toLowerCase().trim();
            // addLog(`Debug → Normalized payload: "${normalizedPayload}"`);

            if (normalizedPayload === "on" || normalizedPayload === "off") {
              setSocketStatus((prev) => ({
                ...prev,
                [sock]: normalizedPayload as "on" | "off",
              }));
              // Clear loading state when we receive a status update
              setSocketLoading((prev) => ({
                ...prev,
                [sock]: false,
              }));
            } else {
              addLog(
                `Warning → Invalid payload "${payload}" for socket ${sock}`
              );
            }
          } else {
            addLog(
              `Warning → Invalid socket name "${sock}" from topic ${topic}`
            );
          }
        }
      }
    };

    client.on("message", messageHandler);

    return () => {
      // Only remove this component's listener, don't close the shared connection
      client.off("message", messageHandler);
      if (deviceTimeout) {
        clearTimeout(deviceTimeout);
      }
    };
  }, [client, addLog, deviceTimeout]); // Include addLog in dependencies

  // Pre-populate status on component load
  useEffect(() => {
    if (!client) return;

    // Use a timeout to avoid the setState synchronously within effect warning
    setTimeout(() => {
      getDeviceStatus();
      getSocketStatuses();
    }, 0);
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
        <Button onClick={() => setLogs([])}>Clear logs</Button>
        <Button onClick={getDeviceStatus}>Get device status</Button>
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
