// Formats seconds into h:mm:ss or m:ss.
const formatDuration = (seconds?: number) => {
  if (!Number.isFinite(seconds) || seconds === undefined) {
    return "--";
  }

  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export default formatDuration;
