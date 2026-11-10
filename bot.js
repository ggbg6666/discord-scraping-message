// bot.js

const fs = require('fs');
const { spawn } = require('child_process');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const config = require('./datas/config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// =====================================================
// COMMANDES SLASH
// =====================================================

const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes disponibles'),
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Donne les infos scrapées sur un utilisateur')
        .addStringOption(option => option.setName('userid').setDescription('ID de l\'utilisateur').setRequired(true)),
    new SlashCommandBuilder()
        .setName('alldb')
        .setDescription('Envoie tout le fichier de données scrapées'),
    new SlashCommandBuilder()
        .setName('allscrap')
        .setDescription('Envoie un fichier avec tous les serveurs et utilisateurs scrapés'),
    new SlashCommandBuilder()
        .setName('log')
        .setDescription('Affiche les informations d\'un utilisateur (username, avatar, serveurs)')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('ID de l\'utilisateur')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('addtoken')
        .setDescription('Ajoute un token user dans la configuration (owner only)')
        .addStringOption(option =>
            option.setName('token')
                .setDescription('Le token user à ajouter')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('removetoken')
        .setDescription('Supprime un token user de la configuration (owner only)')
        .addStringOption(option =>
            option.setName('token')
                .setDescription('Le token user à supprimer')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('listtoken')
        .setDescription('Affiche la liste des tokens configurés (owner only)')
];

const rest = new REST({ version: '10' }).setToken(config.tokenBot.trim());

// =====================================================
// CLIENT READY
// =====================================================

client.once('clientReady', async () => {
    console.log(`[Bot] Connecté ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commandes enregistrées.');
    } catch (error) { console.error(error); }

    setTimeout(async () => {
        const guild = client.guilds.cache.get(config.voiceGuildId);
        if (!guild) return console.log(`Guild introuvable : ${config.voiceGuildId}`);
        const channel = guild.channels.cache.get(config.voiceChannelId);
        if (!channel) return console.log(`Canal introuvable : ${config.voiceChannelId}`);
        if (channel.type !== ChannelType.GuildVoice) return console.log(`L'ID ${config.voiceChannelId} n'est pas un canal vocal !`);
        
        try {
            joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            
            setTimeout(async () => {
                const member = channel.guild.members.me;
                if (member) {
                    try { await member.voice.setDeaf(true); } catch (e) {}
                    try { 
                        await member.voice.setMute(true); 
                        console.log(`Bot connecté (muet + sourdine) dans ${channel.name}.`);
                    } catch (err) {
                        console.log(`Bot connecté (sourdine OK). Erreur pour le micro: ${err.message}`);
                    }
                }
            }, 1500);

        } catch (err) { console.error("Erreur Bot vocal :", err); }
    }, 5000);

    console.log("[System] Lancement du SelfBot en arrière-plan...");
    const selfBot = spawn('node', ['selfbot.js'], { stdio: 'inherit' });
    selfBot.on('error', (error) => console.error("Impossible de lancer selfbot.js :", error.message));
});

// =====================================================
// VOICE STATE UPDATE
// =====================================================

client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = newState.guild;
    if (!guild) return;
    const channel = guild.channels.cache.get(config.voiceChannelId);
    if (channel && channel.type === ChannelType.GuildVoice) {
        try {
            joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            setTimeout(async () => {
                const member = channel.guild.members.me;
                if (member) {
                    try { await member.voice.setDeaf(true); } catch (e) {}
                    try { await member.voice.setMute(true); } catch (e) {}
                }
            }, 1500);
        } catch (error) {
            console.error("Erreur rejoint vocal auto :", error);
        }
    }
});

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on('interactionCreate', async (interaction) => {
    // =====================================================
    // BOUTONS
    // =====================================================

    if (interaction.isButton()) {
        // Export des logs
        if (interaction.customId.startsWith('log_export_')) {
            const userId = interaction.customId.split('_')[2];
            let avatarURL = null;
            
            try {
                const user = await interaction.client.users.fetch(userId);
                avatarURL = user.displayAvatarURL({ dynamic: true, size: 256 });
            } catch (e) {}

            // Désactiver le bouton immédiatement
            try {
                await interaction.update({
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`log_export_${userId}`)
                                .setEmoji('<:136369file:1537403682436550656>')
                                .setLabel('Export en cours...')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setLabel('🖼️ Avatar')
                                .setStyle(ButtonStyle.Link)
                                .setURL(avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png')
                        )
                    ]
                });
            } catch (e) {
                console.log('⏳ Interaction déjà traitée, continuation...');
            }

            try {
                const data = fs.readFileSync('./datas/data.txt', 'utf8');
                const lines = data.split('\n').filter(line => line.includes(`ID: ${userId}`));
                
                if (lines.length === 0) {
                    return interaction.followUp({
                        content: '❌ Aucune donnée trouvée.',
                        ephemeral: true
                    });
                }

                const firstLine = lines[0];
                const userMatch = firstLine.match(/User: (.+?) \|/);
                const username = userMatch ? userMatch[1] : 'Inconnu';
                
                let displayName = null;
                let createdAt = null;
                
                try {
                    const user = await interaction.client.users.fetch(userId);
                    displayName = user.globalName || user.username;
                    createdAt = user.createdAt;
                } catch (e) {}

                const servers = new Set();
                for (const line of lines) {
                    const serverMatch = line.match(/Serveur: (.+?) \((\d+)\)/);
                    if (serverMatch) {
                        servers.add(`${serverMatch[1]} (${serverMatch[2]})`);
                    }
                }

                let content = `=== RAPPORT UTILISATEUR ===\n\n`;
                content += `📌 Nom d'utilisateur : ${username}\n`;
                content += `📝 Nom d'affichage : ${displayName || 'Non défini'}\n`;
                content += `🆔 ID : ${userId}\n`;
                if (createdAt) {
                    content += `📅 Compte créé le : ${createdAt.toLocaleString('fr-FR')}\n`;
                }
                content += `🖼️ Avatar : ${avatarURL || 'Non disponible'}\n`;
                content += `📊 Messages scrapés : ${lines.length}\n`;
                content += `🏠 Serveurs (${servers.size}) :\n`;
                servers.forEach(server => {
                    content += `   - ${server}\n`;
                });
                content += `\n=== DERNIERS MESSAGES ===\n\n`;
                lines.slice(0, 10).forEach(line => {
                    const msgMatch = line.match(/Message: (.+)$/);
                    if (msgMatch) {
                        content += `- ${msgMatch[1]}\n`;
                    }
                });
                if (lines.length > 10) {
                    content += `\n... et ${lines.length - 10} autres messages.\n`;
                }

                const buffer = Buffer.from(content, 'utf-8');
                const fileName = `user_${username}_${userId}_${Date.now()}.txt`;

                try {
                    await interaction.user.send({
                        content: `📊 **Rapport complet pour ${username}**`,
                        files: [{ attachment: buffer, name: fileName }]
                    });

                    await interaction.followUp({
                        content: '✅ Le rapport complet a été envoyé en MP.',
                        ephemeral: true
                    });
                } catch (error) {
                    await interaction.followUp({
                        content: '❌ Impossible d\'envoyer le fichier en MP. Vérifie tes paramètres de confidentialité.',
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('Erreur export logs:', error);
                await interaction.followUp({
                    content: '❌ Erreur lors de l\'export.',
                    ephemeral: true
                });
            }
            return;
        }
        return;
    }

    // =====================================================
    // COMMANDES SLASH
    // =====================================================

    if (!interaction.isChatInputCommand()) return;

    // =============================================
    // /HELP
    // =============================================

    if (interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor('#1D54FF')
            .setTitle('📖 Commandes disponibles')
            .setDescription(
                '```text\n' +
                '================================\n' +
                ' COMMANDES\n' +
                '================================\n\n' +
                '[/help] - Affiche cette aide\n' +
                '[/info <userid>] - Infos scrapées sur un utilisateur\n' +
                '[/log <userid>] - Informations complètes (avatar, serveurs, date de création)\n' +
                '[/alldb] - Envoie toute la base de données\n' +
                '[/allscrap] - Envoie les serveurs et utilisateurs scrapés\n' +
                '[/addtoken <token>] - Ajoute un token user (owner only)\n' +
                '[/removetoken <token>] - Supprime un token user (owner only)\n' +
                '[/listtoken] - Liste les tokens configurés (owner only)\n' +
                '```'
            )
            .setFooter({ text: 'discord.gg/xfind' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    // =============================================
    // /INFO
    // =============================================

    if (interaction.commandName === 'info') {
        const userId = interaction.options.getString('userid');
        try {
            const data = fs.readFileSync('./datas/data.txt', 'utf8');
            const lines = data.split('\n').filter(line => line.includes(userId));
            if (lines.length === 0) return interaction.reply({ content: `Aucune donnée scrapée trouvée pour l'ID : ${userId}`, ephemeral: true });
            const fileContent = lines.join('\n');
            const attachment = new AttachmentBuilder(Buffer.from(fileContent, 'utf8'), { name: `infos_${userId}.txt` });
            await interaction.reply({ files: [attachment], ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "Erreur de lecture du fichier data.txt.", ephemeral: true });
        }
        return;
    }

    // =============================================
    // /ALLDB
    // =============================================

    if (interaction.commandName === 'alldb') {
        try {
            const data = fs.readFileSync('./datas/data.txt', 'utf8');
            const attachment = new AttachmentBuilder(Buffer.from(data, 'utf8'), { name: `all_database.txt` });
            await interaction.reply({ files: [attachment], ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "Fichier data.txt introuvable ou vide.", ephemeral: true });
        }
        return;
    }

    // =============================================
    // /ALLSCRAP
    // =============================================

    if (interaction.commandName === 'allscrap') {
        try {
            const data = fs.readFileSync('./datas/data.txt', 'utf8');
            const lines = data.split('\n');
            const usersMap = new Map();
            const allServers = new Set();

            for (const line of lines) {
                const serverMatch = line.match(/Serveur: (.+?) \((\d+)\)/);
                const idMatch = line.match(/ID: (\d+)/);
                const userMatch = line.match(/User: (.+?) \|/);

                if (serverMatch) {
                    allServers.add(`${serverMatch[1]} (${serverMatch[2]})`);
                }

                if (idMatch && userMatch) {
                    const userId = idMatch[1];
                    const userName = userMatch[1];
                    const serverName = serverMatch ? serverMatch[1] : 'Inconnu';
                    const serverId = serverMatch ? serverMatch[2] : 'Inconnu';

                    if (!usersMap.has(userId)) {
                        usersMap.set(userId, { name: userName, servers: new Set() });
                    }
                    usersMap.get(userId).servers.add(`${serverName} (${serverId})`);
                }
            }

            if (usersMap.size === 0 && allServers.size === 0) return interaction.reply({ content: "Aucune donnée trouvée dans la base.", ephemeral: true });

            let result = "=== TOUS LES SERVEURS SCRAPÉS ===\n";
            for (const server of allServers) {
                result += `- ${server}\n`;
            }

            result += "\n=== UTILISATEURS ET LEURS SERVEURS ===\n";
            for (const [id, data] of usersMap) {
                const serversList = Array.from(data.servers).join(', ');
                result += `**${data.name}** (ID: ${id}) -> Serveurs: ${serversList}\n`;
            }

            const attachment = new AttachmentBuilder(Buffer.from(result, 'utf8'), { name: `scraped_servers_and_users.txt` });
            await interaction.reply({ files: [attachment], ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: "Erreur lors de la lecture du fichier.", ephemeral: true });
        }
        return;
    }

    // =============================================
    // /LOG
    // =============================================

    if (interaction.commandName === 'log') {
        const userId = interaction.options.getString('userid');
        
        try {
            const data = fs.readFileSync('./datas/data.txt', 'utf8');
            const lines = data.split('\n').filter(line => line.includes(`ID: ${userId}`));
            
            if (lines.length === 0) {
                return interaction.reply({
                    content: `❌ Aucune donnée trouvée pour l'ID : ${userId}`,
                    ephemeral: true
                });
            }

            const firstLine = lines[0];
            const userMatch = firstLine.match(/User: (.+?) \|/);
            const username = userMatch ? userMatch[1] : 'Inconnu';
            
            let user = null;
            let avatarURL = null;
            let displayName = null;
            let createdAt = null;
            let bannerURL = null;
            
            try {
                user = await interaction.client.users.fetch(userId);
                avatarURL = user.displayAvatarURL({ dynamic: true, size: 256 });
                displayName = user.globalName || user.username;
                createdAt = user.createdAt;
                bannerURL = user.bannerURL({ dynamic: true, size: 256 });
            } catch (e) {
                console.log(`Utilisateur ${userId} non trouvé sur Discord`);
            }

            const servers = new Set();
            for (const line of lines) {
                const serverMatch = line.match(/Serveur: (.+?) \((\d+)\)/);
                if (serverMatch) {
                    servers.add(`${serverMatch[1]} (${serverMatch[2]})`);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#1D54FF')
                .setTitle(`👤 ${displayName || username}`)
                .setDescription(`**ID :** ${userId}`)
                .setThumbnail(avatarURL || null)
                .addFields(
                    {
                        name: '📌 Nom d\'utilisateur',
                        value: username,
                        inline: true
                    },
                    {
                        name: '🆔 ID',
                        value: userId,
                        inline: true
                    }
                );

            if (displayName && displayName !== username) {
                embed.addFields({
                    name: '📝 Nom d\'affichage',
                    value: displayName,
                    inline: true
                });
            }

            if (createdAt) {
                embed.addFields({
                    name: '📅 Compte créé le',
                    value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F>`,
                    inline: true
                });
            }

            if (bannerURL) {
                embed.setImage(bannerURL);
            }

            if (servers.size > 0) {
                embed.addFields({
                    name: `🏠 Serveurs (${servers.size})`,
                    value: Array.from(servers).slice(0, 10).join('\n') + (servers.size > 10 ? `\n*+ ${servers.size - 10} autres...*` : ''),
                    inline: false
                });
            }

            embed.setFooter({ text: `Messages scrapés: ${lines.length}` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`log_export_${userId}`)
                    .setEmoji('<:136369file:1537403682436550656>')
                    .setLabel('Exporter')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setLabel('🖼️ Avatar')
                    .setStyle(ButtonStyle.Link)
                    .setURL(avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png')
            );

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

        } catch (error) {
            console.error('Erreur commande log:', error);
            await interaction.reply({
                content: '❌ Erreur lors de la récupération des données.',
                ephemeral: true
            });
        }
        return;
    }

    // =============================================
    // /ADDTOKEN
    // =============================================

    if (interaction.commandName === 'addtoken') {
        // ✅ Vérifier que l'utilisateur est le owner
        if (interaction.user.id !== '1524529412442292377') {
            return interaction.reply({
                content: '❌ Seul le propriétaire peut ajouter des tokens.',
                ephemeral: true
            });
        }

        const newToken = interaction.options.getString('token').trim();
        
        try {
            const configPath = './datas/config.json';
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Vérifier si le token existe déjà
            if (configData.tokenUserBot.includes(newToken)) {
                return interaction.reply({
                    content: '❌ Ce token est déjà dans la configuration.',
                    ephemeral: true
                });
            }

            // Ajouter le token
            configData.tokenUserBot.push(newToken);
            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

            await interaction.reply({
                content: `✅ Token ajouté ! (${configData.tokenUserBot.length} tokens au total)\n🔄 Redémarrage du bot dans 3 secondes...`,
                ephemeral: true
            });

            // Redémarrer le bot après 3 secondes
            setTimeout(() => {
                console.log('🔄 Redémarrage du bot...');
                process.exit(0);
            }, 3000);

        } catch (error) {
            console.error('Erreur addtoken:', error);
            await interaction.reply({
                content: '❌ Erreur lors de l\'ajout du token.',
                ephemeral: true
            });
        }
        return;
    }

    // =============================================
    // /REMOVETOKEN
    // =============================================

    if (interaction.commandName === 'removetoken') {
        // ✅ Vérifier que l'utilisateur est le owner
        if (interaction.user.id !== '1524529412442292377') {
            return interaction.reply({
                content: '❌ Seul le propriétaire peut supprimer des tokens.',
                ephemeral: true
            });
        }

        const tokenToRemove = interaction.options.getString('token').trim();
        
        try {
            const configPath = './datas/config.json';
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Vérifier si le token existe
            if (!configData.tokenUserBot.includes(tokenToRemove)) {
                return interaction.reply({
                    content: '❌ Ce token n\'existe pas dans la configuration.',
                    ephemeral: true
                });
            }

            // Supprimer le token
            configData.tokenUserBot = configData.tokenUserBot.filter(t => t !== tokenToRemove);
            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

            await interaction.reply({
                content: `✅ Token supprimé ! (${configData.tokenUserBot.length} tokens restants)\n🔄 Redémarrage du bot dans 3 secondes...`,
                ephemeral: true
            });

            // Redémarrer le bot après 3 secondes
            setTimeout(() => {
                console.log('🔄 Redémarrage du bot...');
                process.exit(0);
            }, 3000);

        } catch (error) {
            console.error('Erreur removetoken:', error);
            await interaction.reply({
                content: '❌ Erreur lors de la suppression du token.',
                ephemeral: true
            });
        }
        return;
    }

    // =============================================
    // /LISTTOKEN
    // =============================================

    if (interaction.commandName === 'listtoken') {
        // ✅ Vérifier que l'utilisateur est le owner
        if (interaction.user.id !== '1524529412442292377') {
            return interaction.reply({
                content: '❌ Seul le propriétaire peut voir les tokens.',
                ephemeral: true
            });
        }

        try {
            const configData = JSON.parse(fs.readFileSync('./datas/config.json', 'utf8'));
            const tokens = configData.tokenUserBot || [];

            if (tokens.length === 0) {
                return interaction.reply({
                    content: '📭 Aucun token configuré.',
                    ephemeral: true
                });
            }

            const tokenList = tokens.map((t, i) => 
                `${i + 1}. ${t.substring(0, 15)}...${t.substring(t.length - 5)}`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor('#1D54FF')
                .setTitle('📋 Tokens configurés')
                .setDescription(
                    '```text\n' +
                    `Total: ${tokens.length} tokens\n\n` +
                    tokenList +
                    '```'
                )
                .setFooter({ text: 'discord.gg/xfind' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('❌ Erreur listtoken:', error);
            await interaction.reply({
                content: '❌ Erreur lors de la lecture des tokens.',
                ephemeral: true
            });
        }
        return;
    }
});

// =====================================================
// AUTO-RESTART (fonctionne partout)
// =====================================================

const isRestarting = process.env.IS_RESTARTING === 'true';

if (!isRestarting) {
    const { spawn } = require('child_process');
    
    console.log('🔄 Mode auto-restart activé');
    console.log('📌 Utilisez /addtoken ou /removetoken pour redémarrer');
    
    function startBot() {
        const child = spawn('node', ['bot.js'], {
            env: { ...process.env, IS_RESTARTING: 'true' },
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log('🔄 Redémarrage du bot...');
                startBot();
            } else {
                console.log(`❌ Bot arrêté avec le code ${code}`);
                process.exit(code);
            }
        });

        child.on('error', (err) => {
            console.error('❌ Erreur du processus:', err);
        });
    }

    startBot();
} else {
    console.log('✅ Bot démarré en mode normal');
    client.login(config.tokenBot.trim());
}