// SES receipt-rule Lambda action for support@. The rule's S3 action has already stored the message
// under `${INBOUND_PREFIX}${messageId}`; this reads it back and sends it on to FORWARD_TO.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { rewriteForForward } from './rewrite.mjs';

const s3 = new S3Client({});
const ses = new SESv2Client({});
const { INBOUND_BUCKET, INBOUND_PREFIX, SUPPORT_ADDRESS, FORWARD_TO } = process.env;

export async function handler(event) {
	for (const record of event.Records ?? []) {
		const { mail, receipt } = record.ses;
		// SES scans every message for this rule. Spam and viruses stop here; they stay in the bucket
		// until its expiry in case a false positive needs reading.
		if (receipt.spamVerdict?.status === 'FAIL' || receipt.virusVerdict?.status === 'FAIL') {
			console.log(
				JSON.stringify({
					dropped: mail.messageId,
					spam: receipt.spamVerdict?.status,
					virus: receipt.virusVerdict?.status,
				}),
			);
			continue;
		}
		const stored = await s3.send(
			new GetObjectCommand({ Bucket: INBOUND_BUCKET, Key: `${INBOUND_PREFIX}${mail.messageId}` }),
		);
		const raw = Buffer.from(await stored.Body.transformToByteArray());
		await ses.send(
			new SendEmailCommand({
				FromEmailAddress: SUPPORT_ADDRESS,
				Destination: { ToAddresses: [FORWARD_TO] },
				Content: { Raw: { Data: rewriteForForward(raw, { supportAddress: SUPPORT_ADDRESS }) } },
			}),
		);
		console.log(JSON.stringify({ forwarded: mail.messageId }));
	}
}
