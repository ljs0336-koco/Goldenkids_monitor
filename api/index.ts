import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import axios from "axios";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

import { PGlite } from "@electric-sql/pglite";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const usePostgres = !!process.env.DATABASE_URL;
let pool: any;
let pglite: any;

if (usePostgres) {
  const { Pool } = pg;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });
} else {
  pglite = new PGlite();
}

const dbQuery = async (text: string, params: any[] = []) => {
  if (usePostgres) {
    return pool.query(text, params);
  } else {
    return pglite.query(text, params);
  }
};

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-educational-key";

let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

const ensureDB = async () => {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        await dbQuery(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            group_name VARCHAR(255) NOT NULL
          );
          CREATE TABLE IF NOT EXISTS device_groups (
            group_name VARCHAR(255) PRIMARY KEY,
            allowed_devices TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS user_device_prefs (
            username VARCHAR(255) NOT NULL,
            device_id VARCHAR(255) NOT NULL,
            is_favorite BOOLEAN DEFAULT FALSE,
            nickname VARCHAR(255),
            last_viewed_at TIMESTAMP,
            PRIMARY KEY (username, device_id)
          );
        `);

        const { rows } = await dbQuery("SELECT * FROM users WHERE username = 'admin'");
        if (rows.length === 0) {
          const hashed = bcrypt.hashSync("password123", 10);
          await dbQuery("INSERT INTO users (username, hashed_password, group_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", ["admin", hashed, "admin"]);
          await dbQuery("INSERT INTO users (username, hashed_password, group_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", ["groupA", hashed, "A"]);
          await dbQuery("INSERT INTO users (username, hashed_password, group_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", ["groupB", hashed, "B"]);

          const rentalDevices = Array.from({ length: 999 }, (_, i) => `n${(i + 1).toString().padStart(3, '0')}`);
          const salesDevices = Array.from({ length: 2000 }, (_, i) => `k${(i + 1).toString().padStart(4, '0')}`);
          const allDevices = [...rentalDevices, ...salesDevices];

          await dbQuery("INSERT INTO device_groups (group_name, allowed_devices) VALUES ($1, $2) ON CONFLICT (group_name) DO NOTHING", ["admin", JSON.stringify(allDevices)]);
          await dbQuery("INSERT INTO device_groups (group_name, allowed_devices) VALUES ($1, $2) ON CONFLICT (group_name) DO NOTHING", ["A", JSON.stringify(rentalDevices.slice(0, 100))]);
          await dbQuery("INSERT INTO device_groups (group_name, allowed_devices) VALUES ($1, $2) ON CONFLICT (group_name) DO NOTHING", ["B", JSON.stringify(salesDevices.slice(0, 100))]);
        }
        dbInitialized = true;
      } catch (err) {
        console.error("DB Init Error:", err);
        dbInitPromise = null;
        throw err;
      }
    })();
  }
  await dbInitPromise;
};

app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error("Middleware DB Init Error:", err);
    res.status(500).json({ error: "데이터베이스 초기화 중 오류가 발생했습니다. Vercel 환경 변수(DATABASE_URL)를 확인해주세요." });
  }
});

const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (user.group_name !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await dbQuery("SELECT * FROM users WHERE username = $1", [username]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.hashed_password)) {
      res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      return;
    }
    const userInfo = { id: user.id, username: user.username, group_name: user.group_name };
    const token = jwt.sign(userInfo, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Login successful", user: userInfo, token });
  } catch (err: any) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "데이터베이스 연결 오류가 발생했습니다. Vercel 환경 변수(DATABASE_URL)를 확인해주세요." });
  }
});

app.post("/api/logout", authenticate, (req, res) => {
  res.json({ message: "Logout successful" });
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({ user: (req as any).user });
});

app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await dbQuery("SELECT id, username, group_name FROM users");
    res.json({ users: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  const { username, password, group_name } = req.body;
  try {
    const hashed = bcrypt.hashSync(password, 10);
    await dbQuery("INSERT INTO users (username, hashed_password, group_name) VALUES ($1, $2, $3)", [username, hashed, group_name]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery("DELETE FROM users WHERE id = $1 AND username != 'admin'", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/groups", authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await dbQuery("SELECT * FROM device_groups");
    res.json({ groups: rows.map((g: any) => ({ ...g, allowed_devices: JSON.parse(g.allowed_devices) })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/groups", authenticate, requireAdmin, async (req, res) => {
  const { group_name, allowed_devices } = req.body;
  try {
    await dbQuery(`
      INSERT INTO device_groups (group_name, allowed_devices) 
      VALUES ($1, $2) 
      ON CONFLICT(group_name) DO UPDATE SET allowed_devices = EXCLUDED.allowed_devices
    `, [group_name, JSON.stringify(allowed_devices)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/groups/:name", authenticate, requireAdmin, async (req, res) => {
  const { name } = req.params;
  if (name === 'admin') {
    res.status(400).json({ error: "Cannot delete admin group" });
    return;
  }
  try {
    await dbQuery("DELETE FROM device_groups WHERE group_name = $1", [name]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/me/password", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }
  try {
    const hashed = bcrypt.hashSync(newPassword, 10);
    await dbQuery("UPDATE users SET hashed_password = $1 WHERE id = $2", [hashed, user.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prefs", authenticate, async (req, res) => {
  const user = (req as any).user;
  try {
    const { rows } = await dbQuery("SELECT * FROM user_device_prefs WHERE username = $1", [user.username]);
    res.json({ prefs: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prefs/:deviceId/view", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { deviceId } = req.params;
  try {
    await dbQuery(`
      INSERT INTO user_device_prefs (username, device_id, last_viewed_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP) 
      ON CONFLICT(username, device_id) DO UPDATE SET last_viewed_at = CURRENT_TIMESTAMP
    `, [user.username, deviceId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prefs/:deviceId/favorite", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { deviceId } = req.params;
  const { is_favorite } = req.body;
  try {
    await dbQuery(`
      INSERT INTO user_device_prefs (username, device_id, is_favorite) 
      VALUES ($1, $2, $3) 
      ON CONFLICT(username, device_id) DO UPDATE SET is_favorite = EXCLUDED.is_favorite
    `, [user.username, deviceId, is_favorite]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prefs/:deviceId/nickname", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { deviceId } = req.params;
  const { nickname } = req.body;
  try {
    await dbQuery(`
      INSERT INTO user_device_prefs (username, device_id, nickname) 
      VALUES ($1, $2, $3) 
      ON CONFLICT(username, device_id) DO UPDATE SET nickname = EXCLUDED.nickname
    `, [user.username, deviceId, nickname]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/devices", authenticate, async (req, res) => {
  const user = (req as any).user;
  try {
    const { rows } = await dbQuery("SELECT allowed_devices FROM device_groups WHERE group_name = $1", [user.group_name]);
    const devices = rows.length > 0 ? JSON.parse(rows[0].allowed_devices) : [];
    res.json({ devices });
  } catch (err: any) {
    console.error("[API] /api/devices error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/proxy/:deviceId", authenticate, async (req, res) => {
  const user = (req as any).user;
  const { deviceId } = req.params;
  
  try {
    const { rows } = await dbQuery("SELECT allowed_devices FROM device_groups WHERE group_name = $1", [user.group_name]);
    const allowed = rows.length > 0 ? JSON.parse(rows[0].allowed_devices) : [];

    if (!allowed.includes(deviceId) && user.group_name !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const url = `https://edu.telliot.co.kr/device-chat-list/${deviceId}`;
    const response = await axios.get(url, {
      timeout: 20000,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const headers = { ...response.headers } as any;
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['set-cookie'];
    delete headers['transfer-encoding'];
    
    res.set(headers);

    const contentType = headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      let html = response.data.toString('utf-8');
      
      // Inject base tag and mock localStorage to prevent SecurityError in iframe
      html = html.replace(/<head>/i, `<head>
        <base href="https://edu.telliot.co.kr/">
        <script>
          // Mock localStorage and sessionStorage to prevent 3rd party cookie blocking errors
          try {
            var test = window.localStorage;
          } catch (e) {
            var memoryStorage = {
              _data: {},
              setItem: function(id, val) { return this._data[id] = String(val); },
              getItem: function(id) { return this._data.hasOwnProperty(id) ? this._data[id] : undefined; },
              removeItem: function(id) { return delete this._data[id]; },
              clear: function() { return this._data = {}; }
            };
            Object.defineProperty(window, 'localStorage', { value: memoryStorage });
            Object.defineProperty(window, 'sessionStorage', { value: memoryStorage });
          }
        </script>
      `);
      res.send(html);
    } else {
      res.send(response.data);
    }
  } catch (error: any) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: "Failed to fetch device data" });
  }
});

export default app;
