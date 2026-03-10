"use client";

import mqtt, { MqttClient } from "mqtt";

let client: MqttClient | null = null;
let isConnecting = false;

// Tracks all currently-subscribed topics so they can be re-issued after reconnect.
const subscribedTopics = new Set<string>();

// Callbacks waiting for the client to be ready.
type ConnectResolver = (c: MqttClient) => void;
const connectWaiters: ConnectResolver[] = [];

/** Resolves as soon as the MQTT client is connected. */
export function whenConnected(): Promise<MqttClient> {
  if (client?.connected) return Promise.resolve(client);
  return new Promise<MqttClient>((resolve) => {
    connectWaiters.push(resolve);
    // Kick off the connection if nobody else has.
    if (!isConnecting && !client) {
      isConnecting = true;
      connectWithFallback();
    }
  });
}

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

/**
 * Wrapper around client.subscribe that also registers the topic so it can be
 * automatically re-subscribed after a broker-initiated reconnect.
 */
export function trackedSubscribe(
  topic: string,
  options?: { qos?: 0 | 1 | 2 }
): void {
  subscribedTopics.add(topic);
  client?.subscribe(topic, { qos: options?.qos ?? 1 });
}

/**
 * Wrapper around client.unsubscribe that also removes the topic from the
 * tracked set so it won't be re-subscribed after reconnect.
 */
export function trackedUnsubscribe(topic: string): void {
  subscribedTopics.delete(topic);
  client?.unsubscribe(topic);
}

function resubscribeAll(): void {
  if (!client?.connected || subscribedTopics.size === 0) return;
  console.log(`[MQTT] Re-subscribing to ${subscribedTopics.size} topic(s) after reconnect`);
  subscribedTopics.forEach((topic) => {
    client!.subscribe(topic, { qos: 1 });
  });
}

function connectWithFallback() {
  if (currentUrlIndex >= MQTT_URLS.length) {
    console.error("All MQTT connection attempts failed. Tried URLs:", MQTT_URLS);
    isConnecting = false;
    currentUrlIndex = 0; // Reset for retry
    // Retry from the top after a short back-off so that any pending
    // whenConnected() promises (connectWaiters) eventually get resolved
    // instead of being silently abandoned forever.
    setTimeout(() => {
      if (!client && connectWaiters.length > 0) {
        isConnecting = true;
        connectWithFallback();
      }
    }, 5000);
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
      // Drain any waiters that called whenConnected() before the socket was ready.
      while (connectWaiters.length > 0) {
        connectWaiters.shift()!(client!);
      }
      // Topic subscriptions are managed per-device by the HomeScreen component.
      // No hardcoded subscriptions here.
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

    // After the library re-establishes the session, re-subscribe to all tracked topics.
    // The "connect" event fires on every successful (re)connect.
    client.on("connect", () => {
      resubscribeAll();
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
    subscribedTopics.clear();
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
