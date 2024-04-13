import Artibot, { Global, Module, log } from "artibot";
import Localizer from "artibot-localizer";
import { createRequire } from 'module';
import path, { join } from "path";
import { fileURLToPath } from "url";
import { Client, GuildTextBasedChannel, EmbedBuilder, GuildBasedChannel, PermissionsBitField } from "discord.js";
export * from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

/**
 * TikTok Module for Artibot
 * @author GoudronViande24
 * @license MIT
 */
export default new Module({
	id: "tiktok",
	name: "TikTok",
	version,
	langs: ["fr", "en"],
	repo: "GoudronViande24/artibot-tiktok",
	packageName: "artibot-tiktok",
	parts: [
		new Global({
			id: "tiktok",
			mainFunction: execute
		})
	]
});


/** Main function for this module */
async function execute(artibot: Artibot): Promise<void> {
	const { client, config, config: { lang }, createEmbed } = artibot;
	const localizer: Localizer = new Localizer({
		filePath: join(__dirname, "../locales.json"),
		lang
	});

	const invalidConfig = () => log("TikTok", localizer._("Config is invalid"), "err");

	// Check if config is correct
	if (!config.tiktok) return log("TikTok", localizer._("Cannot load config"), "err");
	if (!config.tiktok.checkInterval || config.tiktok.checkInterval < 30000) config.tiktok.checkInterval = 60000;
	if (!config.tiktok.notificationChannels || typeof config.tiktok.notificationChannels != "object" || !config.tiktok.notificationChannels.length) return invalidConfig();
	if (!config.tiktok.accounts || typeof config.tiktok.accounts != "object" || !config.tiktok.accounts.length) return invalidConfig();
	if (!config.tiktok.mentions || typeof config.tiktok.mentions != "object") config.tiktok.mentions = {};

	let targetChannels: GuildTextBasedChannel[] = [];

	const syncServerList = async (): Promise<void> => {
		log("TikTok", localizer._("Updating channels"));
		targetChannels = [];

		for (const guild of client!.guilds.cache.values()) {
			let channel: GuildBasedChannel | undefined = guild.channels.cache.find(c =>
				(config.tiktok.notificationChannels as string[]).includes(c.name.toLowerCase()) && c.isTextBased()
			);

			if (!channel) {
				log("TikTok", localizer.__("Configuration error: The server [[0]] does not have a notification channel!", { placeholders: [guild.name] }));
				continue;
			}

			log('TwitchMonitor', localizer.__(" --> for the [[0]] server, the announcements channel is #[[1]]", { placeholders: [guild.name, channel.name] }));

			if (!channel.permissionsFor(guild.members.me!).has(PermissionsBitField.Flags.SendMessages))
				log('TwitchMonitor', localizer.__("Configuration error: The bot does not have SEND_MESSAGES permission in #[[0]] channel on [[1]] server. The announcements will not be sent.", { placeholders: [channel.name, guild.name] }));
		}
	};

	// Init list of connected servers, and determine which channels we are announcing to
	syncServerList(true);

	// Activity updater
	class StreamActivity {
		static discordClient: Client<true>;
		static onlineChannels: {
			[key: string]: Stream;
		};

		/** Registers a channel that has come online, and updates the user activity. */
		static setChannelOnline(stream: Stream) {
			this.onlineChannels[stream.user_name] = stream;
		}

		/** Marks a channel has having gone offline, and updates the user activity if needed. */
		static setChannelOffline(stream: Stream) {
			delete this.onlineChannels[stream.user_name];
		}

		static init(discordClient: Client<true>) {
			this.discordClient = discordClient;
			this.onlineChannels = {};
		}
	}

	// ---------------------------------------------------------------------------------------------------------------------
	// Live events

	const liveMessageDb: MiniDb = new MiniDb('live-messages', localizer);
	let messageHistory: any = liveMessageDb.get("history") || {};

	TikTok.onChannelLiveUpdate((streamData: Stream): boolean => {
		const isLive: boolean = streamData.type === "live";

		// Refresh channel list
		try {
			syncServerList(false);
		} catch (e) { };

		// Update activity
		StreamActivity.setChannelOnline(streamData);

		// Generate message
		const msgFormatted: string = localizer.__("**[[0]]** is live on Twitch!", { placeholders: [streamData.user_name] });
		const msgEmbed: EmbedBuilder = LiveEmbed.createForStream(streamData, localizer, artibot);

		// Broadcast to all target channels
		let anySent: boolean = false;

		for (let i = 0; i < targetChannels.length; i++) {
			const discordChannel = targetChannels[i];
			const liveMsgDiscrim = `${discordChannel.guild.id}_${discordChannel.name}_${streamData.id}`;

			if (discordChannel) {
				try {
					// Either send a new message, or update an old one
					let existingMsgId = messageHistory[liveMsgDiscrim] || null;

					if (existingMsgId) {
						// Fetch existing message
						discordChannel.messages.fetch(existingMsgId)
							.then((existingMsg) => {
								existingMsg.edit({
									content: msgFormatted,
									embeds: [msgEmbed]
								}).then(() => {
									// Clean up entry if no longer live
									if (!isLive) {
										delete messageHistory[liveMsgDiscrim];
										liveMessageDb.put('history', messageHistory);
									}
								});
							})
							.catch((e) => {
								// Unable to retrieve message object for editing
								if (e.message === "Unknown Message") {
									// Specific error: the message does not exist, most likely deleted.
									delete messageHistory[liveMsgDiscrim];
									liveMessageDb.put('history', messageHistory);
									// This will cause the message to be posted as new in the next update if needed.
								}
							});
					} else {
						// Sending a new message
						if (!isLive) {
							// We do not post "new" notifications for channels going/being offline
							continue;
						}

						// Expand the message with a @mention for "here" or "everyone"
						// We don't do this in updates because it causes some people to get spammed
						let mentionMode = (config.twitch.mentions && config.twitch.mentions[streamData.user_name.toLowerCase()]) || null;

						if (mentionMode) {
							mentionMode = mentionMode.toLowerCase();

							if (mentionMode === "everyone" || mentionMode === "here") {
								// Reserved @ keywords for discord that can be mentioned directly as text
								mentionMode = `@${mentionMode}`;
							} else {
								// Most likely a role that needs to be translated to <@&id> format
								let roleData = discordChannel.guild.roles.cache.find((role) => {
									return (role.name.toLowerCase() === mentionMode);
								});

								if (roleData) {
									mentionMode = `<@&${roleData.id}>`;
								} else {
									log("TikTok", localizer.__("Cannot tag [[0]] role (role not found on server [[1]])", { placeholders: [mentionMode, discordChannel.guild.name] }));
									mentionMode = null;
								}
							}
						}

						let msgToSend = msgFormatted;

						if (mentionMode) {
							msgToSend = msgFormatted + ` ${mentionMode}`
						}

						discordChannel.send({
							content: msgToSend,
							embeds: [msgEmbed]
						})
							.then((message) => {
								log('TikTok', localizer.__("Announcement sent in #[[0]] on [[1]]", { placeholders: [discordChannel.name, discordChannel.guild.name] }));

								messageHistory[liveMsgDiscrim] = message.id;
								liveMessageDb.put('history', messageHistory);
							})
							.catch((err) => {
								log('TikTok', localizer.__("Cannot send the announcement in #[[0]] on [[1]]: [[2]]", {
									placeholders: [
										discordChannel.name,
										discordChannel.guild.name,
										err.message
									]
								}));
							});
					}

					anySent = true;
				} catch (e) {
					log('TikTok', localizer._("An error occured while sending the message: ") + e, "warn");
				}
			}
		}

		liveMessageDb.put('history', messageHistory);
		return anySent;
	});

	TikTok.onChannelOffline(StreamActivity.setChannelOffline);

	// Keep our activity in the user list in sync
	StreamActivity.init(client!);

	// Begin Twitch API polling
	TikTok.start();

	client!.on("guildCreate", () => {
		syncServerList(true);
	});

	client!.on("guildDelete", () => {
		syncServerList(true);
	});
}

/** Check if arrays have equal values */
export function hasEqualValues(a: any[], b: any[]): boolean {
	if (a.length !== b.length) return false;

	a.sort();
	b.sort();

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}

	return true;
}