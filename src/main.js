const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, clipboard, nativeImage, shell } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const Registry = require('winreg');


const chokidar = require('chokidar');

const documentsPath = app.getPath('documents');
const Downloads = app.getPath('downloads')
const GIFS_FOLDER = path.join(documentsPath, 'GIFfer', 'gifs');
const TAGS_FILE = path.join(documentsPath, 'GIFfer', 'tags.json');

const addGifToTags = async (filename) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.gif') return;

    if (!tagsData[filename]) {
        tagsData[filename] = [];
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
      }
    };

const removeGifFromTags = async (filename) => {
    if (tagsData[filename]) {
        delete tagsData[filename];
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
      }
    };

let mainWindow = null;
let tagsData = {};
if (fs.existsSync(TAGS_FILE)) {
    tagsData = fs.readJsonSync(TAGS_FILE);
  } else {
    fs.writeJsonSync(TAGS_FILE, tagsData, { spaces: 2 });
  }
let tray = null; 

function ensureDirectories() {
    try {
        fs.ensureDirSync(path.join(documentsPath, 'GIFfer'));
        fs.ensureDirSync(GIFS_FOLDER);
        if (!fs.existsSync(TAGS_FILE)) {
            fs.writeJsonSync(TAGS_FILE, {}, { spaces: 2 });
        }

    } catch (error) {}
}

const ensurePermissions = async () => {
    try {
        await fs.ensureDir(GIFS_FOLDER);
        await fs.chmod(GIFS_FOLDER, 0o777);
 
        if (fs.existsSync(TAGS_FILE)) {
            await fs.chmod(TAGS_FILE, 0o666);
        }

        const tempDir = path.join(os.tmpdir(), 'giffer');
        await fs.ensureDir(tempDir);
        await fs.chmod(tempDir, 0o777);
    } catch (error) {}
};

const ensureTempAccess = async () => {
    try {
        const tempDir = path.join(os.tmpdir(), 'giffer');
        
        if (fs.existsSync(tempDir)) {
            await fs.remove(tempDir);
        }
        
        await fs.ensureDir(tempDir, { mode: 0o777 });
        await fs.chmod(tempDir, 0o777);

    } catch (error) {}
};

function createTray() {
    try {
        let iconPath;
        
        if (app.isPackaged) {
            iconPath = path.join(app.getPath('exe'), '..', 'resources', 'build', 'icon.ico');
        } else {
            iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
        }
        
        if (!fs.existsSync(iconPath)) {
            const alternateLocations = [
                path.join(process.resourcesPath, 'build', 'icon.ico'),
                path.join(app.getAppPath(), 'build', 'icon.ico'),
                path.join(__dirname, 'build', 'icon.ico'),
                path.join(process.resourcesPath, 'icon.ico')
            ];

            for (const altPath of alternateLocations) {
                if (fs.existsSync(altPath)) {
                    iconPath = altPath;
                    break;
                }
            }
        }

        if (!fs.existsSync(iconPath)) {
            return;
        }

        tray = new Tray(iconPath);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open GIFfer',
                click: () => {
                    if (mainWindow === null) {
                        createWindow();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            {
                label: 'Open GIFs Folder',
                click: () => {
                    require('electron').shell.openPath(GIFS_FOLDER);
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('GIFfer');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            if (mainWindow === null) {
                createWindow();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });

    } catch (error) {}
}

app.whenReady().then(async () => {
    createTray();
});

function cleanupTempFiles() {
    try {
        const tempDir = path.join(os.tmpdir(), 'giffer');
        if (fs.existsSync(tempDir)) {
            fs.emptyDirSync(tempDir);
        }
    } catch (error) {}
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'GIFfer',
        autoHideMenuBar: true,  
        frame: true           
    });

    mainWindow.on('minimize', (event) => {
      event.preventDefault();
      mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
    }
    return false;
});

    const indexPath = path.join(__dirname, '..', 'index.html');
    
    mainWindow.loadFile(indexPath).catch(error => {
    });

    mainWindow.webContents.on('did-fail-load', (_, code, description) => {
    });

    mainWindow.webContents.on('dom-ready', () => {
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function initializeTagsData() {
    try {
        if (fs.existsSync(TAGS_FILE)) {
            tagsData = await fs.readJson(TAGS_FILE);
        } else {
            tagsData = {};
            await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
        }
    } catch (error) {}
}

    const initializeTags = async () => {
        const files = await fs.readdir(GIFS_FOLDER);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (ext === '.gif' && !tagsData[file]) {
            tagsData[file] = [];
          }
        }
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
      };
      
      initializeTags().then(() => {});

      function setupWatcher() {
        const watcher = chokidar.watch(GIFS_FOLDER, {
          ignored: /(^|[\/\\])\../,
          persistent: true,
          ignoreInitial: true,
          depth: 0,
          awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
        });
      
        watcher.on('add', async (filepath) => {
          try {
            const filename = path.basename(filepath);
            if (path.extname(filename).toLowerCase() === '.gif') {
              addGifToTags(filename);
              mainWindow.webContents.send('refresh-gallery'); 
            }
          } catch (error) {}
        });
      
        watcher.on('change', async (filepath) => {
          try {
            const filename = path.basename(filepath);
            if (path.extname(filename).toLowerCase() === '.gif') {
              addGifToTags(filename);
              mainWindow.webContents.send('refresh-gallery'); 
            }
          } catch (error) {}
        });
      
        return watcher;
      }

      function setupDownloadsWatcher() {
        const downloadsPath = app.getPath('downloads');
        const watcher = chokidar.watch(downloadsPath, {
          ignored: /(^|[\/\\])\../, 
          persistent: true, 
          awaitWriteFinish: true, 
        });
      
        watcher.on('add', async (filepath) => {
          try {
            const filename = path.basename(filepath);
            if (path.extname(filename).toLowerCase() === '.gif') {
              const destination = path.join(GIFS_FOLDER, filename);

              setTimeout(async () => {
                try {
                  await fs.move(filepath, destination, { overwrite: true });
                  addGifToTags(filename); 
                } catch (moveError) {
                }
              }, 1000); 
            }
          } catch (error) {}
        });
      
        return watcher;
      }

ipcMain.handle('get-tags', async () => {
    return tagsData;
});

ipcMain.handle('delete-gif', async (_, filename) => {
    try {
        const filePath = path.join(GIFS_FOLDER, filename);
        await fs.unlink(filePath);
        delete tagsData[filename];
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
        return { success: true };
    } catch (error) {}
});

ipcMain.handle('update-tags', async (_, data) => {
    try {
        tagsData[data.filename] = data.tags;
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
        return { success: true };
    } catch (error) {}
});

ipcMain.handle('get-gif-path', (_, filename) => {
    return path.join(GIFS_FOLDER, filename);
});

ipcMain.handle('open-gifs-folder', async () => {
    try {
        await require('electron').shell.openPath(GIFS_FOLDER);
        return { success: true };
    } catch (error) {}
});

ipcMain.handle('copyToClipboard', async (_, filename) => {
    try {
        const sourcePath = path.join(GIFS_FOLDER, filename);
        const tempDir = path.join(os.tmpdir(), 'giffer');
        
        await ensureTempAccess();
        
        const tempPath = path.join(tempDir, filename);
        await fs.copy(sourcePath, tempPath);

        const { exec } = require('child_process');
        const powershellCommand = `powershell -command "Set-Clipboard -Path '${tempPath}'"`;

        return new Promise((resolve) => {
            exec(powershellCommand, (error) => {
                if (error) {}
            });
        });
    } catch (error) {}
});

ipcMain.handle('refresh-gallery', async () => { 
    await fetchAndDisplayGIFs();
    return true; 
});

function handleArguments() {
    const args = process.argv;
    if (args.length >= 2) {
        const filePath = args[1];
        if (path.extname(filePath).toLowerCase() === '.gif') {
            const filename = path.basename(filePath);
            const destination = path.join(GIFS_FOLDER, filename);
            fs.copyFileSync(filePath, destination);
        }
    }
}

function handleArguments() {
    const filePath = process.argv[1];
    if (filePath && path.extname(filePath).toLowerCase() === '.gif') {
        const filename = path.basename(filePath);
        const destination = path.join(GIFS_FOLDER, filename);
        fs.copyFileSync(filePath, destination);
    }
}



app.whenReady().then(async () => {
    ensureDirectories();
    await ensurePermissions();
    await initializeTagsData();
    await ensureTempAccess();
    const watcher = setupWatcher();
    const downloadsWatcher = setupDownloadsWatcher();
    createWindow();
    createTray();
    handleArguments();

    setTimeout(() => {
        createTray();
    }, 1000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('second-instance', (event, commandLine, workingDirectory) => {
        const fileToAdd = commandLine[1];
        if (fileToAdd && fileToAdd.toLowerCase().endsWith('.gif')) {
            handleGifAdd(fileToAdd);
        }
    });

    const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {

    const fileToAdd = process.argv[1];
    if (fileToAdd && fileToAdd.toLowerCase().endsWith('.gif')) {
        addingFile = true;
        handleGifAdd(fileToAdd);
    }
}

    app.on('will-quit', () => {
        cleanupTempFiles();
    });

    if (tray) {
        tray.destroy();
    }
    if (global.tray) {
        global.tray = null;
    }
    cleanupTempFiles();
});

    app.on('before-quit', () => {
      app.isQuitting = true;
      
      app.on('before-quit', () => {
        if (tray) {
            tray.destroy();
            tray = null;
        }
    })});

    app.on('window-all-closed', () => {
        watcher.close();
        cleanupTempFiles();
        if (process.platform !== 'darwin') {
            app.quit();
    }
});

process.on('uncaughtException', (error) => {
});

process.on('unhandledRejection', (error) => {
});
