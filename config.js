const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const SESSION_PATH = path.join(__dirname, 'steam_session.json');

function getDefaults() {
    return {
        account: { username: '', password: '' },
        settings: { interval_seconds: 30, phrases: [], afk_mode: false }
    };
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Ошибка загрузки config.json:', e.message);
    }
    return getDefaults();
}

function saveConfig(data) {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadSession() {
    try {
        if (fs.existsSync(SESSION_PATH)) {
            return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
        }
    } catch (e) {
        return null;
    }
    return null;
}

function saveSession(data) {
    const dir = path.dirname(SESSION_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function deleteSession() {
    try {
        if (fs.existsSync(SESSION_PATH)) {
            fs.unlinkSync(SESSION_PATH);
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

module.exports = {
    loadConfig,
    saveConfig,
    loadSession,
    saveSession,
    deleteSession,
    getDefaults
};
