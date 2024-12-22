const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, clipboard, nativeImage, shell } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const Registry = require('winreg');


const chokidar = require('chokidar');

const documentsPath = app.getPath('documents');
const GIFS_FOLDER = path.join(documentsPath, 'GIFfer', 'gifs');
const TAGS_FILE = path.join(documentsPath, 'GIFfer', 'tags.json');

let mainWindow = null;
let tagsData = {};
let tray = null; 

function ensureDirectories() {
    try {
        fs.ensureDirSync(path.join(documentsPath, 'GIFfer'));
        fs.ensureDirSync(GIFS_FOLDER);
        if (!fs.existsSync(TAGS_FILE)) {
            fs.writeJsonSync(TAGS_FILE, {}, { spaces: 2 });
        }
        console.log('Directories created:', GIFS_FOLDER);
        console.log('Tags file location:', TAGS_FILE);
    } catch (error) {
        console.error('Error creating directories:', error);
    }
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
        
        console.log('Permissions set successfully');
    } catch (error) {
        console.error('Permission setup error:', error);
    }
};


function createTray() {
    try {
        let iconPath;
        
        if (app.isPackaged) {
            iconPath = path.join(app.getPath('exe'), '..', 'resources', 'build', 'icon.ico');
            console.log('Production icon path:', iconPath);
            console.log('App path:', app.getPath('exe'));
            console.log('Resources path:', process.resourcesPath);
        } else {
            iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
            console.log('Development icon path:', iconPath);
        }

        console.log('Icon exists?', fs.existsSync(iconPath));
        
        if (!fs.existsSync(iconPath)) {
            const alternateLocations = [
                path.join(process.resourcesPath, 'build', 'icon.ico'),
                path.join(app.getAppPath(), 'build', 'icon.ico'),
                path.join(__dirname, 'build', 'icon.ico'),
                path.join(process.resourcesPath, 'icon.ico')
            ];

            for (const altPath of alternateLocations) {
                console.log('Checking alternate path:', altPath);
                console.log('Exists?', fs.existsSync(altPath));
                if (fs.existsSync(altPath)) {
                    iconPath = altPath;
                    console.log('Found icon at:', altPath);
                    break;
                }
            }
        }

        if (!fs.existsSync(iconPath)) {
            console.error('No icon file found!');
            return;
        }

        console.log('Creating tray with final icon path:', iconPath);

        tray = new Tray(iconPath);
        console.log('Tray created successfully');

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

        console.log('Tray setup completed');

    } catch (error) {
        console.error('Error creating tray:', error);
        console.error('Error stack:', error.stack);
    }
}

app.whenReady().then(async () => {

    console.log('App paths:');
    console.log('Exe path:', app.getPath('exe'));
    console.log('App path:', app.getAppPath());
    console.log('Resources path:', process.resourcesPath);
    console.log('Current directory:', process.cwd());
    console.log('GIFS_FOLDER path:', GIFS_FOLDER);
    
    await ensureDirectories();
    await ensurePermissions();
    await initializeTagsData();
    const watcher = setupWatcher();
    createWindow();
    createTray();
});

function cleanupTempFiles() {
    try {
        const tempDir = path.join(os.tmpdir(), 'giffer');
        if (fs.existsSync(tempDir)) {
            fs.emptyDirSync(tempDir);
            console.log('Cleaned up temp directory:', tempDir);
        }
    } catch (error) {
        console.error('Error cleaning up temp directory:', error);
    }
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

    mainWindow.webContents.openDevTools();


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
    console.log('Loading index.html from:', indexPath);
    
    mainWindow.loadFile(indexPath).catch(error => {
        console.error('Error loading index.html:', error);
    });

    mainWindow.webContents.on('did-fail-load', (_, code, description) => {
        console.error('Failed to load:', code, description);
    });

    mainWindow.webContents.on('dom-ready', () => {
        console.log('DOM ready');
    });

    // Open DevTools for debugging (uncomment if needed)
    // mainWindow.webContents.openDevTools();

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
    } catch (error) {
        console.error('Error initializing tags data:', error);
        tagsData = {};
    }
}

function setupWatcher() {
    const watcher = chokidar.watch(GIFS_FOLDER, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        awaitWriteFinish: true
    });

    watcher
        .on('add', async (filepath) => {
            const filename = path.basename(filepath);
            if (path.extname(filename).toLowerCase() === '.gif') {
                console.log('New GIF detected:', filename);
                if (!tagsData[filename]) {
                    tagsData[filename] = [];
                    await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
                    if (mainWindow) {
                        mainWindow.webContents.send('tags-updated', tagsData);
                    }
                }
            }
        })
        .on('unlink', async (filepath) => {
            const filename = path.basename(filepath);
            if (tagsData[filename]) {
                delete tagsData[filename];
                await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
                if (mainWindow) {
                    mainWindow.webContents.send('tags-updated', tagsData);
                }
            }
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
    } catch (error) {
        console.error('Error deleting file:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('update-tags', async (_, data) => {
    try {
        tagsData[data.filename] = data.tags;
        await fs.writeJson(TAGS_FILE, tagsData, { spaces: 2 });
        return { success: true };
    } catch (error) {
        console.error('Error updating tags:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-gif-path', (_, filename) => {
    return path.join(GIFS_FOLDER, filename);
});

ipcMain.handle('open-gifs-folder', async () => {
    try {
        await require('electron').shell.openPath(GIFS_FOLDER);
        return { success: true };
    } catch (error) {
        console.error('Error opening GIFs folder:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('copyToClipboard', async (_, filename) => {
    try {
        const sourcePath = path.join(GIFS_FOLDER, filename);
        const tempDir = path.join(os.tmpdir(), 'giffer');
        
        await fs.ensureDir(tempDir);
        await fs.chmod(tempDir, 0o777);
        
        const tempPath = path.join(tempDir, filename);
        await fs.copy(sourcePath, tempPath, { overwrite: true });
        
        const powershellCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${tempPath}'))"`
        
        return new Promise((resolve) => {
            exec(powershellCommand, (error) => {
                if (error) {
                    console.error('PowerShell error:', error);
                    resolve({ success: false, error: error.message });
                } else {
                    console.log('Copied GIF to clipboard:', filename);
                    resolve({ success: true });
                }
            });
        });
    } catch (error) {
        console.error('Clipboard error:', error);
        return { success: false, error: error.message };
    }
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

function createContextMenu() {
    try {
        const { execSync } = require('child_process');
        const exePath = app.getPath('exe').replace(/\\/g, '\\\\');
        
        const commands = [
            `reg add "HKCU\\Software\\Classes\\.gif\\shell\\AddToGIFfer" /ve /d "Add to GIFfer" /f`,
            `reg add "HKCU\\Software\\Classes\\.gif\\shell\\AddToGIFfer\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`
        ];

        commands.forEach(cmd => {
            try {
                execSync(cmd);
                console.log(`Successfully executed: ${cmd}`);
            } catch (cmdError) {
                console.error(`Failed to execute command: ${cmd}`, cmdError);
            }
        });

        console.log('Context menu registration completed');
    } catch (error) {
        console.error('Error creating context menu:', error);
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
    await initializeTagsData();
    const watcher = setupWatcher();
    createWindow();
    createTray();
    createContextMenu();
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
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});