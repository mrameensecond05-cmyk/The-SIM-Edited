const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
require('dotenv').config();
const { sendSimulatedSMS, getRemainingQuota } = require('./smsService');

const app = express();
const server = http.createServer(app);

// --- Socket.io Setup ---
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

const pool = require('./db');
const path = require('path');

// --- Static Files ---
app.use('/api/download', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public/web')));

// Catch-all for React
app.get(new RegExp('.*'), (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'public/web', 'index.html'));
});

// --- SIMPLE RULE-BASED FRAUD ANALYSIS ---
/**
 * Analyzes a transaction for fraud using simple rule-based logic.
 * No external AI service required.
 */
async function analyzeFraud(transactionId) {
    const [txRows] = await pool.query(
        'SELECT t.*, u.name, u.phone FROM SIMFraudTransaction t JOIN SIMFraudUserProfile u ON t.user_id = u.id WHERE t.id = ?',
        [transactionId]
    );
    if (txRows.length === 0) throw new Error(`Transaction ${transactionId} not found`);
    const tx = txRows[0];

    // Check for recent SIM swap
    const [simRows] = await pool.query(
        "SELECT event_type FROM SIMFraudSIMEvent WHERE user_id = ? AND event_type = 'imei_change' ORDER BY timestamp DESC LIMIT 1",
        [tx.user_id]
    );
    const hadSimSwap = simRows.length > 0;

    // Check velocity (transactions in last 10 mins)
    const [velocityRows] = await pool.query(
        "SELECT COUNT(*) as cnt FROM SIMFraudTransaction WHERE user_id = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 10 MINUTE)",
        [tx.user_id]
    );
    const velocity = velocityRows[0].cnt;

    const HIGH_AMOUNT_THRESHOLD = 50000;

    // Rule Engine
    let risk_score = 0.1;
    let risk_level = 'LOW';
    let decision = 'ALLOW';
    let reasons = [];

    if (hadSimSwap) {
        risk_score = Math.max(risk_score, 0.90);
        risk_level = 'CRITICAL';
        decision = 'BLOCK';
        reasons.push('Recent SIM swap detected on this account');
    }

    if (velocity >= 5) {
        risk_score = Math.max(risk_score, 0.95);
        risk_level = 'CRITICAL';
        decision = 'BLOCK';
        reasons.push(`High velocity: ${velocity} transactions in 10 minutes`);
    }

    if (tx.amount > HIGH_AMOUNT_THRESHOLD) {
        risk_score = Math.max(risk_score, 0.75);
        if (risk_level === 'LOW') { risk_level = 'HIGH'; decision = 'STEP_UP'; }
        reasons.push(`Large transaction: ₹${tx.amount} exceeds threshold of ₹${HIGH_AMOUNT_THRESHOLD}`);
    }

    if (hadSimSwap && tx.amount > HIGH_AMOUNT_THRESHOLD) {
        risk_level = 'CRITICAL';
        decision = 'BLOCK';
        risk_score = 0.99;
        reasons.push('SIM swap + large transaction is a strong fraud signal');
    }

    if (reasons.length === 0) reasons.push('No suspicious activity detected');

    const analysis = {
        risk_score,
        risk_level,
        decision,
        reasons,
        summary: `Transaction ${decision.toLowerCase()} — Risk: ${risk_level}`,
        admin_note: 'Rule-based analysis'
    };

    // Save audit log
    try {
        await pool.query(
            "INSERT INTO SIMFraudAuditLog (actor_login_id, action, entity_type, entity_id, metadata_json) VALUES (1, 'RULE_ENGINE', 'transaction', ?, ?)",
            [transactionId, JSON.stringify(analysis)]
        );
    } catch (e) { /* audit log is non-critical */ }

    return analysis;
}

// --- AUTH ROUTES ---

async function seedRoles() {
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM SIMFraudRole');
        if (rows[0].count === 0) {
            console.log("Seeding Roles...");
            await pool.query("INSERT INTO SIMFraudRole (role_name) VALUES ('USER'), ('ADMIN')");
        }
        await seedAdmin();
    } catch (err) {
        console.error("Role Seeding Error:", err);
    }
}

async function seedAdmin() {
    try {
        const [rows] = await pool.query("SELECT id FROM SIMFraudLogin WHERE email = 'admin@simtinel.com'");
        if (rows.length === 0) {
            console.log("Seeding Default Admin...");
            const hashedPassword = await bcrypt.hash('admin123', 10);
            const [roles] = await pool.query("SELECT id FROM SIMFraudRole WHERE role_name = 'ADMIN'");
            const roleId = roles[0]?.id;
            if (roleId) {
                const [res] = await pool.query(
                    "INSERT INTO SIMFraudLogin (email, password_hash, role_id) VALUES ('admin@simtinel.com', ?, ?)",
                    [hashedPassword, roleId]
                );
                await pool.query(
                    "INSERT INTO SIMFraudUserProfile (login_id, name, email) VALUES (?, 'System Admin', 'admin@simtinel.com')",
                    [res.insertId]
                );
                console.log("Default Admin Created: admin@simtinel.com / admin123");
            }
        }
    } catch (err) {
        console.error("Admin Seeding Error:", err);
    }
}
seedRoles();

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ error: "Name, email, and password are required." });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [existing] = await conn.query('SELECT id FROM SIMFraudLogin WHERE email = ?', [email]);
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(409).json({ error: "Email already registered." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [roles] = await conn.query("SELECT id FROM SIMFraudRole WHERE role_name = 'USER'");
        const roleId = roles[0]?.id || 1;

        const [loginResult] = await conn.query(
            "INSERT INTO SIMFraudLogin (email, phone_number, password_hash, role_id) VALUES (?, ?, ?, ?)",
            [email, phone || null, hashedPassword, roleId]
        );
        const loginId = loginResult.insertId;

        await conn.query(
            "INSERT INTO SIMFraudUserProfile (login_id, name, email, phone) VALUES (?, ?, ?, ?)",
            [loginId, name, email, phone || null]
        );
        await conn.commit();

        // Send welcome SMS if phone provided
        if (phone) {
            sendSimulatedSMS(phone, `Welcome ${name}! Your SIMTinel account is active. Stay protected.`).catch(console.error);
        }

        res.status(201).json({ message: "Registration successful", success: true });
    } catch (err) {
        await conn.rollback();
        console.error("Register Error:", err);
        res.status(500).json({ error: "Registration failed. Please try again." });
    } finally {
        conn.release();
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: "Email and password required." });

    try {
        const [users] = await pool.query(`
            SELECT l.id as login_id, l.password_hash, l.role_id, r.role_name, p.name, p.id as profile_id
            FROM SIMFraudLogin l
            JOIN SIMFraudRole r ON l.role_id = r.id
            LEFT JOIN SIMFraudUserProfile p ON l.id = p.login_id
            WHERE l.email = ?
        `, [email]);

        if (users.length === 0)
            return res.status(401).json({ error: "Invalid credentials." });

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(401).json({ error: "Invalid credentials." });

        res.json({
            success: true,
            user: {
                id: user.profile_id,
                name: user.name || 'User',
                email: email,
                role: user.role_name,
                loginId: user.login_id
            }
        });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Login failed." });
    }
});

// Device Registration / SIM Swap Detection
app.post('/api/user/device', async (req, res) => {
    const { userId, imei, location } = req.body;
    if (!userId || !imei)
        return res.status(400).json({ error: "User ID and IMEI required." });

    try {
        const [rows] = await pool.query(
            "SELECT new_imei FROM SIMFraudSIMEvent WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
            [userId]
        );
        const lastImei = rows[0]?.new_imei;

        if (lastImei && lastImei === imei)
            return res.json({ success: true, message: "Device verified", status: "unchanged" });

        const eventType = lastImei ? 'imei_change' : 'new_sim';
        if (eventType === 'imei_change')
            console.warn(`[SIM SWAP DETECTED] User ${userId} changed IMEI from ${lastImei} to ${imei}`);

        await pool.query(
            "INSERT INTO SIMFraudSIMEvent (user_id, event_type, old_imei, new_imei, location, timestamp) VALUES (?, ?, ?, ?, ?, NOW())",
            [userId, eventType, lastImei || null, imei, location || 'Unknown']
        );

        res.json({ success: true, message: "Device registered", status: eventType });
    } catch (err) {
        console.error("Device Reg Error:", err);
        res.status(500).json({ error: "Failed to register device." });
    }
});

// Update Primary Phone Number
app.post('/api/user/primary-phone', async (req, res) => {
    const { userId, phone } = req.body;
    if (!userId || !phone)
        return res.status(400).json({ error: "User ID and Phone Number required." });

    try {
        await pool.query(
            "UPDATE SIMFraudUserProfile SET phone = ? WHERE id = ?",
            [phone, userId]
        );
        res.json({ success: true, message: "Primary phone updated" });
    } catch (err) {
        console.error("Update Phone Error:", err);
        res.status(500).json({ error: "Failed to update primary phone." });
    }
});

// Dashboard Stats
app.get('/api/stats', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT COUNT(*) as count FROM SIMFraudUserProfile');
        const [incidents] = await pool.query(
            "SELECT COUNT(*) as count FROM SIMFraudPredictionOutput WHERE decision = 'BLOCK' AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)"
        );
        const [activeThreats] = await pool.query(
            "SELECT COUNT(*) as count FROM SIMFraudAlert WHERE status IN ('open', 'in_review')"
        );
        res.json({
            totalUsers: users[0].count,
            threatsBlockedToday: incidents[0].count,
            activeThreats: activeThreats[0].count,
            systemHealth: '100%'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.id, p.name, p.email, 'ACTIVE' as status, p.created_at as last_active, r.role_name
            FROM SIMFraudUserProfile p
            JOIN SIMFraudLogin l ON p.login_id = l.id
            JOIN SIMFraudRole r ON l.role_id = r.id
        `);
        res.json(rows.map(u => ({
            id: u.id.toString(),
            name: u.name,
            email: u.email,
            status: u.status,
            riskScore: 0,
            lastActive: u.last_active,
            role: u.role_name
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Incidents
app.get('/api/incidents', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT a.id, a.severity, a.status, p.decision, p.fraud_score, t.timestamp as tx_time,
                   up.name as user_name, up.id as user_id
            FROM SIMFraudAlert a
            JOIN SIMFraudPredictionOutput p ON a.prediction_id = p.id
            JOIN SIMFraudTransaction t ON p.transaction_id = t.id
            JOIN SIMFraudUserProfile up ON t.user_id = up.id
            ORDER BY a.created_at DESC LIMIT 50
        `);
        res.json(rows.map(i => ({
            id: i.id.toString(),
            userId: i.user_id.toString(),
            userName: i.user_name,
            type: i.decision === 'BLOCK' ? 'FRAUD_BLOCKED' : 'ALERT_FLAGGED',
            severity: i.severity,
            timestamp: i.tx_time,
            details: `Fraud Score: ${i.fraud_score}. Decision: ${i.decision}`,
            status: i.status === 'open' ? 'ACTIVE' : i.status === 'closed' ? 'RESOLVED' : 'INVESTIGATING'
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Alerts
app.get('/api/alerts', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT a.id, a.severity, a.created_at, p.fraud_score, p.explanation_json, up.phone
            FROM SIMFraudAlert a
            JOIN SIMFraudPredictionOutput p ON a.prediction_id = p.id
            JOIN SIMFraudTransaction t ON p.transaction_id = t.id
            JOIN SIMFraudUserProfile up ON t.user_id = up.id
            ORDER BY a.created_at DESC LIMIT 20
        `);
        res.json(rows.map(a => ({
            id: a.id.toString(),
            sender: a.phone || 'Unknown',
            timestamp: a.created_at,
            originalText: `System Alert: Fraud Score ${a.fraud_score}`,
            riskScore: Math.round(a.fraud_score * 100),
            riskLevel: a.severity,
            reasoning: JSON.stringify(a.explanation_json) || 'Rule-based detection',
            isAadhaarVerified: true
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Analyze SMS (Rule-Based)
app.post('/api/analyze', async (req, res) => {
    const { smsText, deviceContext, userId } = req.body;
    try {
        const amountRegex = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)/i;
        const match = smsText ? smsText.match(amountRegex) : null;
        const parsedAmount = match ? parseFloat(match[1].replace(/,/g, '')) : 0.00;

        const [txResult] = await pool.query(
            "INSERT INTO SIMFraudTransaction (user_id, amount, channel, status, timestamp) VALUES (?, ?, 'OTHER', 'initiated', NOW())",
            [userId || 1, parsedAmount]
        );
        const txId = txResult.insertId;
        const analysis = await analyzeFraud(txId);

        const [predResult] = await pool.query(
            "INSERT INTO SIMFraudPredictionOutput (transaction_id, fraud_score, decision, features_json, explanation_json) VALUES (?, ?, ?, ?, ?)",
            [txId, analysis.risk_score, analysis.decision, JSON.stringify({ sms: smsText, context: deviceContext }), JSON.stringify(analysis.reasons)]
        );
        const predId = predResult.insertId;

        if (['HIGH', 'CRITICAL'].includes(analysis.risk_level)) {
            await pool.query(
                "INSERT INTO SIMFraudAlert (prediction_id, severity, status) VALUES (?, ?, 'open')",
                [predId, analysis.risk_level]
            );
        }

        res.json({ success: true, analysis, alertId: predId });
    } catch (err) {
        console.error("Analysis Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Simulate Fraud Alert
app.post('/api/simulate/alert', async (req, res) => {
    let { phone, userId } = req.body;

    // Auto-target latest user if none specified
    if (!userId && !phone) {
        try {
            const [latest] = await pool.query(
                "SELECT p.id, p.phone, p.name FROM SIMFraudUserProfile p WHERE p.phone IS NOT NULL ORDER BY p.id DESC LIMIT 1"
            );
            if (latest.length > 0) {
                userId = latest[0].id;
                phone = latest[0].phone;
                console.log(`[SIMULATION] Auto-targeting: ${latest[0].name} (${phone})`);
            } else {
                return res.status(404).json({ error: "No registered users with phone numbers found" });
            }
        } catch (err) {
            return res.status(500).json({ error: "Failed to find latest user" });
        }
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Resolve user
        let targetUserId = userId;
        let targetPhone = phone;
        let targetName = 'Unknown';

        if (!targetUserId) {
            const [users] = await conn.query("SELECT id, name FROM SIMFraudUserProfile WHERE phone = ?", [phone]);
            if (users.length === 0) {
                await conn.rollback();
                return res.status(404).json({ error: "User not found with that phone" });
            }
            targetUserId = users[0].id;
            targetName = users[0].name;
        } else {
            const [users] = await conn.query("SELECT phone, name FROM SIMFraudUserProfile WHERE id = ?", [targetUserId]);
            if (users.length > 0) { targetPhone = users[0].phone; targetName = users[0].name; }
        }

        // 1. Simulate SIM Swap
        const [lastEvent] = await conn.query(
            "SELECT new_imei FROM SIMFraudSIMEvent WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
            [targetUserId]
        );
        const oldImei = lastEvent[0]?.new_imei || '111111111111111';
        await conn.query(
            "INSERT INTO SIMFraudSIMEvent (user_id, event_type, old_imei, new_imei, location, timestamp) VALUES (?, 'imei_change', ?, '999999999999999', 'Unknown (Simulated)', NOW())",
            [targetUserId, oldImei]
        );

        // 2. Simulate Transaction
        const [txRes] = await conn.query(
            "INSERT INTO SIMFraudTransaction (user_id, amount, channel, status, timestamp) VALUES (?, 50000.00, 'NETBANKING', 'initiated', NOW())",
            [targetUserId]
        );
        const txId = txRes.insertId;

        await conn.commit();
        conn.release();

        // 3. Rule-Based Analysis
        const analysis = await analyzeFraud(txId);

        // 4. Save Prediction + Alert
        const [predRes] = await pool.query(
            "INSERT INTO SIMFraudPredictionOutput (transaction_id, fraud_score, decision, features_json, explanation_json) VALUES (?, ?, ?, '{}', ?)",
            [txId, analysis.risk_score, analysis.decision, JSON.stringify(analysis.reasons)]
        );
        await pool.query(
            "INSERT INTO SIMFraudAlert (prediction_id, severity, status) VALUES (?, ?, 'open')",
            [predRes.insertId, analysis.risk_level]
        );

        // 5. Send Alert SMS
        if (targetPhone) {
            const alertMessages = [
                `ALERT: SIM swap detected on ${targetPhone}. Rs.50,000 transaction blocked. Call 1800-SIMTINEL if not you.`,
                `SIMTinel: Unusual login from new device. Your account is temporarily locked for safety.`,
                `WARNING: Your SIM card was changed. A Rs.50,000 transfer was attempted. Reply STOP to block.`,
                `FRAUD ALERT: Suspicious activity on your account. New device detected. Contact support immediately.`,
                `SIMTinel Security: SIM swap attempt detected. Transaction of Rs.50,000 has been held for verification.`,
                `URGENT: Your number ${targetPhone} was ported to a new SIM. All transactions are paused.`,
                `SIMTinel: High-risk transaction blocked. New IMEI detected on your account. Verify identity to proceed.`,
                `SECURITY: Your SIM was swapped. Unauthorized Rs.50,000 NETBANKING attempt blocked by SIMTinel.`
            ];
            const alertMsg = alertMessages[Math.floor(Math.random() * alertMessages.length)];
            await sendSimulatedSMS(targetPhone, alertMsg);
        }

        // 5b. Also broadcast via Socket.io to all connected clients
        io.emit('receive_simulation_command', {
            sender: targetPhone || 'SIMTinel Security',
            message: `CRITICAL: Unauthorized SIM swap detected on ${targetPhone}. A ₹50,000 transaction was blocked. Verify your identity immediately.`,
            severity: analysis.risk_level,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: "Simulation Complete",
            steps: ["SIM Swap Event Created", "Suspicious Transaction Created", "Rule-Based Analysis Performed", "Alert SMS Sent"],
            analysis
        });
    } catch (err) {
        if (conn) conn.release();
        console.error("Simulation Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// SMS Quota
app.get('/api/sms/quota', (req, res) => {
    res.json({ remaining: getRemainingQuota(), limit: 3 });
});

// --- Socket.io Connection Handler ---
io.on('connection', (socket) => {
    console.log(`[Socket.io] Device connected: ${socket.id}`);

    socket.on('admin_trigger_simulation', async (data) => {
        console.log('[Socket.io] Admin triggered simulation:', data);
        try {
            // Resolve target user from the database
            let targetUserId = null;
            let targetPhone = null;
            let targetName = 'Unknown';

            const [latest] = await pool.query(
                "SELECT p.id, p.phone, p.name FROM SIMFraudUserProfile p WHERE p.phone IS NOT NULL ORDER BY p.id DESC LIMIT 1"
            );
            if (latest.length > 0) {
                targetUserId = latest[0].id;
                targetPhone = latest[0].phone;
                targetName = latest[0].name;
            } else {
                socket.emit('simulation_result', { success: false, error: 'No registered users with phone numbers found' });
                return;
            }

            const conn = await pool.getConnection();
            await conn.beginTransaction();

            // 1. Simulate SIM Swap
            const [lastEvent] = await conn.query(
                "SELECT new_imei FROM SIMFraudSIMEvent WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1",
                [targetUserId]
            );
            const oldImei = lastEvent[0]?.new_imei || '111111111111111';
            await conn.query(
                "INSERT INTO SIMFraudSIMEvent (user_id, event_type, old_imei, new_imei, location, timestamp) VALUES (?, 'imei_change', ?, '999999999999999', 'Unknown (Simulated)', NOW())",
                [targetUserId, oldImei]
            );

            // 2. Simulate Transaction
            const [txRes] = await conn.query(
                "INSERT INTO SIMFraudTransaction (user_id, amount, channel, status, timestamp) VALUES (?, 50000.00, 'NETBANKING', 'initiated', NOW())",
                [targetUserId]
            );
            const txId = txRes.insertId;
            await conn.commit();
            conn.release();

            // 3. Rule-Based Analysis
            const analysis = await analyzeFraud(txId);

            // 4. Save Prediction + Alert
            const [predRes] = await pool.query(
                "INSERT INTO SIMFraudPredictionOutput (transaction_id, fraud_score, decision, features_json, explanation_json) VALUES (?, ?, ?, '{}', ?)",
                [txId, analysis.risk_score, analysis.decision, JSON.stringify(analysis.reasons)]
            );
            await pool.query(
                "INSERT INTO SIMFraudAlert (prediction_id, severity, status) VALUES (?, ?, 'open')",
                [predRes.insertId, analysis.risk_level]
            );

            // 5. Send SMS via Fast2SMS
            let smsStatus = null;
            if (targetPhone) {
                const alertMessages = [
                    `ALERT: SIM swap detected on ${targetPhone}. Rs.50,000 transaction blocked. Call 1800-SIMTINEL if not you.`,
                    `SIMTinel: Unusual login from new device. Your account is temporarily locked for safety.`,
                    `WARNING: Your SIM card was changed. A Rs.50,000 transfer was attempted. Reply STOP to block.`,
                    `FRAUD ALERT: Suspicious activity on your account. New device detected. Contact support immediately.`,
                ];
                const alertMsg = alertMessages[Math.floor(Math.random() * alertMessages.length)];
                smsStatus = await sendSimulatedSMS(targetPhone, alertMsg);
            }

            // 6. Broadcast to ALL connected clients (mobile app gets this)
            io.emit('receive_simulation_command', {
                sender: targetPhone || 'SIMTinel Security',
                message: `CRITICAL: Unauthorized SIM swap detected on ${targetPhone}. A ₹50,000 transaction was blocked. Verify your identity immediately.`,
                severity: analysis.risk_level,
                timestamp: new Date().toISOString()
            });

            // 7. Send result back to admin
            socket.emit('simulation_result', {
                success: true,
                message: 'Simulation Complete',
                steps: ['SIM Swap Event Created', 'Suspicious Transaction Created', 'Rule-Based Analysis Performed', smsStatus ? 'Alert SMS Sent' : 'SMS Skipped (no phone)'],
                analysis,
                smsStatus
            });
        } catch (err) {
            console.error('[Socket.io] Simulation Error:', err);
            socket.emit('simulation_result', { success: false, error: err.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] Device disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} (Socket.io enabled)`));
