/** True when a failure message is about the database or its account configuration. */
export function databaseOutage(message: string) {
  return /database|AUTH_SECRET|APP_URL|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|password authentication|certificate/i.test(
    message,
  );
}

export function missingTemplate(message: string) {
  return /ENOENT|monthly-service-report|\.xlsm|\/templates\//i.test(message);
}
