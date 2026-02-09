/**
 * ConsciousBridge — WebSocket client that connects to Conscious UI Bridge (ws://localhost:8997).
 *
 * Receives commands from the Conscious voice agent to control the desktop UI:
 *   - set_theme: Switch between light/dark mode
 *   - set_model: Change AI model
 *   - toggle_voice: Enable/disable voice
 *   - toggle_agentic: Enable/disable agentic layer
 *   - toggle_emotion: Enable/disable emotion engine
 *   - switch_personality: Switch personality profile
 *   - refresh_status: Refresh all status displays
 *   - navigate: Navigate to a hash location
 *   - notify: Show a notification
 *   - set_volume: Adjust audio volume
 *   - toggle_sidebar: Show/hide sidebar
 *   - zoom_in / zoom_out: Adjust font size
 *   - show_notification: Display a notification message
 *
 * This is the Electron-side counterpart to conscious/agentic/ui_bridge.py.
 */

export type UICommand = {
  command: string;
  params: Record<string, unknown>;
};

type CommandHandler = (params: Record<string, unknown>) => void;

class ConsciousBridge {
  private ws: WebSocket | null = null;
  private handlers: Map<string, CommandHandler> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private connected = false;

  constructor(url = 'ws://localhost:8997') {
    this.url = url;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  on(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  off(command: string): void {
    this.handlers.delete(command);
  }
  send(command: string, params: Record<string, unknown> = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command, params }));
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const data: UICommand = JSON.parse(event.data);
          const handler = this.handlers.get(data.command);
          if (handler) {
            handler(data.params);
            this.ws?.send(JSON.stringify({ status: 'ok', command: data.command }));
          }
        } catch {
          /* Failed to parse message */
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}

export const consciousBridge = new ConsciousBridge();
export default consciousBridge;