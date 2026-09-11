/**
 * legalContent — the Privacy Policy and Terms of Service, as structured English content.
 *
 * These two documents are long-form legal text, not UI copy: they are read once, rarely, by a
 * person (or a Stripe reviewer) with no account, and they must stay word-for-word stable across
 * releases so the version a buyer saw at Checkout is the version we can point to later. Keeping
 * them here as sections of headings + blocks — instead of several hundred message-catalog keys —
 * keeps the catalog parity test meaningful for the UI strings it exists for, and keeps the legal
 * text reviewable in one place. Only the page chrome (titles, "Back to Lamplight", "Last updated")
 * goes through `useI18n`.
 *
 * Every statement here is grounded in what the product actually does (docs/security/README.md,
 * ADR-020/026/027, docs/runbooks/stripe-billing.md, docs/development/PRODUCT_ANALYTICS.md,
 * docs/runbooks/ses-production-access.md, apps/gm-react/src/cloud/google*.ts, ADR-021). Facts the
 * codebase cannot know — the legal entity, its address, a contact address, the governing law, the
 * effective date, and one retention decision — are `[BRACKETED PLACEHOLDERS]` that the operator
 * fills in before the pages go live. `LEGAL_PLACEHOLDERS` is the exhaustive list; the component test
 * fails if the prose drifts from it in either direction, so nothing can be half-filled silently.
 *
 * This text is not legal advice.
 */

export type LegalBlock = string | { list: string[] };

export interface LegalSection {
	heading: string;
	blocks: LegalBlock[];
}

export interface LegalDocument {
	id: 'privacy' | 'terms';
	/** Shown as "Last updated"; a placeholder until the operator sets the effective date. */
	lastUpdated: string;
	sections: LegalSection[];
}

/** Matches a `[BRACKETED PLACEHOLDER]`: upper-case words, digits, spaces and hyphens in brackets. */
export const PLACEHOLDER_PATTERN = /\[[A-Z][A-Z0-9 -]*\]/g;

/** The only placeholders either document may contain — the operator's fill-in checklist. */
export const LEGAL_PLACEHOLDERS = [
	'[LEGAL ENTITY NAME]',
	'[MAILING ADDRESS]',
	'[CONTACT EMAIL]',
	'[GOVERNING LAW JURISDICTION]',
	'[EFFECTIVE DATE]',
	'[POST-CANCELLATION CLOUD RETENTION PERIOD]',
] as const;

/** Every distinct placeholder token that appears anywhere in a document, in first-seen order. */
export function collectPlaceholders(doc: LegalDocument): string[] {
	const seen = new Set<string>();
	const scan = (text: string) => {
		for (const match of text.match(PLACEHOLDER_PATTERN) ?? []) seen.add(match);
	};
	scan(doc.lastUpdated);
	for (const section of doc.sections) {
		scan(section.heading);
		for (const block of section.blocks) {
			if (typeof block === 'string') scan(block);
			else block.list.forEach(scan);
		}
	}
	return [...seen];
}

const OPERATOR = '[LEGAL ENTITY NAME]';
const CONTACT = '[CONTACT EMAIL]';

export const PRIVACY_POLICY: LegalDocument = {
	id: 'privacy',
	lastUpdated: '[EFFECTIVE DATE]',
	sections: [
		{
			heading: 'Who this covers',
			blocks: [
				`Lamplight is a tabletop role-playing campaign manager run by ${OPERATOR} ("we", "us"). It runs in your browser at lamplight.click, as a desktop app, and as an Android app. This policy explains what data the app handles, where that data lives, and what choices you have. It applies to everyone who uses the app, whether or not they have an account.`,
				'The short version: Lamplight is local-first. With no account and nothing switched on, your campaign never leaves your device. Every networked feature is optional, is off until you turn it on, and is described below with exactly what it sends.',
			],
		},
		{
			heading: 'Data that stays on your device',
			blocks: [
				"Your campaign — scenes, characters, notes, maps, handouts, audio settings, the whole vault — is stored in the app's own database on your device (the browser's IndexedDB on the web, the app's private storage on desktop and Android). It is not sent anywhere unless you enable a feature that needs it.",
				'The app also keeps a few preferences on the device: language, theme, whether you have completed first-run setup, the vault privacy mode you chose, and, if you tried a plan preview, that choice. None of these are sent to us.',
				'If you export a local vault backup or a diagnostics bundle, the file is written where you tell the device to save it. We never receive it.',
			],
		},
		{
			heading: 'Your account (optional)',
			blocks: [
				'You can use Lamplight without an account. If you create one, we store the following with our identity provider, Amazon Cognito, in the AWS Canada (Central) region:',
				{
					list: [
						'the email address you sign up with and a password (stored hashed by Cognito; we never see it),',
						'the display name you set in your profile,',
						'a list of the devices you have signed in from (the device name and when it was last used), so you can review and sign them out,',
						'the plan on your account (Hearth, Lantern or Beacon) and, if you subscribe, the Stripe subscription it is tied to,',
						'campaign invitations you have created: the address you invited, the role you offered, the campaign name, and the expiry (14 days). An account holds at most 50 active invitations,',
						'the metadata of anything you have published: marketplace listings and campaign wikis (see "Content you publish").',
					],
				},
				"Sign-in tokens are kept in the operating system's credential store on desktop (Electron safeStorage) and in encrypted preferences protected by the Android Keystore on Android. On the web they live only for the browser session. They are never written into your vault, your backups, or logs.",
				'You can download your account record at any time from Settings → Account. It contains your profile, plan, invitations, and published-content metadata. It cannot contain your campaign, because we do not have it in readable form.',
			],
		},
		{
			heading: 'Cloud backup and the two vault privacy modes',
			blocks: [
				'Cloud backup is off by default and is part of the paid plans. When you first set the app up you choose a privacy mode for your vault. There is no preset; you can change it later in Settings → Sync.',
				'Private vault (end-to-end encrypted). Your campaign is encrypted on your device with AES-256-GCM before anything is uploaded, and the keys exist only on your devices. Our servers store the encrypted data plus the minimum needed to move it around: a vault identifier, the participant identifiers that may access it, revision numbers, the size of each encrypted record, content hashes of encrypted assets, and the time each record arrived. We cannot read your campaign and we cannot recover it for you. If you lose every device without exporting a recovery key (Settings → Sync), the cloud copy is unrecoverable. Media files stored on your device are not included in the cloud copy.',
				'Cloud-Enhanced vault. Choosing this mode records your consent for future features that need the service to read your campaign (campaign AI, cloud search, opening your campaign from any browser). Those features have not shipped. Today a Cloud-Enhanced vault is still stored end-to-end encrypted exactly like a Private one. Before any server-readable storage goes live we will update this policy and the description of the mode in the app, and content already stored encrypted will not be made readable without a further explicit action from you.',
				'Deleting your account deletes the encrypted cloud copy. Nothing about the cloud copy affects the campaign stored on your device.',
			],
		},
		{
			heading: 'Remote play',
			blocks: [
				"On a local network, the DM's device and each player's device connect to each other directly (WebRTC). No server is involved and nothing is stored anywhere.",
				"Internet play, part of the paid plans, uses two small relay services we run: a signaling relay that passes connection offers between devices, and a TURN relay that carries the connection when the devices cannot reach each other directly. The signaling relay only ever sees connection codes that are already encrypted, and the TURN relay only ever carries the encrypted WebRTC stream. Neither can read session content. Players in either mode receive only the player-safe view the DM's device builds for them; DM-only and hidden content never leaves the DM's device.",
			],
		},
		{
			heading: 'Content you publish (public by intent)',
			blocks: [
				'Two features exist to share content with other people, and content you put through them is stored unencrypted on our servers because you asked for it to be readable:',
				{
					list: [
						'Marketplace listings. A module you publish — its name, summary, version, and the package itself — is shown to everyone browsing Discover.',
						'Campaign wikis (a Beacon feature). The player-visible pages you publish are served at a link you control. You choose whether the wiki is public (anyone with the link, and search engines may index it), unlisted (anyone with the link), or password-protected (readers enter a password you set).',
					],
				},
				'Your account identifier is never shown to readers. You can unpublish either at any time from the app, and deleting your account removes everything you published.',
			],
		},
		{
			heading: 'Billing through Stripe',
			blocks: [
				"Paid plans are sold on the web app and billed by Stripe. Checkout and billing management happen on Stripe-hosted pages. Card numbers, bank details and billing addresses are entered on Stripe's pages and go to Stripe only; our code and our servers never receive them. Stripe's handling of that data is governed by Stripe's own privacy policy.",
				'What we receive from Stripe, through signed webhook events, is the minimum needed to turn a subscription into a plan: a Stripe customer identifier linked to your account, the subscription identifier and its status, which price it is on, and the dates of the current billing period. Stripe sends payment receipts and refund notices by email itself.',
				'When you delete your account we delete the Stripe customer record first, which cancels any active subscription, and the deletion stops if that step cannot be confirmed — so a deleted account can never keep being charged.',
			],
		},
		{
			heading: 'Email',
			blocks: [
				'We send email only when you or someone you know just did something that needs it, from accounts@lamplight.click via Amazon SES:',
				{
					list: [
						'a verification code when you sign up, and a reset code when you ask to reset your password,',
						'one invitation message when a signed-in user invites an address to their campaign. The message tells the recipient to ignore it if they were not expecting it, and the link expires after 14 days.',
					],
				},
				'We send no marketing, newsletters or digests, and we never buy, rent or scrape email addresses. An address that bounces or that reports a message as spam is automatically added to a suppression list so it receives nothing further. Account email stops when the account is deleted.',
			],
		},
		{
			heading: 'Usage analytics (off by default)',
			blocks: [
				'Nothing about how you use the app leaves the device unless you turn on Settings → Sync & privacy → Product analytics. While it is off, nothing is sent — not on launch and not on close.',
				'If you turn it on, the app sends counts of a fixed list of events (the app was launched, a top-level screen was viewed, a broad feature category was used, a cloud capability changed state, an error of a given category occurred) together with the app version, rounded to major.minor, and whether you use the web or the desktop app. There is no user, device or session identifier of any kind, so two events cannot be tied together, and no free text can be sent — the list of events is fixed in the app and shown to you on the same settings screen. The service keeps only aggregate counters; the short-lived logs it writes while counting are deleted automatically after 14 days. You can turn it off at any time and sending stops immediately.',
			],
		},
		{
			heading: 'Services you choose to connect',
			blocks: [
				'Some features send data directly from your device to a third party you have authorised. We are not in the path and do not receive that data.',
				{
					list: [
						'Google Docs. If you connect Google Docs, the app asks Google for access only to documents it creates for you (the "drive.file" permission) and uses that to import from and write back to those documents. Google\'s privacy policy applies to your Google account.',
						'Google Calendar. If you schedule a session through Google Calendar, the app creates an event containing the session title, the time, the attendee addresses you enter and any note you type — never campaign content. It uses a separate, narrowly scoped permission ("calendar.events").',
						'AI assistants. The assistant only works with a provider you configure yourself: your own API key for Anthropic or any OpenAI-compatible service, or a local model on your machine. Text you send to the assistant travels from your device to that provider under its terms; we do not proxy it and we ship no key of our own.',
					],
				},
				'Google access tokens are kept in memory and the browser session only and are forgotten when the tab closes. Your AI provider key is stored on the device you enter it on.',
			],
		},
		{
			heading: 'Service logs',
			blocks: [
				'Like any web service, our servers record technical details of requests (such as the time, the route called, the response status and an IP address) so we can keep the service running and detect abuse. These logs never contain campaign content, which reaches our servers only encrypted or as content you chose to publish. They are kept for a limited time and then deleted automatically.',
			],
		},
		{
			heading: 'Who processes data for us',
			blocks: [
				{
					list: [
						'Amazon Web Services, in the Canada (Central) region: identity (Cognito), storage (DynamoDB and S3), serverless functions, email delivery (SES), and the remote-play relays. Everything we store is stored there.',
						'Stripe, for payments and subscriptions, as described above.',
						'Google, only if you connect Google Docs or Google Calendar.',
						'The AI provider you configure, only if you use the assistant.',
					],
				},
				'We do not sell personal data, we do not share it with advertisers or data brokers, and we use no advertising or tracking networks.',
			],
		},
		{
			heading: 'Deleting your data',
			blocks: [
				"Your device: campaigns on a device are yours to keep or remove. Deleting the app's data in your browser, or uninstalling the desktop or Android app, removes them; export a local backup first if you want to keep them.",
				'Your account: Settings → Account → Delete account removes, in order, your Stripe customer record and any subscription, the encrypted cloud copy, your invitations, your published content, your plan record, and finally the sign-in itself. Each step must be confirmed before the next one runs, and the deletion stops so you can retry if any step cannot be confirmed. This cannot be undone. Campaigns on your devices are not touched.',
				'Suppressed email addresses (bounces and complaints) are kept on the suppression list so we do not email them again.',
			],
		},
		{
			heading: 'Children',
			blocks: [
				'Lamplight is not directed at children. You must be at least 13 years old — or older where the law where you live sets a higher age for consenting to a service like this, for example 16 in much of the European Union — to create an account. We do not knowingly collect personal data from anyone below that age; if you believe a child has created an account, contact us and we will delete it.',
			],
		},
		{
			heading: 'Security',
			blocks: [
				"The controls above — end-to-end encryption with keys only you hold, credential storage in the operating system's secure store, relays that carry only encrypted traffic, and card data that never reaches us — are the substance of how we protect your data. No system is perfectly secure, and a Private vault's safety also depends on you keeping your devices and your recovery key safe. Security concerns can be reported to us at the contact below.",
			],
		},
		{
			heading: 'Changes to this policy',
			blocks: [
				'When we change this policy we change the "Last updated" date at the top of this page. If a change materially affects what we collect or how we use it — in particular, when server-readable Cloud-Enhanced features go live — we will also tell you in the app before the change takes effect.',
			],
		},
		{
			heading: 'Contact',
			blocks: [`${OPERATOR}`, '[MAILING ADDRESS]', `${CONTACT}`],
		},
	],
};

export const TERMS_OF_SERVICE: LegalDocument = {
	id: 'terms',
	lastUpdated: '[EFFECTIVE DATE]',
	sections: [
		{
			heading: 'The agreement',
			blocks: [
				`These terms are an agreement between you and ${OPERATOR} ("we", "us") about your use of Lamplight: the web app at lamplight.click, the desktop app, the Android app, and the online services behind them. By using Lamplight you accept these terms. If you do not accept them, do not use it.`,
				'Our Privacy Policy explains what data the app handles and is part of this agreement.',
			],
		},
		{
			heading: 'What Lamplight is',
			blocks: [
				'Lamplight is a campaign manager for tabletop role-playing games: scenes, characters, notes, maps, handouts, session tools and a player view. It is local-first — the app and your campaign live on your device and work without an account or a connection. Online features are optional additions: an account, encrypted cloud backup, internet remote play, campaign invitations, a module marketplace, and published campaign wikis.',
			],
		},
		{
			heading: 'Your account',
			blocks: [
				'An account is optional. If you create one, give us a working email address, keep your password to yourself, and tell us if you think someone else has used your account. You are responsible for what happens under your sign-in. One person per account; do not share it.',
				'You must be at least 13 years old to create an account, or older where the law where you live requires it for a service like this.',
			],
		},
		{
			heading: 'Plans, subscriptions and billing',
			blocks: [
				'Hearth is the free plan: the full local app, with no account required. Lantern and Beacon are paid subscriptions that add hosted services — encrypted off-device backup, internet play, co-DM seats, and, on Beacon, campaign publishing. What each plan includes is listed on the Plans & cloud page in the app and may be extended over time.',
				{
					list: [
						'Prices are shown in US dollars, monthly or annual, and are billed by Stripe on Stripe-hosted pages. Taxes may be added where they apply.',
						'Subscriptions renew automatically at the end of each billing period until you cancel.',
						"You can cancel at any time from Settings → Subscription → Manage billing, which opens the Stripe billing portal. Cancelling takes effect at the end of the current period: you keep the plan's features until then and are not charged again.",
						"If we change a plan's price, the new price applies from your next renewal after we have told you, and you can cancel before then.",
						'If a renewal payment fails, Stripe retries it for a while; if it still fails, the subscription is cancelled and your account returns to the free plan.',
						'Refunds are handled case by case. If something went wrong, write to us at [CONTACT EMAIL] with the email address on your account and we will look at it.',
						'Subscribing is available in the web app only. The desktop and Android apps show your plan but do not sell anything; a plan bought on the web is active on every device you sign in to.',
					],
				},
				'When a paid plan ends, features that need it stop working and the local app keeps working exactly as before. The encrypted cloud copy of your vault is kept for [POST-CANCELLATION CLOUD RETENTION PERIOD] after the plan ends and then deleted, unless you subscribe again or delete your account sooner. Keep a local backup; the app can export one at any time.',
			],
		},
		{
			heading: 'Your content',
			blocks: [
				'Everything you create in Lamplight is yours. You give us only the permission we need to do what you ask the app to do with it: store an encrypted copy, relay it to your players, or show what you publish to the people you publish it to. We do not use your content for anything else, and for a Private vault we could not, because we cannot read it.',
				"You are responsible for having the rights to what you store and share. That matters most for what you publish: a marketplace listing or a campaign wiki is public by intent, and you must not publish material you do not have the right to distribute — for example other publishers' rulebooks, artwork or adventures, or anything that would infringe a copyright, trademark or licence. If we receive a credible notice that published content infringes someone's rights, we may remove it and tell you why.",
			],
		},
		{
			heading: 'Acceptable use',
			blocks: [
				'Do not use Lamplight to:',
				{
					list: [
						"publish or share content that is unlawful, that infringes someone else's rights, or that harasses or threatens people;",
						'publish a module or package that contains malicious code or that is designed to mislead the people who install it;',
						'send invitations to people who have not asked for them, or otherwise use the invitation feature to send unwanted mail;',
						"work around plan entitlements, the app's security controls, or another user's privacy settings;",
						'probe, overload, or disrupt the service, or scrape published content in bulk.',
					],
				},
				'We may remove content, suspend an account, or refuse service to enforce this section.',
			],
		},
		{
			heading: 'Third-party services',
			blocks: [
				"Payments are handled by Stripe under Stripe's terms. If you connect Google Docs or Google Calendar, or configure an AI provider for the assistant, those services are governed by their own terms and you are responsible for your agreement with them. We do not run them and are not responsible for them.",
			],
		},
		{
			heading: 'Availability and backups',
			blocks: [
				'Lamplight is a small, independently run service. The local app is designed to keep working whether or not our services are reachable, but online features may be interrupted, changed or withdrawn, and we do not promise any particular level of availability.',
				'You are responsible for keeping backups of your campaigns. The app can export a local backup at any time. For a Private vault, cloud backup is only ever recoverable with keys held on your devices: if you lose every device without having exported a recovery key, nobody — including us — can restore that copy.',
			],
		},
		{
			heading: 'No warranty',
			blocks: [
				'Lamplight is provided "as is" and "as available". To the fullest extent the law allows, we make no warranties of any kind, express or implied, including about merchantability, fitness for a particular purpose, or that the service will be uninterrupted, error-free or secure. Some jurisdictions do not allow these exclusions; where that is the case, they apply only as far as the law permits.',
			],
		},
		{
			heading: 'Limitation of liability',
			blocks: [
				'To the fullest extent the law allows, we are not liable for any indirect, incidental, special, consequential or punitive damages, or for lost data, lost profits or lost campaigns, arising from your use of Lamplight or your inability to use it. Our total liability to you for any claim relating to Lamplight is limited to the amount you paid us in the twelve months before the claim arose, or, if you paid nothing, to nothing. Nothing in these terms limits liability that cannot be limited by law.',
			],
		},
		{
			heading: 'Ending the agreement',
			blocks: [
				'You can stop using Lamplight at any time, and you can delete your account at any time from Settings → Account. Deleting your account cancels any subscription and removes your cloud data as described in the Privacy Policy; campaigns on your devices are untouched.',
				'We may suspend or terminate your account if you break these terms, if the law requires it, or if we wind down the online services. If we wind them down, we will give reasonable notice so you can export what you need. Sections about your content, disclaimers, limitation of liability and governing law survive the end of this agreement.',
			],
		},
		{
			heading: 'Changes to these terms',
			blocks: [
				'We may update these terms. When we do, we change the "Last updated" date on this page and, for changes that materially affect you, tell you in the app before they take effect. Continuing to use Lamplight after a change means you accept the updated terms; if you do not, stop using the service and delete your account.',
			],
		},
		{
			heading: 'Governing law',
			blocks: [
				'These terms are governed by the laws of [GOVERNING LAW JURISDICTION], without regard to its conflict-of-law rules, and any dispute will be brought in the courts there. If you are a consumer, you keep any protections the law of the place where you live gives you that cannot be waived by agreement.',
			],
		},
		{
			heading: 'Contact',
			blocks: [`${OPERATOR}`, '[MAILING ADDRESS]', `${CONTACT}`],
		},
	],
};

export const LEGAL_DOCUMENTS: Record<LegalDocument['id'], LegalDocument> = {
	privacy: PRIVACY_POLICY,
	terms: TERMS_OF_SERVICE,
};
