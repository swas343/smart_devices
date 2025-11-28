"use client";

import mqtt, { MqttClient } from "mqtt";
import { CONTROL_BASE, STATUS_BASE } from "../constants";

let client: MqttClient | null = null;
let isConnecting = false;

// Safari-compatible connection URLs
const MQTT_URLS = [
  "wss://366796d2a3ee4bdc99cffee3d6420fa6.s1.eu.hivemq.cloud:8884/mqtt",
  // "ws://localhost:9002",
  // "ws://127.0.0.1:9002"
];

let currentUrlIndex = 0;

export function getMQTTClient() {
  if (!client && !isConnecting) {
    isConnecting = true;
    connectWithFallback();
  }
  return client;
}

function connectWithFallback() {
  if (currentUrlIndex >= MQTT_URLS.length) {
    console.error("All MQTT connection attempts failed. Tried URLs:", MQTT_URLS);
    isConnecting = false;
    currentUrlIndex = 0; // Reset for potential retry
    return;
  }

  const url = MQTT_URLS[currentUrlIndex];
  console.log(
    `Attempting MQTT connection to ${url} (attempt ${currentUrlIndex + 1}/${MQTT_URLS.length})`
  );

  try {
    // Safari-compatible connection options
    const options = {
      clientId: "nextjs-" + crypto.randomUUID(),
      reconnectPeriod: 5000,
      connectTimeout: 15000,
      keepalive: 60,
      clean: true,
      rejectUnauthorized: false,
      protocolVersion: 4 as const,
      username: 'hivemq.webclient.1763386015250',
      password: 'la7Dz6vZ3Rq%F:YU.;4n',
      will: {
        topic: 'device/status/client',
        payload: 'offline',
        retain: true
      }
    };

    client = mqtt.connect(url, options);

    const connectionTimeout = setTimeout(() => {
      console.log(`Connection timeout for ${url}, trying next...`);
      if (client) {
        client.end(true);
        client = null;
      }
      currentUrlIndex++;
      setTimeout(() => connectWithFallback(), 1000); // Add delay between attempts
    }, 15000);

    client.on("connect", () => {
      clearTimeout(connectionTimeout);
      console.log(`MQTT Connected successfully to ${url}`);
      isConnecting = false;
      // Don't reset currentUrlIndex - remember which URL worked

      // Subscribe to topics with QoS 1 for better reliability
      // client?.subscribe(`${CONTROL_BASE}#`, { qos: 1 });
      client?.subscribe(`${STATUS_BASE}#`, { qos: 1 });
      client?.subscribe("device/status/#", { qos: 1 });
      
      console.log("Subscribed to topics:", [`${STATUS_BASE}#`, "device/status/#"]);
    });

    client.on("error", (err) => {
      clearTimeout(connectionTimeout);
      console.error(`MQTT Error with ${url}:`, err.message || err);

      // Try next URL
      if (client) {
        client.end(true);
        client = null;
      }
      currentUrlIndex++;
      setTimeout(() => connectWithFallback(), 1000); // Add delay between attempts
    });

    client.on("disconnect", (packet) => {
      console.log("MQTT Disconnected", packet);
      isConnecting = false;
    });

    client.on("reconnect", () => {
      console.log("MQTT Reconnecting...");
    });

    client.on("offline", () => {
      console.log("MQTT Client went offline");
      isConnecting = false;
    });

    client.on("close", () => {
      console.log("MQTT Connection closed");
      isConnecting = false;
    });
  } catch (error) {
    console.error(`Failed to create MQTT client for ${url}:`, error);
    currentUrlIndex++;
    setTimeout(() => connectWithFallback(), 1000); // Add delay between attempts
  }
}

// Function to disconnect and cleanup
export function disconnectMQTT() {
  if (client) {
    client.end(true);
    client = null;
    isConnecting = false;
    currentUrlIndex = 0;
  }
}

// Function to retry connection manually
export function retryMQTTConnection() {
  console.log("Manual MQTT connection retry requested");
  disconnectMQTT();
  currentUrlIndex = 0;
  isConnecting = false;
  return getMQTTClient();
}

// Function to get connection status
export function getMQTTConnectionStatus() {
  return {
    isConnected: client?.connected || false,
    isConnecting,
    currentUrl: currentUrlIndex < MQTT_URLS.length ? MQTT_URLS[currentUrlIndex] : null,
    attemptedUrls: MQTT_URLS.slice(0, currentUrlIndex)
  };
}
