const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

async function printHtml({ html, printerName, silent = true }) {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      printWindow.webContents.print({ silent, deviceName: printerName }, (success, reason) => {
        resolve({ success, reason: reason || null });
        printWindow.close();
      });
    });
  } catch (error) {
    printWindow.close();
    return { success: false, reason: error instanceof Error ? error.message : "Print failed" };
  }
}

ipcMain.handle("printer:list", async () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return [];
  return window.webContents.getPrintersAsync();
});

ipcMain.handle("printer:test", async (_event, { printerName }) => printHtml({
  printerName,
  html: "<html><body style=\"font-family: sans-serif; padding: 24px;\"><h1>Motorcycle System</h1><p>Printer test successful.</p></body></html>",
}));

ipcMain.handle("printer:print", async (_event, request) => {
  if (!request || typeof request.html !== "string") {
    return { success: false, reason: "Printable HTML is required" };
  }
  return printHtml(request);
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.on("ready", createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
