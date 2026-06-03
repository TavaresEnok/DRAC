const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fsSync.existsSync(envPath)) return;
  const raw = fsSync.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const HOST = process.env.DRAC_CENTRAL_HOST || '0.0.0.0';
const PORT = Number(process.env.DRAC_CENTRAL_PORT || 9765);
const ADMIN_TOKEN = String(process.env.DRAC_CENTRAL_ADMIN_TOKEN || '').trim();
const ADMIN_EMAIL = String(process.env.DRAC_CENTRAL_ADMIN_EMAIL || 'admin@drac.local').trim().toLowerCase();
const ADMIN_PASSWORD_HASH = String(process.env.DRAC_CENTRAL_ADMIN_PASSWORD_HASH || '').trim();
const SESSION_TTL_MS = Math.max(1, Number(process.env.DRAC_CENTRAL_SESSION_HOURS || 8)) * 60 * 60 * 1000;
const DATA_FILE = path.resolve(process.cwd(), process.env.DRAC_CENTRAL_DATA_FILE || './data/installations.json');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const LICENSE_ACTIVE = 'ACTIVE';
const DEFAULT_INSTALLER_URL =
  process.env.DRAC_CENTRAL_INSTALLER_URL || 'https://raw.githubusercontent.com/TavaresEnok/DRAC/main/scripts/install-drac.sh';
const ONLINE_THRESHOLD_SECONDS = Number(process.env.DRAC_CENTRAL_ONLINE_THRESHOLD_SECONDS || 180);
const HEARTBEAT_HISTORY_LIMIT = Number(process.env.DRAC_CENTRAL_HISTORY_LIMIT || 100);
const AUDIT_HISTORY_LIMIT = Number(process.env.DRAC_CENTRAL_AUDIT_HISTORY_LIMIT || 500);
const LOGIN_WINDOW_MS = Math.max(1, Number(process.env.DRAC_CENTRAL_LOGIN_WINDOW_MINUTES || 15)) * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.DRAC_CENTRAL_LOGIN_MAX_ATTEMPTS || 8));
const ALLOWED_ORIGINS = String(process.env.DRAC_CENTRAL_ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const loginAttempts = new Map();

function securityHeaders(req) {
  const origin = String(req?.headers?.origin || '');
  const allowAnyOrigin = ALLOWED_ORIGINS.includes('*');
  const allowedOrigin = allowAnyOrigin || !origin ? (allowAnyOrigin ? '*' : ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'access-control-allow-origin': allowedOrigin || ALLOWED_ORIGINS[0] || '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-drac-installation-id,x-drac-license-key',
    'access-control-allow-credentials': 'true',
  };
}

function json(req, res, statusCode, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body, null, 2));
  res.writeHead(statusCode, {
    ...securityHeaders(req),
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(payload);
}

function text(req, res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    ...securityHeaders(req),
    'content-type': contentType,
  });
  res.end(body);
}

function empty(req, res, statusCode, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders(req),
    ...extraHeaders,
  });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function loadDb() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.installations || typeof parsed.installations !== 'object') {
      return { installations: {}, sessions: {} };
    }
    if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return { installations: {}, sessions: {} };
    throw error;
  }
}

async function saveDb(db) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

function timingSafeTextEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, encodedHash) {
  const [scheme, iterationsRaw, salt, hash] = String(encodedHash || '').split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !hash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;
  const derived = crypto.pbkdf2Sync(String(password || ''), salt, iterations, 32, 'sha256').toString('hex');
  return timingSafeTextEquals(derived, hash);
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  const cookies = {};
  for (const item of header.split(';')) {
    const index = item.indexOf('=');
    if (index === -1) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = String(process.env.DRAC_CENTRAL_COOKIE_SECURE || 'false').toLowerCase() === 'true' ? '; Secure' : '';
  return `drac_central_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie() {
  return 'drac_central_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

function loginAttemptKey(req, email) {
  return `${clientIp(req)}:${String(email || '').trim().toLowerCase()}`;
}

function loginRateLimitStatus(req, email) {
  const key = loginAttemptKey(req, email);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    const next = { firstAt: now, count: 0 };
    loginAttempts.set(key, next);
    return { key, blocked: false, entry: next };
  }
  return { key, blocked: entry.count >= LOGIN_MAX_ATTEMPTS, entry };
}

function recordLoginFailure(key, entry) {
  entry.count += 1;
  loginAttempts.set(key, entry);
}

function resetLoginFailures(key) {
  loginAttempts.delete(key);
}

function addAuditEvent(db, req, event) {
  const auditEvents = Array.isArray(db.auditEvents) ? db.auditEvents : [];
  auditEvents.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    ...event,
  });
  while (auditEvents.length > AUDIT_HISTORY_LIMIT) auditEvents.shift();
  db.auditEvents = auditEvents;
}

function slugify(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return normalized || `cliente-${crypto.randomBytes(4).toString('hex')}`;
}

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function publicBaseUrl(req) {
  const configured = String(process.env.DRAC_CENTRAL_PUBLIC_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function buildInstallCommand({ customerName, installationId, licenseKey, serverAddress, centralUrl }) {
  return buildLegacyInstallCommand({ customerName, installationId, licenseKey, serverAddress, centralUrl });
}

function buildLegacyInstallCommand({ customerName, installationId, licenseKey, serverAddress, centralUrl }) {
  return [
    `curl -fsSL ${shellQuote(DEFAULT_INSTALLER_URL)} | \\`,
    `DRAC_CUSTOMER_NAME=${shellQuote(customerName)} \\`,
    `DRAC_INSTALLATION_ID=${shellQuote(installationId)} \\`,
    `DRAC_LICENSE_KEY=${shellQuote(licenseKey)} \\`,
    `DRAC_SERVER_IP=${shellQuote(serverAddress)} \\`,
    `DRAC_CENTRAL_URL=${shellQuote(centralUrl)} \\`,
    'DRAC_AUTO_YES=true \\',
    'bash',
  ].join('\n');
}

function buildQuickInstallCommand({ centralUrl, installationId, installerToken }) {
  return `curl -fsSL ${shellQuote(`${centralUrl}/install/${encodeURIComponent(installationId)}/${encodeURIComponent(installerToken)}`)} | bash`;
}

function buildInstallerScript(item, centralUrl) {
  const command = buildLegacyInstallCommand({
    customerName: item.customerName || item.id,
    installationId: item.id,
    licenseKey: item.licenseKey,
    serverAddress: item.provisionedServerAddress || '',
    centralUrl,
  });
  return `#!/usr/bin/env bash
set -Eeuo pipefail

${command}
`;
}

function buildInstallerResponse(item, centralUrl) {
  const installerToken = item.installerToken || crypto.randomBytes(24).toString('base64url');
  item.installerToken = installerToken;
  const installCommand = buildQuickInstallCommand({ centralUrl, installationId: item.id, installerToken });
  const fallbackInstallCommand = buildLegacyInstallCommand({
    customerName: item.customerName || item.id,
    installationId: item.id,
    licenseKey: item.licenseKey,
    serverAddress: item.provisionedServerAddress || '',
    centralUrl,
  });
  return {
    licenseKey: item.licenseKey,
    centralUrl,
    serverAddress: item.provisionedServerAddress || null,
    installCommand,
    fallbackInstallCommand,
    quickInstallUrl: `${centralUrl}/install/${encodeURIComponent(item.id)}/${encodeURIComponent(installerToken)}`,
  };
}

function cleanExpiredSessions(db) {
  const now = Date.now();
  for (const [key, session] of Object.entries(db.sessions || {})) {
    if (!session?.expiresAt || new Date(session.expiresAt).getTime() <= now) {
      delete db.sessions[key];
    }
  }
}

function getAuthenticatedUser(req, db) {
  const header = String(req.headers.authorization || '');
  if (ADMIN_TOKEN && header === `Bearer ${ADMIN_TOKEN}`) {
    return { email: 'api-token', method: 'bearer' };
  }
  cleanExpiredSessions(db);
  const token = parseCookies(req).drac_central_session;
  if (!token) return null;
  const key = sessionHash(token);
  const session = db.sessions?.[key];
  if (!session) return null;
  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    delete db.sessions[key];
    return null;
  }
  session.lastSeenAt = new Date().toISOString();
  return { email: session.email, method: 'session' };
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const limit = loginRateLimitStatus(req, email);
  const db = await loadDb();
  cleanExpiredSessions(db);
  if (limit.blocked) {
    addAuditEvent(db, req, { type: 'auth.login_blocked', actor: email || 'unknown', result: 'blocked' });
    await saveDb(db);
    return json(req, res, 429, { error: 'too_many_attempts', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }
  if (!ADMIN_PASSWORD_HASH || email !== ADMIN_EMAIL || !verifyPassword(password, ADMIN_PASSWORD_HASH)) {
    recordLoginFailure(limit.key, limit.entry);
    addAuditEvent(db, req, { type: 'auth.login_failed', actor: email || 'unknown', result: 'denied' });
    await saveDb(db);
    return json(req, res, 401, { error: 'invalid_credentials', message: 'E-mail ou senha inválidos.' });
  }

  resetLoginFailures(limit.key);
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.sessions[sessionHash(token)] = {
    email: ADMIN_EMAIL,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  addAuditEvent(db, req, { type: 'auth.login_success', actor: ADMIN_EMAIL, result: 'accepted' });
  await saveDb(db);

  return json(
    req,
    res,
    200,
    {
      user: { email: ADMIN_EMAIL, role: 'ADMIN' },
      expiresAt: expiresAt.toISOString(),
    },
    { 'set-cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) },
  );
}

async function handleLogout(req, res) {
  const db = await loadDb();
  const user = getAuthenticatedUser(req, db);
  const token = parseCookies(req).drac_central_session;
  if (token) delete db.sessions[sessionHash(token)];
  addAuditEvent(db, req, { type: 'auth.logout', actor: user?.email || 'unknown', result: 'accepted' });
  await saveDb(db);
  return json(req, res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
}

async function handleMe(req, res) {
  const db = await loadDb();
  const user = getAuthenticatedUser(req, db);
  await saveDb(db);
  if (!user) return json(req, res, 200, { authenticated: false, user: null });
  return json(req, res, 200, { authenticated: true, user: { email: user.email, role: 'ADMIN', method: user.method } });
}

function metricValue(item, key, fallback = null) {
  const metrics = item.metrics || {};
  if (metrics[key] !== undefined && metrics[key] !== null) return metrics[key];
  if (key === 'cameraTotal') return metrics.cameras?.total ?? fallback;
  if (key === 'cameraOnline') return metrics.cameras?.online ?? fallback;
  if (key === 'cameraOffline') return metrics.cameras?.offline ?? fallback;
  if (key === 'cameraError') return metrics.cameras?.error ?? fallback;
  if (key === 'diskUsagePercent') return metrics.disk?.usagePercent ?? fallback;
  return fallback;
}

function publicInstallation(item) {
  const lastHeartbeatAt = item.lastHeartbeatAt ? new Date(item.lastHeartbeatAt).getTime() : 0;
  const updatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
  const ageSeconds = lastHeartbeatAt ? Math.round((Date.now() - lastHeartbeatAt) / 1000) : null;
  const policyPending = Boolean(updatedAt && lastHeartbeatAt && updatedAt > lastHeartbeatAt);
  const status = ageSeconds == null ? 'PENDING_INSTALL' : ageSeconds <= ONLINE_THRESHOLD_SECONDS ? 'ONLINE' : 'OFFLINE';
  return {
    id: item.id,
    name: item.name,
    customerName: item.customerName,
    status,
    ageSeconds,
    licenseStatus: item.licenseStatus || LICENSE_ACTIVE,
    licenseMessage: item.licenseMessage || null,
    restrictions: licenseResponse(item).restrictions,
    policyPending,
    launchProfile: item.launchProfile || item.metrics?.launchProfile || null,
    version: item.version || null,
    lastHeartbeatAt: item.lastHeartbeatAt || null,
    metrics: item.metrics || {},
    alerts: item.alerts || [],
    server: item.server || null,
    storage: item.storage || null,
    heartbeatHistory: Array.isArray(item.heartbeatHistory) ? item.heartbeatHistory : [],
    licenseHistory: Array.isArray(item.licenseHistory) ? item.licenseHistory.slice(-30) : [],
    provisionedAt: item.provisionedAt || null,
    provisionedBy: item.provisionedBy || null,
    provisionedServerAddress: item.provisionedServerAddress || null,
    updatedAt: item.updatedAt || null,
  };
}

function licenseResponse(item) {
  const status = item.licenseStatus || LICENSE_ACTIVE;
  const restrictions = {
    adminAccess: true,
    cloudSupport: status !== 'SUSPENDED',
    updates: status === 'ACTIVE' || status === 'GRACE',
    addCameras: status !== 'RESTRICTED' && status !== 'SUSPENDED',
    aiAdvanced: status === 'ACTIVE' || status === 'GRACE',
    exports: true,
    localLive: status !== 'SUSPENDED',
    localPlayback: true,
    localRecording: status !== 'SUSPENDED',
  };
  return {
    licenseStatus: status,
    licenseMessage: item.licenseMessage || null,
    restrictions,
  };
}

async function handleHeartbeat(req, res) {
  const installationId = String(req.headers['x-drac-installation-id'] || '').trim();
  const licenseKey = String(req.headers['x-drac-license-key'] || '').trim();
  if (!installationId || !licenseKey) {
    return json(req, res, 401, { error: 'missing_installation_or_license' });
  }

  const body = await readBody(req);
  const db = await loadDb();
  const existing = db.installations[installationId] || {};
  const expectedKey = existing.licenseKey || licenseKey;
  if (existing.licenseKey && existing.licenseKey !== licenseKey) {
    addAuditEvent(db, req, { type: 'agent.heartbeat_denied', actor: installationId, result: 'denied' });
    await saveDb(db);
    return json(req, res, 403, { error: 'invalid_license_key' });
  }

  const now = new Date().toISOString();
  const metrics = body.summary || body.metrics || {};
  const alerts = Array.isArray(metrics.alerts) ? metrics.alerts : Array.isArray(body.alerts) ? body.alerts : [];
  const heartbeatHistory = Array.isArray(existing.heartbeatHistory) ? existing.heartbeatHistory : [];
  heartbeatHistory.push({
    at: now,
    status: metrics.status || 'ok',
    cameraTotal: Number(metricValue({ metrics }, 'cameraTotal', 0)),
    cameraOnline: Number(metricValue({ metrics }, 'cameraOnline', 0)),
    cameraOffline: Number(metricValue({ metrics }, 'cameraOffline', 0)),
    cameraError: Number(metricValue({ metrics }, 'cameraError', 0)),
    openAlarms: Number(metrics.openAlarms || 0),
    diskUsagePercent: metrics.diskUsagePercent ?? metrics.disk?.usagePercent ?? null,
  });
  while (heartbeatHistory.length > HEARTBEAT_HISTORY_LIMIT) heartbeatHistory.shift();
  const item = {
    ...existing,
    id: installationId,
    licenseKey: expectedKey,
    name: body.installation?.name || existing.name || installationId,
    customerName: body.installation?.customerName || existing.customerName || null,
    launchProfile: body.installation?.launchProfile || metrics.launchProfile || existing.launchProfile || null,
    version: body.installation?.version || existing.version || null,
    lastHeartbeatAt: now,
    updatedAt: now,
    metrics,
    alerts: alerts.slice(0, 100),
    server: body.server || existing.server || null,
    storage: body.storage || existing.storage || null,
    heartbeatHistory,
    lastPayloadHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    licenseStatus: existing.licenseStatus || LICENSE_ACTIVE,
    licenseMessage: existing.licenseMessage || null,
  };
  db.installations[installationId] = item;
  await saveDb(db);
  return json(req, res, 200, {
    accepted: true,
    serverTime: now,
    ...licenseResponse(item),
  });
}

async function handleProvision(req, res, db, actor) {
  const body = await readBody(req);
  const customerName = String(body.customerName || '').trim();
  const requestedId = String(body.installationId || '').trim();
  const serverAddress = String(body.serverAddress || '').trim();
  const notes = String(body.notes || '').trim();

  if (!customerName) return json(req, res, 400, { error: 'missing_customer_name', message: 'Informe o nome do cliente.' });

  const installationId = slugify(requestedId || customerName);
  const existing = db.installations[installationId];
  if (existing?.lastHeartbeatAt) {
    return json(req, res, 409, {
      error: 'installation_already_active',
      message: 'Esta instalação já recebeu heartbeat. Use outro código ou edite o cliente existente.',
    });
  }

  const now = new Date().toISOString();
  const licenseKey = existing?.licenseKey || `drac-${crypto.randomBytes(16).toString('hex')}`;
  const centralUrl = publicBaseUrl(req);

  const item = {
    ...existing,
    id: installationId,
    name: installationId,
    customerName,
    licenseKey,
    installerToken: existing?.installerToken || crypto.randomBytes(24).toString('base64url'),
    licenseStatus: existing?.licenseStatus || LICENSE_ACTIVE,
    licenseMessage: existing?.licenseMessage || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    provisionedAt: now,
    provisionedBy: actor.email,
    provisionedServerAddress: serverAddress || null,
    provisionNotes: notes || null,
    metrics: existing?.metrics || {},
    alerts: existing?.alerts || [],
    heartbeatHistory: Array.isArray(existing?.heartbeatHistory) ? existing.heartbeatHistory : [],
    licenseHistory: Array.isArray(existing?.licenseHistory) ? existing.licenseHistory : [],
  };
  const installer = buildInstallerResponse(item, centralUrl);
  item.lastInstallerCommandHash = crypto.createHash('sha256').update(installer.fallbackInstallCommand).digest('hex');
  db.installations[installationId] = item;
  addAuditEvent(db, req, {
    type: existing ? 'installation.provision_regenerated' : 'installation.provision_created',
    actor: actor.email,
    result: 'accepted',
    installationId,
  });
  await saveDb(db);

  return json(req, res, 201, {
    installation: publicInstallation(item),
    ...installer,
  });
}

async function handleGetInstallerCommand(req, res, db, actor, installationId) {
  const item = db.installations[installationId];
  if (!item) return json(req, res, 404, { error: 'installation_not_found' });
  const centralUrl = publicBaseUrl(req);
  const installer = buildInstallerResponse(item, centralUrl);
  item.updatedAt = new Date().toISOString();
  addAuditEvent(db, req, {
    type: 'installation.installer_command_viewed',
    actor: actor.email,
    result: 'accepted',
    installationId,
  });
  await saveDb(db);
  return json(req, res, 200, {
    installation: publicInstallation(item),
    ...installer,
  });
}

async function handleQuickInstaller(req, res, installationId, installerToken) {
  const db = await loadDb();
  const item = db.installations[installationId];
  if (!item || !item.installerToken || !timingSafeTextEquals(item.installerToken, installerToken)) {
    addAuditEvent(db, req, { type: 'installation.installer_denied', actor: installationId, result: 'denied', installationId });
    await saveDb(db);
    return text(req, res, 404, 'Instalador nao encontrado.\n');
  }
  const centralUrl = publicBaseUrl(req);
  addAuditEvent(db, req, { type: 'installation.installer_downloaded', actor: installationId, result: 'accepted', installationId });
  await saveDb(db);
  return text(req, res, 200, buildInstallerScript(item, centralUrl), 'text/x-shellscript; charset=utf-8');
}

async function serveStatic(req, res) {
  const file = req.url === '/' ? 'index.html' : req.url.replace(/^\/+/, '');
  const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(PUBLIC_DIR, safe);
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css' : 'application/javascript';
    text(req, res, 200, data, type);
  } catch {
    text(req, res, 404, 'not found');
  }
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return empty(req, res, 204);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(req, res, 200, { status: 'ok', service: 'drac-central', time: new Date().toISOString() });
    }
    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      return empty(req, res, 204);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      return handleLogin(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      return handleLogout(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      return handleMe(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/agent/heartbeat') {
      return handleHeartbeat(req, res);
    }
    const installerMatch = url.pathname.match(/^\/install\/([^/]+)\/([^/]+)$/);
    if (req.method === 'GET' && installerMatch) {
      return handleQuickInstaller(req, res, decodeURIComponent(installerMatch[1]), decodeURIComponent(installerMatch[2]));
    }
    if (url.pathname.startsWith('/api/admin/')) {
      const db = await loadDb();
      const actor = getAuthenticatedUser(req, db);
      if (!actor) {
        await saveDb(db);
        return json(req, res, 401, { error: 'unauthorized' });
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/installations') {
        await saveDb(db);
        return json(req, res, 200, { items: Object.values(db.installations).map(publicInstallation) });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/provision') {
        return handleProvision(req, res, db, actor);
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
        await saveDb(db);
        const events = Array.isArray(db.auditEvents) ? db.auditEvents.slice().reverse().slice(0, 200) : [];
        return json(req, res, 200, { items: events });
      }
      const detailMatch = url.pathname.match(/^\/api\/admin\/installations\/([^/]+)$/);
      if (req.method === 'GET' && detailMatch) {
        const id = decodeURIComponent(detailMatch[1]);
        const item = db.installations[id];
        await saveDb(db);
        if (!item) return json(req, res, 404, { error: 'installation_not_found' });
        return json(req, res, 200, publicInstallation(item));
      }
      if (req.method === 'DELETE' && detailMatch) {
        const id = decodeURIComponent(detailMatch[1]);
        const item = db.installations[id];
        if (!item) return json(req, res, 404, { error: 'installation_not_found' });
        if (item.lastHeartbeatAt) {
          return json(req, res, 409, {
            error: 'installation_already_active',
            message: 'Não é possível remover por aqui uma instalação que já enviou heartbeat.',
          });
        }
        delete db.installations[id];
        addAuditEvent(db, req, {
          type: 'installation.provision_deleted',
          actor: actor.email,
          result: 'accepted',
          installationId: id,
        });
        await saveDb(db);
        return json(req, res, 200, { ok: true });
      }
      const installerCommandMatch = url.pathname.match(/^\/api\/admin\/installations\/([^/]+)\/installer$/);
      if (req.method === 'GET' && installerCommandMatch) {
        return handleGetInstallerCommand(req, res, db, actor, decodeURIComponent(installerCommandMatch[1]));
      }
      const match = url.pathname.match(/^\/api\/admin\/installations\/([^/]+)\/license$/);
      if (req.method === 'PATCH' && match) {
        const id = decodeURIComponent(match[1]);
        const body = await readBody(req);
        const item = db.installations[id];
        if (!item) return json(req, res, 404, { error: 'installation_not_found' });
        const allowed = ['ACTIVE', 'GRACE', 'RESTRICTED', 'SUSPENDED'];
        if (!allowed.includes(body.licenseStatus)) {
          return json(req, res, 400, { error: 'invalid_license_status' });
        }
        const licenseHistory = Array.isArray(item.licenseHistory) ? item.licenseHistory : [];
        if (item.licenseStatus !== body.licenseStatus || (item.licenseMessage || null) !== (body.licenseMessage || null)) {
          licenseHistory.push({
            at: new Date().toISOString(),
            from: item.licenseStatus || LICENSE_ACTIVE,
            to: body.licenseStatus,
            message: body.licenseMessage || null,
            by: actor.email,
          });
        }
        while (licenseHistory.length > 100) licenseHistory.shift();
        item.licenseStatus = body.licenseStatus;
        item.licenseMessage = body.licenseMessage || null;
        item.licenseHistory = licenseHistory;
        item.updatedAt = new Date().toISOString();
        addAuditEvent(db, req, {
          type: 'installation.license_changed',
          actor: actor.email,
          result: 'accepted',
          installationId: id,
          from: licenseHistory.at(-1)?.from || item.licenseStatus || LICENSE_ACTIVE,
          to: body.licenseStatus,
        });
        await saveDb(db);
        return json(req, res, 200, publicInstallation(item));
      }
      return json(req, res, 404, { error: 'not_found' });
    }
    return serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return json(req, res, 500, { error: 'internal_error', message: error.message });
  }
}

http.createServer(route).listen(PORT, HOST, () => {
  console.log(`DRAC Central ouvindo em http://${HOST}:${PORT}`);
});
