const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Définir que nous sommes en environnement de production Electron
process.env.NODE_ENV = 'production';
process.env.IS_ELECTRON = 'true';

// Définir le chemin de la base de données dans AppData (évite les erreurs Read-Only dans Program Files)
const userDataPath = app.getPath('userData');
process.env.DB_PATH = path.join(userDataPath, 'financial_db.sqlite');
process.env.UPLOADS_PATH = path.join(userDataPath, 'uploads');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    autoHideMenuBar: true,
    show: false, // On ne montre la fenêtre que quand le contenu est prêt
    webPreferences: {
      nodeIntegration: false, // Plus sûr
      contextIsolation: true
    }
  });

  // Lancer le serveur backend Express directement dans le même processus NodeJS
  console.log('Démarrage du serveur local...');
  try {
    require('./server/server.js');
  } catch (err) {
    console.error('Erreur lancement serveur:', err);
    dialog.showErrorBox('Erreur Serveur Interne', `Impossible de lancer le serveur local : ${err.message}\n\nStack: ${err.stack}`);
  }

  // On charge la page du serveur local avec un léger délai pour s'assurer qu'il écoute
  const checkServer = () => {
    mainWindow.loadURL('http://localhost:3001').then(() => {
      mainWindow.show();
    }).catch((e) => {
      console.log('Serveur pas encore prêt, on patiente...');
      setTimeout(checkServer, 500);
    });
  };

  setTimeout(checkServer, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
