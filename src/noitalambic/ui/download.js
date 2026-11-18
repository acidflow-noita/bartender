// Saves a Blob as a file through a temporary <a download> link.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can abort the download in some browsers (Safari): let it start first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
