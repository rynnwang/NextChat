import { useEffect, useState } from "react";
import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { PasswordInput, showToast } from "./ui-lib";
import BotIcon from "../icons/bot.svg";
import clsx from "clsx";

type GateState =
  | { kind: "loading" }
  | { kind: "needs-setup" }
  | { kind: "needs-login" }
  | { kind: "authenticated" }
  // Only shown when the app isn't running on Cloudflare Workers at all (no
  // AUTH_KV binding), so the gate can't function - fail open with a notice
  // rather than lock the operator out of their own deployment.
  | { kind: "unavailable" };

async function fetchSessionState(): Promise<GateState> {
  try {
    const res = await fetch("/api/session");
    if (!res.ok) return { kind: "unavailable" };
    const data = (await res.json()) as {
      configured: boolean;
      authenticated: boolean;
    };
    if (!data.configured) return { kind: "needs-setup" };
    if (!data.authenticated) return { kind: "needs-login" };
    return { kind: "authenticated" };
  } catch {
    return { kind: "unavailable" };
  }
}

export function SiteAuthGate(props: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    fetchSessionState().then(setState);
  }, []);

  if (state.kind === "loading") {
    return null;
  }

  if (state.kind === "authenticated" || state.kind === "unavailable") {
    return <>{props.children}</>;
  }

  return (
    <SiteAuthForm
      mode={state.kind === "needs-setup" ? "setup" : "login"}
      onSuccess={() => setState({ kind: "authenticated" })}
    />
  );
}

function SiteAuthForm(props: {
  mode: "setup" | "login";
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const isSetup = props.mode === "setup";

  async function submit() {
    if (isSetup && password !== confirm) {
      showToast("Passwords do not match");
      return;
    }
    if (isSetup && password.length < 8) {
      showToast("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(isSetup ? "/api/setup" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast(data.msg ?? "failed");
        return;
      }
      props.onSuccess();
    } catch {
      showToast("network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles["auth-page"]}>
      <div className={clsx("no-dark", styles["auth-logo"])}>
        <BotIcon />
      </div>

      <div className={styles["auth-title"]}>
        {isSetup ? "Set up this deployment" : "Log in"}
      </div>
      <div className={styles["auth-tips"]}>
        {isSetup
          ? "Choose a password for this NextChat instance. This can only be set once - write it down."
          : "Enter the password for this NextChat instance."}
      </div>

      <PasswordInput
        style={{ marginTop: "3vh", marginBottom: isSetup ? "1vh" : "3vh" }}
        aria-label="password"
        value={password}
        placeholder="Password"
        onChange={(e) => setPassword(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isSetup) submit();
        }}
      />

      {isSetup && (
        <PasswordInput
          style={{ marginBottom: "3vh" }}
          aria-label="confirm password"
          value={confirm}
          placeholder="Confirm password"
          onChange={(e) => setConfirm(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      )}

      <div className={styles["auth-actions"]}>
        <IconButton
          text={busy ? "Please wait..." : isSetup ? "Set password" : "Log in"}
          type="primary"
          disabled={busy}
          onClick={submit}
        />
      </div>
    </div>
  );
}
