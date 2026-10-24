export type EnvStatus = "missing" | "set" | "too short" | "not https" | "invalid";

export type EnvCheck = {
  name: string;
  required: boolean;
  status: EnvStatus;
};

export type Presence = "set" | "missing" | "not used";

export type DiagnosticConnection = {
  source: "resolved" | "unavailable";
  engine: string;
  host: string;
  port: string;
  tls: string;
  username: Presence;
  database: Presence;
  password: Presence;
  databaseCode: Presence;
  certificate: Presence;
  configError?: string;
};

export type DiagnosticRuntime = {
  node: string;
  environment: string;
  commit: string;
  ref: string;
  region: string;
  version: string;
};

export type DiagnosticReport = {
  environment: EnvCheck[];
  connection: DiagnosticConnection;
  runtime: DiagnosticRuntime;
};

export type ProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error?: string;
};

export type DiagnosticsPayload = {
  configured: boolean;
  report?: DiagnosticReport;
  probe?: ProbeResult;
  debug?: DebugDesk;
  error?: string;
  locked?: boolean;
};

export type DebugMailResult = {
  kind: "customer" | "account";
  state: string;
  at: string;
  error?: string;
};

export type DebugDevice = {
  device: string;
  count: number;
  latest: string;
};

export type DebugEvent = {
  at: string;
  reference: string;
  kind: "error" | "review" | "upload";
  message: string;
};

export type DebugAccount = {
  status: "ready" | "not signed in" | "database unavailable";
  name?: string;
  role?: string;
  approval?: string;
};

export type DebugDesk = {
  version: string;
  commit: string;
  serviceWorker: string;
  template: "present" | "missing";
  database: ProbeResult;
  mail: {
    mode: string;
    host: string;
    from: string;
    password: string;
    recent: DebugMailResult[];
  };
  devices: DebugDevice[];
  devicesNote?: string;
  account: DebugAccount;
  events: DebugEvent[];
};
