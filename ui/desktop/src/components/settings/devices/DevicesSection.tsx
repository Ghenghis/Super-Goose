import { useState, useEffect, useCallback } from 'react';
import { Wifi, Plus, Trash2, RefreshCw, Cpu, Printer, Smartphone, Server, Terminal, Power, Thermometer, Home, AlertTriangle } from 'lucide-react';

const CONSCIOUS_API = 'http://localhost:8999';

interface DeviceInfo {
  ip: string;
  mac: string;
  hostname: string;
  device_type: string;
  model: string;
  status: string;
  open_ports: number[];
  services: Record<string, unknown>;
  nickname: string;
  last_seen: number;
  custom_fields: Record<string, string>;
}

interface DeviceStatus {
  creator_mode: boolean;
  total_devices: number;
  by_type: Record<string, number>;
  devices: DeviceInfo[];
}

const DEVICE_ICONS: Record<string, typeof Cpu> = {
  raspberry_pi: Cpu,
  '3d_printer': Printer,
  android: Smartphone,
  sbc: Server,
  custom: Terminal,
  unknown: Wifi,
};

export default function DevicesSection() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDevice, setNewDevice] = useState({ ip: '', nickname: '', device_type: 'custom', model: '' });
  const [printerCommand, setPrinterCommand] = useState({ ip: '', gcode: '' });
  const [sshCommand, setSshCommand] = useState({ ip: '', command: '', user: 'pi' });
  const [commandOutput, setCommandOutput] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/devices/status`);
      if (res.ok) {
        setStatus(await res.json());
        setError('');
      }
    } catch {
      setError('Cannot reach Conscious API');
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const toggleCreatorMode = async () => {
    const enabled = !(status?.creator_mode);
    await fetch(`${CONSCIOUS_API}/api/devices/creator-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    fetchStatus();
  };

  const scanNetwork = async () => {
    setIsScanning(true);
    try {
      const res = await fetch(`${CONSCIOUS_API}/api/devices/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch {
      setError('Scan failed');
    }
    setIsScanning(false);
  };

  const addDevice = async () => {
    if (!newDevice.ip || !newDevice.nickname) return;
    await fetch(`${CONSCIOUS_API}/api/devices/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDevice),
    });
    setNewDevice({ ip: '', nickname: '', device_type: 'custom', model: '' });
    setShowAddForm(false);
    fetchStatus();
  };

  const removeDevice = async (key: string) => {
    await fetch(`${CONSCIOUS_API}/api/devices/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    fetchStatus();
  };

  const sendPrinterAction = async (ip: string, action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(`${CONSCIOUS_API}/api/devices/printer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, action, ...extra }),
    });
    if (res.ok) {
      const data = await res.json();
      setCommandOutput(JSON.stringify(data.result, null, 2));
    }
  };

  const sendSSH = async () => {
    if (!sshCommand.ip || !sshCommand.command) return;
    const res = await fetch(`${CONSCIOUS_API}/api/devices/ssh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sshCommand),
    });
    if (res.ok) {
      const data = await res.json();
      setCommandOutput(data.output || 'No output');
    }
  };

  const DeviceIcon = ({ type }: { type: string }) => {
    const Icon = DEVICE_ICONS[type] || Wifi;
    return <Icon className="h-5 w-5" />;
  };

  return (
    <div className="space-y-6">
      {/* Creator Mode Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-primary border border-border-subtle">
        <div>
          <h3 className="text-lg font-medium">Creator Mode</h3>
          <p className="text-sm text-text-subtlest">
            Unlock device scanning, 3D printer control, RPi/SBC management
          </p>
        </div>
        <button
          onClick={toggleCreatorMode}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            status?.creator_mode
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-surface-secondary text-text-default hover:bg-surface-tertiary'
          }`}
        >
          {status?.creator_mode ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {!status?.creator_mode && (
        <div className="p-8 text-center text-text-subtlest">
          Enable Creator Mode to access device management features.
        </div>
      )}

      {status?.creator_mode && (
        <>
          {/* Scan + Add Actions */}
          <div className="flex gap-3">
            <button
              onClick={scanNetwork}
              disabled={isScanning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Scan Network'}
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-secondary hover:bg-surface-tertiary"
            >
              <Plus className="h-4 w-4" />
              Add Custom Device
            </button>
          </div>

          {/* Add Device Form */}
          {showAddForm && (
            <div className="p-4 rounded-lg border border-border-subtle space-y-3">
              <h4 className="font-medium">Add Custom Device</h4>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="IP Address"
                  value={newDevice.ip}
                  onChange={(e) => setNewDevice({ ...newDevice, ip: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-subtle"
                />
                <input
                  placeholder="Nickname"
                  value={newDevice.nickname}
                  onChange={(e) => setNewDevice({ ...newDevice, nickname: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-subtle"
                />
                <select
                  value={newDevice.device_type}
                  onChange={(e) => setNewDevice({ ...newDevice, device_type: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-subtle"
                >
                  <option value="custom">Custom</option>
                  <option value="raspberry_pi">Raspberry Pi</option>
                  <option value="3d_printer">3D Printer</option>
                  <option value="android">Android</option>
                  <option value="sbc">SBC</option>
                </select>
                <input
                  placeholder="Model (optional)"
                  value={newDevice.model}
                  onChange={(e) => setNewDevice({ ...newDevice, model: e.target.value })}
                  className="px-3 py-2 rounded-lg bg-surface-secondary border border-border-subtle"
                />
              </div>
              <button
                onClick={addDevice}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
              >
                Add Device
              </button>
            </div>
          )}

          {/* Device Summary */}
          {status && status.total_devices > 0 && (
            <div className="flex gap-4 text-sm text-text-subtlest">
              <span>{status.total_devices} devices</span>
              {Object.entries(status.by_type).map(([type, count]) => (
                <span key={type} className="flex items-center gap-1">
                  <DeviceIcon type={type} />
                  {count} {type.replace('_', ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Device List */}
          <div className="space-y-3">
            {status?.devices.map((device) => (
              <div
                key={device.mac || device.ip}
                className="p-4 rounded-lg border border-border-subtle hover:border-border-default transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      device.status === 'online' ? 'bg-green-500/10 text-green-500' : 'bg-surface-secondary text-text-subtlest'
                    }`}>
                      <DeviceIcon type={device.device_type} />
                    </div>
                    <div>
                      <div className="font-medium">{device.nickname}</div>
                      <div className="text-sm text-text-subtlest">
                        {device.ip} {device.mac && `(${device.mac})`}
                      </div>
                      <div className="text-xs text-text-subtlest">
                        {device.model && <span className="mr-3">{device.model}</span>}
                        {device.open_ports.length > 0 && (
                          <span>Ports: {device.open_ports.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      device.status === 'online' ? 'bg-green-500/10 text-green-400' : 'bg-surface-secondary text-text-subtlest'
                    }`}>
                      {device.status}
                    </span>
                    <button
                      onClick={() => removeDevice(device.mac || device.ip)}
                      className="p-1 rounded hover:bg-red-500/10 text-text-subtlest hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 3D Printer Quick Actions */}
                {device.device_type === '3d_printer' && device.status === 'online' && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => sendPrinterAction(device.ip, 'info')}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary"
                      >
                        <Printer className="h-3 w-3" /> Info
                      </button>
                      <button
                        onClick={() => sendPrinterAction(device.ip, 'status')}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary"
                      >
                        <Thermometer className="h-3 w-3" /> Status
                      </button>
                      <button
                        onClick={() => sendPrinterAction(device.ip, 'home')}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary"
                      >
                        <Home className="h-3 w-3" /> Home All
                      </button>
                      <button
                        onClick={() => sendPrinterAction(device.ip, 'emergency_stop')}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400"
                      >
                        <AlertTriangle className="h-3 w-3" /> E-Stop
                      </button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <input
                        placeholder="G-code (e.g. G28, M104 S200)"
                        value={printerCommand.ip === device.ip ? printerCommand.gcode : ''}
                        onChange={(e) => setPrinterCommand({ ip: device.ip, gcode: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs rounded bg-surface-secondary border border-border-subtle"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && printerCommand.gcode) {
                            sendPrinterAction(device.ip, 'gcode', { gcode: printerCommand.gcode });
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (printerCommand.gcode) {
                            sendPrinterAction(device.ip, 'gcode', { gcode: printerCommand.gcode });
                          }
                        }}
                        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}

                {/* RPi/SBC SSH Actions */}
                {(device.device_type === 'raspberry_pi' || device.device_type === 'sbc') && device.status === 'online' && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <div className="flex gap-2">
                      <input
                        placeholder="SSH command"
                        value={sshCommand.ip === device.ip ? sshCommand.command : ''}
                        onChange={(e) => setSshCommand({ ...sshCommand, ip: device.ip, command: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs rounded bg-surface-secondary border border-border-subtle font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') sendSSH();
                        }}
                      />
                      <button
                        onClick={sendSSH}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Terminal className="h-3 w-3" /> Run
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {status?.devices.length === 0 && (
              <div className="p-8 text-center text-text-subtlest">
                No devices found. Click "Scan Network" to discover devices on your LAN.
              </div>
            )}
          </div>

          {/* Command Output */}
          {commandOutput && (
            <div className="p-3 rounded-lg bg-surface-secondary border border-border-subtle">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-text-subtlest">Output</span>
                <button
                  onClick={() => setCommandOutput('')}
                  className="text-xs text-text-subtlest hover:text-text-default"
                >
                  Clear
                </button>
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                {commandOutput}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
