const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'simfraud_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

// Auto-initialize schema on startup
async function initializeSchema() {
    try {
        const conn = await pool.getConnection();
        console.log(`Connected to MySQL Database (${process.env.DB_NAME})!`);

        // Read and execute the schema file to ensure all tables exist
        const schemaPath = path.join(__dirname, 'db_schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await conn.query(schema);
            console.log('✅ Database schema initialized/verified successfully.');
        }
        conn.release();
    } catch (err) {
        console.error("Database Initialization Error:", err.message);
    }
}

initializeSchema();

module.exports = pool;
