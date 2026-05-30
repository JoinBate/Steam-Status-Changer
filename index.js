#!/usr/bin/env node

const SteamUser = require('steam-user');
const chalk = require('chalk');
const inquirer = require('inquirer');
const figlet = require('figlet');
const gradient = require('gradient-string');
const configMgr = require('./config');

let steamClient = null;
let cycleTimer = null;
let afkTimer = null;
let currentPhraseIndex = 0;
let isRunning = false;

// ─── Константы ───────────────────────────────────────────────────

const APP_ID_SPACEWAR = 480;
const LOGON_ID = 14455;
const STATE_AWAY = 3;
const AFK_CHECK_INTERVAL = 15000;
const RECONNECT_TIMEOUT = 15000;
const RECONNECT_ELSEWHERE = 60000;
const RECONNECT_AUTH_DELAY = 500;

// ─── Оформление (шапка, ожидание ввода) ─────────────────────────

const steamGradient = gradient(['#FFFFFF', '#66C0F4']);

function clearScreen() {
    console.clear();
}

function showHeader() {
    clearScreen();
    try {
        const title = figlet.textSync('STEAM STATUS', { font: 'ANSI Shadow' });
        const title2 = figlet.textSync('CHANGER', { font: 'ANSI Shadow' });
        console.log(steamGradient(title));
        console.log(steamGradient(title2));
    } catch {
        console.log(chalk.cyan.bold('\n  === STEAM STATUS CHANGER ===\n'));
    }
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.yellow.bold('by JoinBate'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
}

async function pressAnyKey() {
    await inquirer.prompt([{
        type: 'input',
        name: 'key',
        message: 'Нажми Enter чтобы продолжить...'
    }]);
}

// ─── Steam API — установка / смена статуса ───────────────────────

function setStatus(client, phrase) {
    client.gamesPlayed([{ game_id: APP_ID_SPACEWAR, game_extra_info: phrase }]);
    try {
        client.uploadRichPresence(APP_ID_SPACEWAR, { status: phrase });
    } catch (e) { }
    const time = new Date().toLocaleTimeString();
    console.log(chalk.green(`[${time}] ${phrase}`));
}

// ─── Цикл смены фраз ─────────────────────────────────────────────

function startCycling(client, config) {
    const { phrases, interval_seconds } = config.settings;
    if (phrases.length === 0) {
        console.log(chalk.red('❌ Список фраз пуст!'));
        return;
    }
    isRunning = true;
    currentPhraseIndex = 0;
    console.log(chalk.dim('─'.repeat(40)));
    console.log(chalk.cyan(`🔄 Смена каждые ${interval_seconds} сек. | Фраз: ${phrases.length}`));
    console.log(chalk.dim('─'.repeat(40)));
    setStatus(client, phrases[0]);
    currentPhraseIndex = 1;
    cycleTimer = setInterval(() => {
        if (!isRunning) return;
        setStatus(client, phrases[currentPhraseIndex]);
        currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
    }, interval_seconds * 1000);
}

function pauseCycling(client) {
    isRunning = false;
    if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
    }
    if (client) {
        try {
            client.gamesPlayed([]);
            client.uploadRichPresence(APP_ID_SPACEWAR, {});
        } catch (e) { }
    }
    console.log(chalk.yellow('⏸️  Фразы остановлены.'));
}

function stopStatusCycling() {
    isRunning = false;
    if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
    }
    if (afkTimer) {
        clearInterval(afkTimer);
        afkTimer = null;
    }
    if (steamClient) {
        try {
            steamClient.gamesPlayed([]);
            steamClient.logOff();
        } catch (e) { }
        steamClient = null;
    }
}

// ─── Меню настройки фраз, интервала, AFK-режима ──────────────────

async function editLogin() {
    const config = configMgr.loadConfig();
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'username',
            message: 'Логин Steam:',
            default: config.account.username || undefined,
            validate: v => v.trim() ? true : 'Логин не может быть пустым'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Пароль Steam:',
            validate: v => v.trim() ? true : 'Пароль не может быть пустым'
        }
    ]);
    config.account = {
        username: (answers.username || '').trim(),
        password: (answers.password || '')
    };
    configMgr.saveConfig(config);
    console.log(chalk.green('✅ Логин и пароль сохранены!'));
    await pressAnyKey();
}

async function editPhrases() {
    const config = configMgr.loadConfig();
    while (true) {
        showHeader();
        const choices = config.settings.phrases.map((p, i) => ({
            name: `${chalk.cyan(String(i + 1).padStart(2, ' '))}. ${p}`,
            value: i
        }));
        if (choices.length > 0) {
            choices.push(new inquirer.Separator());
        }
        choices.push({ name: '➕  Добавить фразу', value: 'add' });
        if (config.settings.phrases.length > 0) {
            choices.push({ name: '🗑️  Удалить фразу', value: 'remove' });
        }
        choices.push({ name: '↩️  Готово', value: 'done' });
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: chalk.bold(`💬 Фразы (${config.settings.phrases.length} шт.):`),
            choices,
            pageSize: 15
        }]);
        if (action === 'done') break;
        if (action === 'add') {
            const { phrase } = await inquirer.prompt([{
                type: 'input',
                name: 'phrase',
                message: 'Введи новую фразу:',
                validate: v => v.trim() ? true : 'Фраза не может быть пустой'
            }]);
            config.settings.phrases.push(phrase.trim());
            configMgr.saveConfig(config);
        } else if (action === 'remove') {
            const removeChoices = config.settings.phrases.map((p, i) => ({
                name: `${chalk.cyan(String(i + 1).padStart(2, ' '))}. ${p}`,
                value: i
            }));
            removeChoices.push(new inquirer.Separator());
            removeChoices.push({ name: '↩️  Отмена', value: -1 });
            const { idx } = await inquirer.prompt([{
                type: 'list',
                name: 'idx',
                message: 'Выбери фразу для удаления:',
                choices: removeChoices,
                pageSize: 15
            }]);
            if (idx !== -1) {
                const removed = config.settings.phrases.splice(idx, 1)[0];
                configMgr.saveConfig(config);
                console.log(chalk.green(`✅ Удалено: "${removed}"`));
                await pressAnyKey();
            }
        }
    }
}

async function editInterval() {
    const config = configMgr.loadConfig();
    const { interval } = await inquirer.prompt([{
        type: 'input',
        name: 'interval',
        message: 'Интервал в секундах (мин. 5, макс. 3600):',
        default: String(config.settings.interval_seconds),
        validate: v => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 5) return 'Минимум 5 секунд';
            if (n > 3600) return 'Максимум 3600 секунд';
            return true;
        }
    }]);
    config.settings.interval_seconds = Number(interval);
    configMgr.saveConfig(config);
    console.log(chalk.green(`✅ Интервал установлен: ${interval} сек.`));
    await pressAnyKey();
}

async function toggleAfkMode() {
    const config = configMgr.loadConfig();
    config.settings.afk_mode = !config.settings.afk_mode;
    configMgr.saveConfig(config);
    const status = config.settings.afk_mode ? chalk.green('Вкл') : chalk.red('Выкл');
    console.log(chalk.green(`✅ АФК-режим: ${status}`));
    await pressAnyKey();
}

// ─── Меню настроек ───────────────────────────────────────────────

async function showSettingsMenu() {
    while (true) {
        showHeader();
        const config = configMgr.loadConfig();
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: chalk.bold('⚙️  Настройки'),
            choices: [
                {
                    name: `👤  ${config.account.username ? 'Сменить' : 'Задать'} логин и пароль` +
                        (config.account.username ? chalk.dim(` (${config.account.username})`) : ''),
                    value: 'login'
                },
                {
                    name: `💬  Фразы для статуса` +
                        chalk.dim(` (${config.settings.phrases.length} шт.)`),
                    value: 'phrases'
                },
                {
                    name: `⏱  Интервал смены` +
                        chalk.dim(` (${config.settings.interval_seconds} сек.)`),
                    value: 'interval'
                },
                {
                    name: `🤖  АФК-режим (фразы только при "Нет на месте"): ${config.settings.afk_mode ? chalk.green('Вкл') : chalk.red('Выкл')}`,
                    value: 'afk'
                },
                {
                    name: '🗑️  Сбросить сохранённую сессию Steam Guard',
                    value: 'clearsession'
                },
                { name: '↩️  Назад', value: 'back' }
            ]
        }]);

        switch (action) {
            case 'login':
                await editLogin();
                break;
            case 'phrases':
                await editPhrases();
                break;
            case 'interval':
                await editInterval();
                break;
            case 'afk':
                await toggleAfkMode();
                break;
            case 'clearsession':
                if (configMgr.deleteSession()) {
                    console.log(chalk.green('✅ Сессия удалена. При следующем запуске потребуется код Steam Guard.'));
                } else {
                    console.log(chalk.yellow('⚠️  Сохранённой сессии нет.'));
                }
                await pressAnyKey();
                break;
            case 'back':
                return;
        }
    }
}

// ─── Подключение к Steam и управление сессией ────────────────────

function connectToSteam(retrying) {
    const config = configMgr.loadConfig();
    const username = (config.account.username || '').trim();
    const password = (config.account.password || '');

    if (!username || !password) {
        console.log(chalk.red('❌ Логин и пароль не заданы. Сначала настрой в меню.'));
        setTimeout(async () => await showMainMenu(), 1500);
        return;
    }
    if (config.settings.phrases.length === 0) {
        console.log(chalk.red('❌ Нет фраз для смены статуса. Добавь их в настройках.'));
        setTimeout(async () => await showMainMenu(), 1500);
        return;
    }

    clearScreen();
    showHeader();

    const client = new SteamUser();
    steamClient = client;

    // ✅ Успешный вход
    client.on('loggedOn', () => {
        console.log(chalk.green('✅ Успешный вход в Steam!'));
        client.setPersona(SteamUser.EPersonaState.Online);

        const sessionData = {
            sessionID: client._sessionID,
            steamID: client.steamID ? client.steamID.getSteamID64() : null,
            cookies: client._session ? client._session.cookies : []
        };
        if (sessionData.sessionID && sessionData.steamID) {
            configMgr.saveSession(sessionData);
        }

        // Если включён AFK-режим — фразы крутятся только при статусе «Нет на месте»
        if (config.settings.afk_mode && client.steamID) {
            const mySid = client.steamID.getSteamID64();

            function checkAfkState() {
                const userData = client.users[mySid];
                if (!userData) return;
                const state = userData.persona_state;

                if (state === STATE_AWAY) {
                    if (!isRunning) {
                        console.log(chalk.dim('🟡 Статус "Нет на месте" — запускаю фразы.'));
                        startCycling(client, config);
                    }
                } else {
                    if (isRunning) {
                        console.log(chalk.dim('🟢 Статус изменился — останавливаю фразы.'));
                        pauseCycling(client);
                    }
                }
            }

            client.on('user', (sid) => {
                if (sid.getSteamID64() !== mySid) return;
                checkAfkState();
            });

            afkTimer = setInterval(checkAfkState, AFK_CHECK_INTERVAL);
            setTimeout(checkAfkState, 2000);
            console.log(chalk.dim('🤖 АФК-режим: фразы только при статусе "Нет на месте".'));
        } else {
            startCycling(client, config);
        }
    });

    // ⚠️  Обработка ошибок
    client.on('error', (err) => {
        stopStatusCycling();
        const errMsg = err.message || '';
        const errLower = errMsg.toLowerCase();

        // Таймаут сети — автопереподключение
        if (errLower.includes('timed out') || errLower.includes('timeout')) {
            console.log(chalk.yellow('\n⚠️  Сервера Steam не отвечают, пробуем переподключиться через 15 секунд...'));
            steamClient = null;
            setTimeout(() => connectToSteam(true), RECONNECT_TIMEOUT);
            return;
        }

        // Сессию выбил другой клиент — ждём минуту и пробуем снова
        if (errMsg.includes('LoggedInElsewhere')) {
            console.log(chalk.yellow('\n⚠️  Steam открыт в другом месте. Жду 60 секунд перед новой попыткой...'));
            steamClient = null;
            setTimeout(() => connectToSteam(true), RECONNECT_ELSEWHERE);
            return;
        }

        // Ошибки авторизации — сбрасываем сессию и входим по паролю
        const isAuthError = errMsg.includes('InvalidPassword') ||
            errMsg.includes('LoginSessionReplaced') ||
            errMsg.includes('InvalidProtocolVer') ||
            errMsg.includes('AccountDisabled') ||
            errMsg.includes('AccountNotFound') ||
            errMsg.includes('RateExceeded') ||
            errMsg.includes('TwoFactorCodeMismatch');

        if (isAuthError && !retrying) {
            configMgr.deleteSession();
            console.log(chalk.yellow('\n⚠️  Сессия устарела или невалидна. Автоматический вход с паролем...'));
            steamClient = null;
            setTimeout(() => connectToSteam(true), RECONNECT_AUTH_DELAY);
            return;
        }

        // Неизвестная ошибка — возврат в главное меню
        console.log(chalk.red(`\n❌ Ошибка Steam: ${errMsg}`));
        if (steamClient) {
            try { steamClient.logOff(); } catch (e) { }
            steamClient = null;
        }
        console.log(chalk.dim('\nВозврат в меню через 3 секунды...'));
        setTimeout(async () => {
            if (!isRunning) {
                await showMainMenu();
            }
        }, 3000);
    });

    // Отключение от Steam
    client.on('disconnected', () => {
        if (isRunning) {
            console.log(chalk.yellow('\n⚠️  Отключено от Steam. Остановка смены статуса.'));
            stopStatusCycling();
        }
    });

    // 🔐 Steam Guard — запрос кода
    client.on('steamGuard', (domain, callback, lastCodeWrong) => {
        if (lastCodeWrong) {
            console.log(chalk.red('❌ Предыдущий код неверный. Попробуй снова.'));
        }
        const msg = domain
            ? `🔐 Код из письма (отправлен на ${chalk.bold(domain)}):`
            : '🔐 Код из приложения Steam Authenticator:';
        inquirer.prompt([{
            type: 'input',
            name: 'code',
            message: msg,
            validate: v => v.trim() ? true : 'Введи код'
        }]).then(({ code }) => {
            callback((code || '').trim());
        });
    });

    // 🔑 Сохранение loginKey (авторизация без Steam Guard при следующих запусках)
    client.on('newLoginKey', (key) => {
        const steamID = client.steamID ? client.steamID.getSteamID64() : null;
        if (key && steamID) {
            configMgr.saveSession({
                loginKey: key,
                steamID: steamID,
                sessionID: client._sessionID || null,
                cookies: client._session ? client._session.cookies : []
            });
        }
    });

    // Выбор способа входа: loginKey → сессия → логин + пароль
    console.log(chalk.cyan('🔑 Подключение к Steam...'));
    const savedSession = configMgr.loadSession();
    if (savedSession && savedSession.loginKey && !retrying) {
        client.logOn({
            accountName: username,
            logonID: LOGON_ID,
            loginKey: savedSession.loginKey
        });
    } else if (savedSession && savedSession.sessionID && savedSession.steamID && !retrying) {
        client.logOn({
            accountName: username,
            logonID: LOGON_ID,
            sessionID: savedSession.sessionID,
            steamID: savedSession.steamID,
            cookies: savedSession.cookies || []
        });
    } else {
        client.logOn({
            accountName: username,
            logonID: LOGON_ID,
            password: password
        });
    }
}

// ─── Главное меню ────────────────────────────────────────────────

async function showMainMenu() {
    showHeader();
    const config = configMgr.loadConfig();
    const isReady = config.account.username &&
        config.account.password &&
        config.settings.phrases.length > 0;
    const statusText = isReady
        ? chalk.green('✅ Готов к запуску')
        : chalk.yellow('⚠️  Требуется настройка');
    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: chalk.bold('Главное меню'),
        choices: [
            {
                name: `🎮  Запустить смену статуса ${chalk.dim('[')}${statusText}${chalk.dim(']')}`,
                value: 'start'
            },
            { name: '⚙️  Открыть настройки', value: 'settings' },
            { name: '❌  Выход', value: 'exit' }
        ]
    }]);
    switch (action) {
        case 'start':
            connectToSteam();
            break;
        case 'settings':
            await showSettingsMenu();
            await showMainMenu();
            break;
        case 'exit':
            console.log(chalk.yellow('👋 До свидания!'));
            process.exit(0);
    }
}

// ─── Graceful Shutdown (Ctrl+C) ─────────────────────────────────

function gracefulShutdown() {
    if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
    }
    if (afkTimer) {
        clearInterval(afkTimer);
        afkTimer = null;
    }
    if (steamClient) {
        console.log(chalk.yellow('Отключение от Steam...'));
        try {
            steamClient.gamesPlayed([]);
            steamClient.logOff();
        } catch (e) { }
        setTimeout(() => process.exit(0), 1000);
    } else {
        process.exit(0);
    }
}

process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n👋 Завершение работы...'));
    gracefulShutdown();
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n\n👋 Завершение работы...'));
    gracefulShutdown();
});

// ─── Точка входа ─────────────────────────────────────────────────

showMainMenu().catch(err => {
    console.error(chalk.red('Критическая ошибка:'), err);
    process.exit(1);
});
