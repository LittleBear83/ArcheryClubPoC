type StatusMessagePanelProps = {
  error?: string;
  info?: string;
  loading?: boolean;
  loadingLabel?: string;
  success?: string;
};

export function StatusMessagePanel({
  error = "",
  info = "",
  loading = false,
  loadingLabel = "Loading...",
  success = "",
}: StatusMessagePanelProps) {
  return (
    <>
      {loading ? <p>{loadingLabel}</p> : null}
      {info ? <p>{info}</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {success ? <p className="profile-success">{success}</p> : null}
    </>
  );
}
