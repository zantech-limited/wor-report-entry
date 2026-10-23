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
  error?: string;
  locked?: boolean;
};
