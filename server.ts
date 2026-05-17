import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
const app = initializeApp({
  credential: applicationDefault(),
  projectId: firebaseConfig.projectId
});

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
  );

  // Auth URL
  app.get('/api/auth/google/url', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ 
        error: 'Missing Google Credentials', 
        details: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set in environment variables.' 
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ]
    });
    res.json({ url });
  });

  // Callback
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store tokens in settings/google
      await db.collection('settings').doc('google').set({
        tokens,
        updatedAt: FieldValue.serverTimestamp(),
        lastAuthorizedEmail: 'axisindiacnc@gmail.com' // Master default
      });

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0fdf4;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
              <h1 style="color: #059669;">Success!</h1>
              <p>Google Drive has been connected to FlowManager.</p>
              <p>You can close this window now.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 2000);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Google Auth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // Check connection status
  app.get('/api/auth/google/status', async (req, res) => {
    try {
      const doc = await db.collection('settings').doc('google').get();
      res.json({ connected: doc.exists });
    } catch (error) {
      res.status(500).json({ connected: false });
    }
  });

  // Upload Report
  app.post('/api/reports/upload', async (req, res) => {
    const { fileName, content, mimeType, folders } = req.body;
    
    try {
      const doc = await db.collection('settings').doc('google').get();
      if (!doc.exists) {
        return res.status(401).json({ error: 'Google Drive not connected' });
      }

      const tokens = doc.data()?.tokens;
      oauth2Client.setCredentials(tokens);

      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const results = [];

      for (const folderName of folders) {
        // 1. Find or create folder
        let folderId;
        const listRes = await drive.files.list({
          q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id, name)',
        });

        if (listRes.data.files && listRes.data.files.length > 0) {
          folderId = listRes.data.files[0].id;
        } else {
          const createRes = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
            },
            fields: 'id',
          });
          folderId = createRes.data.id;
        }

        // 2. Upload file
        const buffer = Buffer.from(content, 'base64');
        const fileRes = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId!],
          },
          media: {
            mimeType: mimeType,
            body: Readable.from(buffer),
          },
          fields: 'id, webViewLink'
        });

        const fileId = fileRes.data.id;

        // 3. Make file public so link works for WhatsApp recipient
        await drive.permissions.create({
          fileId: fileId!,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });

        results.push({ folder: folderName, link: fileRes.data.webViewLink });
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Upload Error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Helper for buffer stream
import { Readable } from 'stream';

startServer();
