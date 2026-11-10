// selfbot.js – Multi‑token avec affichage des usernames

const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync('./datas/config.json', 'utf8'));

// =====================================================
// PATCH TIMEOUT
// =====================================================

function patchTimeout() {
    try {
        const libPath = path.dirname(require.resolve('discord.js-selfbot-v13'));
        const voiceFile = path.join(libPath, 'src', 'voice', 'VoiceConnection.js');
        if (!fs.existsSync(voiceFile)) return;
        let content = fs.readFileSync(voiceFile, 'utf8');
        if (content.includes('15000')) {
            content = content.replace(/15000/g, '60000');
            fs.writeFileSync(voiceFile, 'utf8');
            console.log('✅ Patch timeout 15s → 60s');
        }
    } catch (e) {}
}

patchTimeout();

// =====================================================
// FONCTION POUR CHAQUE CLIENT
// =====================================================

function startClient(token, index) {
    const client = new Client();
    let attempt = 0;
    const maxDelay = 30000;
    let clientName = `Client ${index}`;

    async function joinVoice() {
        try {
            const guild = client.guilds.cache.get(config.voiceGuildId);
            if (!guild) throw new Error('Serveur introuvable');
            const channel = guild.channels.cache.get(config.voiceChannelId);
            if (!channel) throw new Error('Salon vocal introuvable');

            const connection = await client.voice.joinChannel(channel, {
                selfMute: true,
                selfDeaf: true,
                timeout: 60000
            });

            attempt = 0;
            console.log(`✅ [${clientName}] Rejoint ${channel.name}`);

            connection.on('disconnect', () => {
                console.log(`❌ [${clientName}] Déconnecté, reconnexion...`);
                setTimeout(joinVoice, 2000);
            });

            connection.on('error', (err) => {
                if (err.message.includes('timeout') || err.message.includes('establish')) {
                    setTimeout(joinVoice, 5000);
                }
            });
        } catch (e) {
            const delay = Math.min(1000 * Math.pow(2, attempt), maxDelay);
            attempt++;
            console.log(`🔄 [${clientName}] Retentative dans ${delay/1000}s (tentative ${attempt})`);
            setTimeout(joinVoice, delay);
        }
    }

    client.on('ready', () => {
        clientName = client.user.tag;
        console.log(`✅ [${clientName}] Connecté`);
        console.log(`📡 [${clientName}] Scraping en cours...`);
        attempt = 0;
        joinVoice();
    });

    client.on('messageCreate', async (message) => {
        if (message.author.id === client.user.id) return;
        if (message.guild && config.excludedGuilds && config.excludedGuilds.includes(message.guild.id)) return;

        const serverName = message.guild?.name || 'MP (Message Privé)';
        const serverId = message.guild?.id || 'Aucun';
        const logLine = `[${new Date().toISOString()}] | [${clientName}] | Serveur: ${serverName} (${serverId}) | ID: ${message.author.id} | User: ${message.author.tag} | Message: ${message.content}`;

        console.log(`📩 [${clientName}] ${logLine}`);
        try {
            fs.appendFileSync('./datas/data.txt', logLine + '\n', 'utf8');
        } catch (err) {
            console.error(`❌ [${clientName}] Erreur écriture fichier :`, err);
        }
    });

    client.on('error', (error) => {
        console.error(`❌ [${clientName}] ERREUR CRITIQUE :`, error.message);
    });

    client.login(token).catch(err => {
        console.error(`❌ [${clientName}] Erreur de connexion :`, err.message);
    });
}

// =====================================================
// LANCEMENT DE TOUS LES TOKENS
// =====================================================

const tokens = config.tokenUserBot;

if (!Array.isArray(tokens) || tokens.length === 0) {
    console.error('❌ Aucun token user trouvé dans config.json');
    process.exit(1);
}

tokens.forEach((token, i) => {
    startClient(token, i + 1);
});

console.log(`✅ ${tokens.length} client(s) lancé(s).`);