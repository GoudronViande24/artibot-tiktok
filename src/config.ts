import { Snowflake, ColorResolvable } from "discord.js";

export type ArtibotTikTokMention = "everyone" | "here" | Snowflake;

export class ArtibotTikTokConfigBuilder {
	checkInterval: number = 300000;
	notificationChannels: string[] = [];
	accounts: string[] = [];
	mentions: {
		[key: string]: ArtibotTikTokMention;
	} = {};
	showThumbnail: boolean = true;
	showImage: boolean = true;
	embedColor?: ColorResolvable;

	/** Set how much time (in milliseconds) between checking for new posts */
	public setCheckInterval(checkInterval: number): this {
		this.checkInterval = checkInterval;
		return this;
	}

	/** Set the channels where the notifications will be sent */
	public setNotificationChannels(notificationChannels: string[]): this {
		this.notificationChannels = notificationChannels;
		return this;
	}

	/** Add a channel where the notifications will be sent */
	public addNotificationChannel(notificationChannel: string): this {
		this.notificationChannels.push(notificationChannel);
		return this;
	}

	/** Set the accounts to check for new posts */
	public setAccounts(accounts: string[]): this {
		this.accounts = accounts;
		return this;
	}

	/** Add an account to check for new posts */
	public addAccount(account: string, mention?: ArtibotTikTokMention): this {
		this.accounts.push(account);
		if (mention) this.mentions[account] = mention;
		return this;
	}

	/** Add accounts to check for new posts */
	public addAccounts(...accounts: string[]): this {
		this.accounts.push(...accounts);
		return this;
	}

	/** Set the mention to use when a channel goes live */
	public setMention(account: string, mention: ArtibotTikTokMention): this {
		this.mentions[account] = mention;
		return this;
	}

	/** Enable or disable the thumbnail */
	public setShowThumbnail(showThumbnail: boolean): this {
		this.showThumbnail = showThumbnail;
		return this;
	}

	/** Enable the thumbnail */
	public enableThumbnail(): this {
		this.showThumbnail = true;
		return this;
	}

	/** Disable the thumbnail */
	public disableThumbnail(): this {
		this.showThumbnail = false;
		return this;
	}

	/** Enable or disable the image */
	public setShowImage(showImage: boolean): this {
		this.showImage = showImage;
		return this;
	}

	/** Enable the image */
	public enableImage(): this {
		this.showImage = true;
		return this;
	}

	/** Disable the image */
	public disableImage(): this {
		this.showImage = false;
		return this;
	}

	/** Set the color of the new post embed */
	public setColor(color: ColorResolvable): this {
		this.embedColor = color;
		return this;
	}
}