import { sendAccountPullDM, startBot } from "./bot";
import { startAccountPullNotificationWorker } from "./account-pull-notifications";
import { startImapWorker } from "./imap-worker";
import { startMemberCleanupWorker } from "./member-cleanup";

async function main() {
	await startBot();
	startAccountPullNotificationWorker(sendAccountPullDM);
	startImapWorker();
	startMemberCleanupWorker();
}

main().catch((error) => {
	console.error("worker failed to start", error);
	process.exit(1);
});