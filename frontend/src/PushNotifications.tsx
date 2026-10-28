import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Modal, message } from "./components";
import { request } from "./api";
import {
  currentPush,
  defaultPushPreferences,
  disablePush,
  enablePush,
  savePush,
} from "./push";
import type { PushPreferences } from "./push";

export default function PushNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [prefs, setPrefs] = useState<PushPreferences>(defaultPushPreferences);
  useEffect(() => {
    void currentPush()
      .then(async (sub) => {
        if (!sub) return;
        const status = await request<{
          enabled: boolean;
          preferences: PushPreferences | null;
        }>(`/push/subscriptions/?endpoint=${encodeURIComponent(sub.endpoint)}`);
        setEnabled(Boolean(status.preferences));
        if (status.preferences) setPrefs(status.preferences);
      })
      .catch(() => {});
  }, []);
  async function enable() {
    setBusy(true);
    setNotice("");
    try {
      await enablePush(prefs);
      setEnabled(true);
      setNotice("Notifications enabled on this device.");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function update(next: PushPreferences) {
    setBusy(true);
    try {
      const sub = await currentPush();
      if (!sub) throw new Error("Enable notifications on this device first.");
      await savePush(sub, next);
      setPrefs(next);
      setNotice("Notification preferences saved.");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-notifications">
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => (enabled ? setOpen(true) : void enable())}
      >
        {enabled ? <BellRing size={16} /> : <Bell size={16} />}
        {busy
          ? "Please wait…"
          : enabled
            ? "Notifications enabled"
            : "Enable notifications"}
      </button>
      <span role="status">{notice}</span>
      {open && (
        <Modal
          title="Notifications on this device"
          close={() => setOpen(false)}
        >
          <p>
            Choose what reaches your lock screen. Message text stays private.
          </p>
          {(
            [
              ["messages", "Messages"],
              ["requests", "Message requests and group invitations"],
              ["follows", "New followers"],
              ["pins", "New posts from people you follow"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="push-preference"
              role="switch"
              aria-checked={prefs[key]}
              aria-disabled={busy}
              onClick={() => {
                if (!busy) void update({ ...prefs, [key]: !prefs[key] });
              }}
            >
              <span>{label}</span>
              <span aria-hidden="true">{prefs[key] ? "On" : "Off"}</span>
            </button>
          ))}
          <button
            className="text-link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await disablePush();
                setEnabled(false);
                setOpen(false);
                setNotice("Notifications disabled on this device.");
              } catch (error) {
                setNotice(message(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Disable on this device
          </button>
          <p role="status">{notice}</p>
        </Modal>
      )}
    </div>
  );
}
